-- =====================================================================
-- Reglas de negocio. Toda la lógica que decide estados vive aquí, en
-- la base de datos, para que la app no pueda saltarse ninguna regla.
--
-- Funciones llamables desde la app (rol authenticated):
--   request_casual_match, respond_to_match, confirm_arrival,
--   submit_feedback, set_paused, get_match_card, get_booking,
--   my_cycle_status
-- Funciones solo del backend (service_role):
--   propose_weekly_matches, curator_approve, curator_discard,
--   mark_payment_paid, publish_booking, run_maintenance
-- =====================================================================

-- ---------------------------------------------------------------------
-- Horarios
-- ---------------------------------------------------------------------
create or replace function local_tz() returns text
language sql stable as $$ select setting('timezone') #>> '{}' $$;

-- Relación formal e íntima: próximos viernes y sábado a las 7 pm.
-- week_offset = 1 para el segundo intento (semana siguiente).
create or replace function weekly_slot_options(from_ts timestamptz, week_offset int default 0)
returns timestamptz[] language plpgsql stable as $$
declare
  tz   text := local_tz();
  base date := (from_ts at time zone tz)::date;
  s    jsonb;
  d    date;
  out_ timestamptz[] := '{}';
begin
  for s in select * from jsonb_array_elements(setting('weekly_slots')) loop
    d := base + (((s->>'dow')::int - extract(dow from base)::int + 7) % 7);
    if d <= base then d := d + 7; end if;
    d := d + 7 * week_offset;
    out_ := out_ || ((d + (s->>'time')::time) at time zone tz);
  end loop;
  return out_;
end $$;

-- Noche casual: hoy (si da tiempo) o mañana.
create or replace function casual_slot_options(from_ts timestamptz)
returns timestamptz[] language plpgsql stable as $$
declare
  tz    text := local_tz();
  t     time := (setting('casual_slot_time') #>> '{}')::time;
  lead_ interval := make_interval(hours => (setting('casual_min_lead_hours') #>> '{}')::int);
  today date := (from_ts at time zone tz)::date;
  hoy   timestamptz := (today + t) at time zone tz;
  out_  timestamptz[] := '{}';
begin
  if hoy - from_ts >= lead_ then out_ := out_ || hoy; end if;
  out_ := out_ || ((today + 1 + t) at time zone tz);
  return out_;
end $$;

-- ---------------------------------------------------------------------
-- Elegibilidad
-- ---------------------------------------------------------------------
-- Un usuario puede recibir un match si está activo, verificado, no
-- suspendido, tiene fotos y forma de pago, no tiene un match abierto y
-- ya dio feedback de su última cita.
create or replace function is_eligible(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = uid
      and p.status = 'active'
      and p.identity_verified
      and (p.suspended_until is null or p.suspended_until < now())
      and (select count(*) from photos f where f.profile_id = p.id) >= 5
      and exists (select 1 from payment_methods pm where pm.profile_id = p.id)
  )
  and not exists (
    select 1 from matches m
    where uid in (m.user_a, m.user_b)
      and m.status in ('pending_review', 'proposed', 'awaiting_payment', 'booking', 'booked')
  )
  and not exists (
    select 1 from matches m
    where uid in (m.user_a, m.user_b) and m.status = 'completed'
      and not exists (select 1 from feedback f where f.match_id = m.id and f.author_id = uid)
  )
$$;

-- ---------------------------------------------------------------------
-- Compatibilidad
-- ---------------------------------------------------------------------
-- Escala para comparar inclinación política declarada por cada usuario.
create or replace function politics_rank(p text) returns int
language sql immutable as $$
  select case lower(coalesce(p, ''))
    when 'izquierda' then 1 when 'centro-izquierda' then 2 when 'centro' then 3
    when 'centro-derecha' then 4 when 'derecha' then 5 else null end
$$;

-- ¿Lo que "a" pide en relación formal lo cumple "b"?
create or replace function formal_ok(a uuid, b uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare fa formal_preferences; fb formal_preferences; d int;
begin
  select * into fa from formal_preferences where profile_id = a;
  select * into fb from formal_preferences where profile_id = b;
  if fa is null or fb is null then return false; end if;

  if fa.kids_pref = 'con' and not fb.has_kids then return false; end if;
  if fa.kids_pref = 'sin' and fb.has_kids then return false; end if;

  if fa.religion_pref = 'Misma que la mía' and coalesce(fa.own_religion,'') <> coalesce(fb.own_religion,'') then return false; end if;
  if fa.religion_pref not in ('Misma que la mía', 'No me importa') and fa.religion_pref <> coalesce(fb.own_religion,'') then return false; end if;

  if fa.politics_pref <> 'nd' then
    d := abs(politics_rank(fa.own_politics) - politics_rank(fb.own_politics));
    if d is null then return false; end if;
    if fa.politics_pref = 'igual'     and d <> 0 then return false; end if;
    if fa.politics_pref = 'similar'   and d > 1  then return false; end if;
    if fa.politics_pref = 'contraria' and d < 3  then return false; end if;
  end if;
  return true;
end $$;

-- Intereses en común con detalle: {"Cine": {"ambos": ["Terror"], "tambien_le_gusta": ["Drama"]}}
-- desde el punto de vista de "viewer" (lo que a "other" también le gusta).
create or replace function shared_interests(viewer uuid, other uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(a.interest, jsonb_build_object(
           'ambos', (select coalesce(jsonb_agg(x), '[]') from unnest(a.details) x where x = any(b.details)),
           'tambien_le_gusta', (select coalesce(jsonb_agg(x), '[]') from unnest(b.details) x where not x = any(a.details))
         )), '{}')
  from interests a join interests b on b.interest = a.interest
  where a.profile_id = viewer and b.profile_id = other
$$;

-- Puntaje 0-100 de "b" para "a" según el tipo de match que eligió "a".
create or replace function score_for(a uuid, b uuid) returns numeric
language plpgsql stable security definer set search_path = public as $$
declare
  pa profiles; pb profiles; xa profile_private; xb profile_private;
  inter numeric := 0; pers_sim numeric := 0; career numeric := 0;
  total_details int; common_details int; k text; dist numeric := 0;
begin
  select * into pa from profiles where id = a;
  select * into pb from profiles where id = b;
  select * into xa from profile_private where profile_id = a;
  select * into xb from profile_private where profile_id = b;

  -- Intereses: coincidencia de detalles (Jaccard)
  select count(*) into total_details from (
    select unnest(details) d, interest from interests where profile_id = a
    union select unnest(details), interest from interests where profile_id = b) t;
  select count(*) into common_details from (
    select unnest(details) d, interest from interests where profile_id = a
    intersect select unnest(details), interest from interests where profile_id = b) t;
  if total_details > 0 then inter := common_details::numeric / total_details; end if;

  -- Personalidad: 4 escalas de 1 a 5
  foreach k in array array['social','plan','conflict','ritmo'] loop
    dist := dist + abs(coalesce((pa.personality->>k)::numeric, 3) - coalesce((pb.personality->>k)::numeric, 3));
  end loop;
  pers_sim := 1 - dist / 16;

  -- Carrera y capacidad económica
  career := (case when pa.career_level = pb.career_level then 0.5 else 0 end)
          + (case when xa.salary_currency = xb.salary_currency and xa.salary_range = xb.salary_range
                   and xa.salary_range <> 'Prefiero no decir' then 0.5 else 0 end);

  return round(100 * case pa.match_type
    when 'comun'       then 0.6 * inter + 0.25 * pers_sim + 0.15 * career
    when 'complemento' then 0.6 * (1 - pers_sim) + 0.25 * inter + 0.15 * career
    when 'carrera'     then 0.6 * career + 0.25 * inter + 0.15 * pers_sim
  end, 2);
end $$;

-- Pares válidos y su puntaje recíproco (promedio de ambos lados).
create or replace function candidate_pairs(p_intent intent_t, only_user uuid default null)
returns table (a uuid, b uuid, score numeric)
language sql stable security definer set search_path = public as $$
  select pa.id, pb.id, round((score_for(pa.id, pb.id) + score_for(pb.id, pa.id)) / 2, 2)
  from profiles pa
  join profiles pb on pb.id <> pa.id
   and pb.intent = pa.intent
   and pb.gender = pa.seeking_gender and pa.gender = pb.seeking_gender
  where pa.intent = p_intent
    and (only_user is null or pa.id = only_user)
    and (only_user is not null or pa.id < pb.id)
    and is_eligible(pa.id) and is_eligible(pb.id)
    -- nunca repetir una pareja que ya se propuso
    and not exists (select 1 from matches m where (m.user_a = pa.id and m.user_b = pb.id) or (m.user_a = pb.id and m.user_b = pa.id))
    and (p_intent <> 'formal' or (formal_ok(pa.id, pb.id) and formal_ok(pb.id, pa.id)))
$$;

-- ---------------------------------------------------------------------
-- Generación de matches
-- ---------------------------------------------------------------------
-- Semanal (formal e íntima): la IA propone, queda en revisión del curador.
-- Emparejamiento voraz: mejores puntajes primero, cada persona una vez.
create or replace function propose_weekly_matches() returns int
language plpgsql security definer set search_path = public as $$
declare r record; used uuid[] := '{}'; n int := 0; it intent_t;
begin
  foreach it in array array['formal','intima']::intent_t[] loop
    for r in select * from candidate_pairs(it) order by score desc loop
      continue when r.a = any(used) or r.b = any(used);
      insert into matches (user_a, user_b, intent, status, compatibility, shared, slot_options)
      values (r.a, r.b, it, 'pending_review', r.score, shared_interests(r.a, r.b), weekly_slot_options(now()));
      used := used || r.a || r.b; n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

create or replace function curator_approve(p_match uuid, p_curator uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update matches set status = 'proposed', curated_by = p_curator, curated_at = now(),
    slot_options = weekly_slot_options(now()),
    respond_by = now() + make_interval(hours => (setting('respond_hours_weekly') #>> '{}')::int)
  where id = p_match and status = 'pending_review';
  if not found then raise exception 'El match no está en revisión'; end if;
end $$;

create or replace function curator_discard(p_match uuid, p_curator uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update matches set status = 'cancelled', curated_by = p_curator, curated_at = now(), closed_at = now()
  where id = p_match and status = 'pending_review';
end $$;

-- Noche casual: el usuario pide un intento (máximo 3 al día, solo si el
-- anterior se rechazó). Sin revisión humana.
create or replace function request_casual_match() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  tz text := local_tz();
  today_count int;
  r record;
  new_id uuid;
begin
  if (select intent from profiles where id = me) <> 'casual' then
    raise exception 'Solo disponible para noche casual';
  end if;
  if not is_eligible(me) then
    raise exception 'Tienes un match abierto, feedback pendiente o tu cuenta no está activa';
  end if;
  select count(*) into today_count from matches m
  where m.intent = 'casual' and me in (m.user_a, m.user_b)
    and (m.created_at at time zone tz)::date = (now() at time zone tz)::date;
  if today_count >= (setting('casual_daily_attempts') #>> '{}')::int then
    raise exception 'Ya usaste tus 3 intentos de hoy. Vuelve mañana';
  end if;

  select * into r from candidate_pairs('casual', me) order by score desc limit 1;
  if r is null then return null; end if;   -- la app muestra "no hay alguien disponible ahora"

  insert into matches (user_a, user_b, intent, status, compatibility, shared, slot_options, respond_by)
  values (r.a, r.b, 'casual', 'proposed', r.score, shared_interests(r.a, r.b), casual_slot_options(now()),
          now() + make_interval(hours => (setting('respond_hours_casual') #>> '{}')::int))
  returning id into new_id;
  return new_id;
end $$;

-- ---------------------------------------------------------------------
-- Respuesta al match y fijación del horario
-- ---------------------------------------------------------------------
create or replace function respond_to_match(p_match uuid, p_decision decision_t, p_slots timestamptz[] default '{}')
returns match_status_t
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  m matches;
  other_resp match_responses;
  common timestamptz[];
begin
  select * into m from matches where id = p_match for update;
  if m is null or not is_participant(m, me) then raise exception 'Match no encontrado'; end if;
  if m.status <> 'proposed' then raise exception 'Este match ya no acepta respuestas'; end if;
  if m.respond_by is not null and now() > m.respond_by then raise exception 'Se venció el plazo para responder'; end if;
  if p_decision = 'accept' and (cardinality(p_slots) = 0 or not (p_slots <@ m.slot_options)) then
    raise exception 'Elige al menos uno de los horarios ofrecidos';
  end if;

  insert into match_responses (match_id, profile_id, attempt, decision, slots)
  values (p_match, me, m.attempt, p_decision, case when p_decision = 'accept' then p_slots else '{}' end);

  -- Cualquier rechazo cierra el match: nadie paga.
  if p_decision = 'reject' then
    update matches set status = 'rejected', closed_at = now() where id = p_match;
    return 'rejected';
  end if;

  select * into other_resp from match_responses
  where match_id = p_match and attempt = m.attempt and profile_id = partner_of(m, me);
  if other_resp is null then return 'proposed'; end if;   -- falta la otra persona
  if other_resp.decision = 'reject' then return 'rejected'; end if;

  select array_agg(s order by s) into common from unnest(p_slots) s where s = any(other_resp.slots);

  if common is not null then
    -- Hay fecha: se generan los cobros a ambos.
    update matches set status = 'awaiting_payment', starts_at = common[1] where id = p_match;
    insert into payments (match_id, profile_id, amount_cents, due_at)
    select p_match, u, (select coalesce((setting('price_cents') #>> '{}')::int, 0)),
           now() + make_interval(hours => (setting('payment_hours') #>> '{}')::int)
    from unnest(array[m.user_a, m.user_b]) u;
    return 'awaiting_payment';
  elsif m.attempt = 1 then
    -- Segundo y último intento con los horarios de la semana siguiente (o mañana/pasado en casual).
    update matches set attempt = 2,
      slot_options = case when m.intent = 'casual'
                          then casual_slot_options(now() + interval '1 day')
                          else weekly_slot_options(now(), 1) end,
      respond_by = now() + make_interval(hours => (setting(case when m.intent = 'casual'
                     then 'respond_hours_casual' else 'respond_hours_weekly' end) #>> '{}')::int)
    where id = p_match;
    return 'proposed';
  else
    -- Sin coincidencia en 2 intentos: se cancela sin penalización.
    update matches set status = 'cancelled', closed_at = now() where id = p_match;
    return 'cancelled';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Pagos y reserva (backend)
-- ---------------------------------------------------------------------
create or replace function mark_payment_paid(p_match uuid, p_profile uuid, p_provider_ref text) returns match_status_t
language plpgsql security definer set search_path = public as $$
begin
  update payments set status = 'paid', paid_at = now(), provider_ref = p_provider_ref
  where match_id = p_match and profile_id = p_profile and status = 'pending';
  if not exists (select 1 from payments where match_id = p_match and status <> 'paid') then
    update matches set status = 'booking' where id = p_match and status = 'awaiting_payment';
  end if;
  return (select status from matches where id = p_match);
end $$;

create or replace function publish_booking(p_match uuid, p_venue uuid, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.status <> 'booking' then raise exception 'El match no está listo para reservar'; end if;
  if (select kind from venues where id = p_venue) not in ('restaurante', 'cafe') then
    raise exception 'La primera cita siempre es en un restaurante o café aliado';
  end if;
  update matches set status = 'booked', venue_id = p_venue, reservation_ref = p_ref where id = p_match;
end $$;

-- ---------------------------------------------------------------------
-- Durante la cita
-- ---------------------------------------------------------------------
-- Cada persona marca que su cita llegó. Se permite desde 1 hora antes.
create or replace function confirm_arrival(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches;
begin
  select * into m from matches where id = p_match;
  if m is null or not is_participant(m, me) then raise exception 'Match no encontrado'; end if;
  if m.status <> 'booked' then raise exception 'La cita no está activa'; end if;
  if now() < m.starts_at - interval '1 hour' then raise exception 'Aún no es hora de la cita'; end if;
  insert into arrivals (match_id, confirmer_id, arrived_id) values (p_match, me, partner_of(m, me))
  on conflict do nothing;
end $$;

create or replace function submit_feedback(p_match uuid, p_stars int, p_good text, p_bad text, p_exchanged boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches;
begin
  select * into m from matches where id = p_match;
  if m is null or not is_participant(m, me) then raise exception 'Match no encontrado'; end if;
  if m.status not in ('booked', 'completed') or now() < m.starts_at then
    raise exception 'El feedback se envía después de la cita';
  end if;
  insert into feedback (match_id, author_id, stars, went_well, went_wrong, exchanged_contact)
  values (p_match, me, p_stars, p_good, p_bad, p_exchanged);
  perform finalize_date(p_match);
end $$;

-- Cierra la cita: registra inasistencias (quien no fue marcado como
-- llegado por su cita) y suspende a la tercera del año calendario.
create or replace function finalize_date(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches; u uuid; yr int; cnt int;
begin
  select * into m from matches where id = p_match for update;
  if m.status <> 'booked' then return; end if;
  update matches set status = 'completed', closed_at = now() where id = p_match;
  yr := extract(year from (m.starts_at at time zone local_tz()));
  foreach u in array array[m.user_a, m.user_b] loop
    if not exists (select 1 from arrivals where match_id = p_match and arrived_id = u) then
      insert into no_shows (profile_id, match_id, year) values (u, p_match, yr) on conflict do nothing;
      select count(*) into cnt from no_shows where profile_id = u and year = yr;
      if cnt > (setting('max_no_shows_per_year') #>> '{}')::int then
        update profiles set status = 'suspended',
          suspended_until = now() + make_interval(months => (setting('suspension_months') #>> '{}')::int)
        where id = u;
      end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Pausa
-- ---------------------------------------------------------------------
create or replace function set_paused(p_paused boolean) returns account_status
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s account_status;
begin
  select status into s from profiles where id = me;
  if p_paused and s = 'active' then
    update profiles set status = 'paused' where id = me;
    insert into pauses (profile_id) values (me);
  elsif not p_paused and s = 'paused' then
    update profiles set status = 'active' where id = me;
    update pauses set ended_at = now() where profile_id = me and ended_at is null;
  end if;
  return (select status from profiles where id = me);
end $$;

-- ---------------------------------------------------------------------
-- Lectura para la app
-- ---------------------------------------------------------------------
-- Tarjeta del match: nunca expone apellido, contacto, salario, religión ni política.
create or replace function get_match_card(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches; o profiles;
begin
  select * into m from matches where id = p_match;
  if m is null or not is_participant(m, me) or m.status = 'pending_review' then
    raise exception 'Match no encontrado';
  end if;
  select * into o from profiles where id = partner_of(m, me);
  return jsonb_build_object(
    'match_id', m.id, 'status', m.status, 'intent', m.intent, 'attempt', m.attempt,
    'compatibility', m.compatibility, 'slot_options', m.slot_options, 'respond_by', m.respond_by,
    'starts_at', m.starts_at,
    'partner', jsonb_build_object(
      'first_name', o.first_name,
      'age', date_part('year', age(o.birthdate)),
      'alcaldia', o.alcaldia,
      'job_title', o.job_title,
      'linkedin_verified', o.linkedin_verified,
      'activities', o.activities,
      'photos', (select coalesce(jsonb_agg(storage_path order by position), '[]') from photos where profile_id = o.id)
    ),
    'shared', shared_interests(me, o.id),
    'formal_filters_match', m.intent = 'formal',
    'my_response', (select to_jsonb(r) - 'profile_id' from match_responses r
                    where r.match_id = m.id and r.profile_id = me and r.attempt = m.attempt)
  );
end $$;

-- Datos de la reserva: solo cuando está publicada.
create or replace function get_booking(p_match uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); m matches; v venues;
begin
  select * into m from matches where id = p_match;
  if m is null or not is_participant(m, me) then raise exception 'Match no encontrado'; end if;
  if m.status not in ('booked', 'completed') then return null; end if;
  select * into v from venues where id = m.venue_id;
  return jsonb_build_object(
    'starts_at', m.starts_at, 'venue', v.name, 'address', v.address, 'alcaldia', v.alcaldia,
    'safety_keyword', v.safety_keyword, 'reservation_ref', m.reservation_ref,
    'arrival_confirmed_by_me', exists (select 1 from arrivals where match_id = m.id and confirmer_id = me),
    'my_arrival_confirmed',     exists (select 1 from arrivals where match_id = m.id and arrived_id = me)
  );
end $$;

-- Resumen para la pantalla principal.
create or replace function my_cycle_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); p profiles; tz text := local_tz(); open_match uuid; yr int;
begin
  select * into p from profiles where id = me;
  yr := extract(year from (now() at time zone tz));
  select id into open_match from matches m
  where me in (m.user_a, m.user_b) and m.status in ('proposed','awaiting_payment','booking','booked')
  order by created_at desc limit 1;
  return jsonb_build_object(
    'status', p.status, 'intent', p.intent, 'suspended_until', p.suspended_until,
    'open_match', open_match,
    'pending_feedback', (select m.id from matches m where me in (m.user_a, m.user_b) and m.status = 'completed'
                          and not exists (select 1 from feedback f where f.match_id = m.id and f.author_id = me) limit 1),
    'no_shows_this_year', (select count(*) from no_shows where profile_id = me and year = yr),
    'casual_attempts_today', case when p.intent = 'casual' then
        (select count(*) from matches m where m.intent = 'casual' and me in (m.user_a, m.user_b)
           and (m.created_at at time zone tz)::date = (now() at time zone tz)::date) end,
    'eligible', is_eligible(me)
  );
end $$;

-- ---------------------------------------------------------------------
-- Mantenimiento periódico (cada 15 minutos desde un cron del backend)
-- ---------------------------------------------------------------------
create or replace function run_maintenance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare expired int; unpaid int; finalized int := 0; r record;
begin
  -- Sin respuesta a tiempo = rechazo
  update matches set status = 'rejected', closed_at = now()
  where status = 'proposed' and respond_by < now();
  get diagnostics expired = row_count;

  -- Alguien no pagó a tiempo: se cancela y se marca reembolso para quien sí pagó
  with vencidos as (
    select distinct match_id from payments where status = 'pending' and due_at < now()
  ), cancelados as (
    update matches m set status = 'cancelled', closed_at = now()
    from vencidos v where m.id = v.match_id and m.status = 'awaiting_payment'
    returning m.id
  )
  select count(*) into unpaid from cancelados;
  update payments p set status = 'refunded'
  from matches m where m.id = p.match_id and m.status = 'cancelled' and p.status = 'paid';
  update payments p set status = 'failed'
  from matches m where m.id = p.match_id and m.status = 'cancelled' and p.status = 'pending';

  -- Citas terminadas hace más de 4 horas
  for r in select id from matches where status = 'booked' and starts_at < now() - interval '4 hours' loop
    perform finalize_date(r.id); finalized := finalized + 1;
  end loop;

  -- Fin de suspensiones
  update profiles set status = 'active', suspended_until = null
  where status = 'suspended' and suspended_until < now();

  return jsonb_build_object('expired', expired, 'unpaid_cancelled', unpaid, 'finalized', finalized);
end $$;

insert into app_settings (key, value) values ('price_cents', '0')   -- precio por definir
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Permisos de ejecución
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function
  request_casual_match(), respond_to_match(uuid, decision_t, timestamptz[]),
  confirm_arrival(uuid), submit_feedback(uuid, int, text, text, boolean),
  set_paused(boolean), get_match_card(uuid), get_booking(uuid), my_cycle_status()
to authenticated;

-- Usadas dentro de políticas y triggers
grant execute on function shares_visible_match(uuid, uuid), setting(text), proteger_campos_perfil()
to authenticated;

grant execute on all functions in schema public to service_role;
