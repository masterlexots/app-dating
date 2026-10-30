-- =====================================================================
-- Esquema inicial: perfiles, cuestionario, matches, citas, pagos,
-- chat, seguridad, feedback e inasistencias.
--
-- Principio de privacidad: cada usuario solo lee sus propios datos.
-- Lo que ve de su match lo obtiene a través de funciones que validan
-- que ambos están en el mismo match (get_match_card, etc.).
-- Las tablas de pagos, verificación e inasistencias solo las escribe
-- el backend (service_role), nunca la app directamente.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type intent_t       as enum ('formal', 'casual', 'intima');
create type match_type_t   as enum ('comun', 'complemento', 'carrera');
create type gender_t       as enum ('hombre', 'mujer');
create type account_status as enum ('onboarding', 'active', 'paused', 'suspended');
create type kids_pref_t    as enum ('con', 'sin', 'igual');
create type politics_pref_t as enum ('igual', 'similar', 'contraria', 'nd');
create type currency_t     as enum ('MXN', 'USD');
create type verif_status_t as enum ('pending', 'approved', 'rejected');
create type venue_kind_t   as enum ('restaurante', 'cafe', 'motel');
create type match_status_t as enum (
  'pending_review',    -- propuesto por la IA, esperando curador (solo semanal)
  'proposed',          -- visible para ambos, esperando respuesta
  'rejected',          -- alguien rechazó o no respondió a tiempo
  'awaiting_payment',  -- horario fijado, esperando pago de ambos
  'booking',           -- ambos pagaron, el equipo reserva en el restaurante
  'booked',            -- reserva publicada, chat abierto
  'completed',         -- cita terminada, feedback pendiente o enviado
  'cancelled'          -- sin horario en común tras 2 intentos, o falta de pago
);
create type decision_t     as enum ('accept', 'reject');
create type payment_status_t as enum ('pending', 'paid', 'refunded', 'failed');
create type alert_kind_t   as enum ('help', 'share_location');

-- ---------------------------------------------------------------------
-- Configuración de reglas (editable sin cambiar código)
-- ---------------------------------------------------------------------
create table app_settings (
  key   text primary key,
  value jsonb not null
);

insert into app_settings (key, value) values
  ('weekly_slots',        '[{"dow":5,"time":"19:00"},{"dow":6,"time":"19:00"}]'), -- viernes y sábado 7 pm
  ('casual_slot_time',    '"19:00"'),   -- hora para "hoy" o "mañana" en noche casual (por definir)
  ('casual_min_lead_hours','3'),        -- "hoy" solo se ofrece si faltan al menos estas horas
  ('casual_daily_attempts','3'),
  ('respond_hours_weekly','48'),
  ('respond_hours_casual','2'),
  ('payment_hours',       '24'),
  ('max_no_shows_per_year','2'),
  ('suspension_months',   '6'),
  ('timezone',            '"America/Mexico_City"');

create or replace function setting(k text) returns jsonb
language sql stable as $$ select value from app_settings where key = k $$;

-- ---------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------
create table profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  first_name     text not null,
  last_name      text not null,
  email          text not null,
  phone          text not null,                 -- verificado por Supabase Auth (SMS)
  birthdate      date not null,
  gender         gender_t not null,
  seeking_gender gender_t not null,             -- MVP heterosexual: se valida abajo
  intent         intent_t not null,
  match_type     match_type_t not null,
  activities     text,                           -- "fin de semana ideal"
  personality    jsonb not null default '{}',    -- {social,plan,conflict,ritmo} de 1 a 5
  career_level   text,
  job_title      text,
  linkedin_url   text,
  linkedin_verified boolean not null default false,
  alcaldia       text,
  status         account_status not null default 'onboarding',
  suspended_until timestamptz,
  identity_verified boolean not null default false,  -- solo lo cambia el backend
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint mayor_de_edad check (birthdate <= (current_date - interval '18 years')),
  constraint heterosexual_mvp check (gender <> seeking_gender),
  constraint linkedin_formato check (
    linkedin_url is null or linkedin_url ~* '^(https?://)?([a-z]{2,3}\.)?linkedin\.com/in/[A-Za-z0-9_%-]{3,}/?$'
  )
);

-- Datos privados que nunca se muestran a otros usuarios
create table profile_private (
  profile_id      uuid primary key references profiles (id) on delete cascade,
  salary_currency currency_t,
  salary_range    text            -- rango elegido, o 'Prefiero no decir'
);

-- Filtros de relación formal. Religión y política son datos sensibles:
-- se guarda la evidencia del consentimiento expreso.
create table formal_preferences (
  profile_id        uuid primary key references profiles (id) on delete cascade,
  has_kids          boolean not null,
  kids_pref         kids_pref_t not null,
  own_politics      text,            -- autodefinición, para calcular igual/similar/contraria
  politics_pref     politics_pref_t not null,
  own_religion      text,
  religion_pref     text not null,
  consent_at        timestamptz not null,
  consent_evidence  text not null    -- id de la firma electrónica del proveedor
);

create table interests (
  profile_id uuid not null references profiles (id) on delete cascade,
  interest   text not null,
  details    text[] not null check (cardinality(details) >= 1),
  primary key (profile_id, interest)
);

create table photos (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  storage_path text not null,   -- ruta en el bucket privado "photos": <profile_id>/<archivo>
  position    smallint not null check (position between 0 and 8),
  created_at  timestamptz not null default now(),
  unique (profile_id, position)
);

-- Verificación de identidad: la escribe el backend con el resultado del proveedor
create table identity_verifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles (id) on delete cascade,
  provider    text not null,
  provider_ref text not null,
  status      verif_status_t not null default 'pending',
  created_at  timestamptz not null default now(),
  decided_at  timestamptz
);

-- Solo la referencia del proveedor de pagos. Nunca datos de tarjeta.
create table payment_methods (
  profile_id      uuid primary key references profiles (id) on delete cascade,
  provider        text not null,
  customer_ref    text not null,
  label           text not null,   -- p. ej. "Visa terminada en 4242"
  created_at      timestamptz not null default now()
);

create table pauses (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

-- ---------------------------------------------------------------------
-- Lugares aliados
-- ---------------------------------------------------------------------
create table venues (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          venue_kind_t not null,
  address       text not null,
  alcaldia      text not null,
  safety_keyword text not null,     -- frase para pedir ayuda al personal
  active        boolean not null default true
);

-- ---------------------------------------------------------------------
-- Matches y citas
-- ---------------------------------------------------------------------
create table matches (
  id            uuid primary key default gen_random_uuid(),
  user_a        uuid not null references profiles (id),
  user_b        uuid not null references profiles (id),
  intent        intent_t not null,
  status        match_status_t not null,
  compatibility numeric(5,2) not null,
  shared        jsonb not null default '{}',    -- intereses y detalles en común
  attempt       smallint not null default 1 check (attempt between 1 and 2), -- intento de horario
  slot_options  timestamptz[] not null,
  respond_by    timestamptz,
  starts_at     timestamptz,                    -- fecha fijada
  venue_id      uuid references venues (id),
  reservation_ref text,
  curated_by    uuid,
  curated_at    timestamptz,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz,
  constraint distintos check (user_a <> user_b)
);
create index on matches (user_a, created_at desc);
create index on matches (user_b, created_at desc);
create index on matches (status);

create table match_responses (
  match_id    uuid not null references matches (id) on delete cascade,
  profile_id  uuid not null references profiles (id),
  attempt     smallint not null,
  decision    decision_t not null,
  slots       timestamptz[] not null default '{}',
  responded_at timestamptz not null default now(),
  primary key (match_id, profile_id, attempt)
);

create table payments (
  id           uuid primary key default gen_random_uuid(),
  match_id     uuid not null references matches (id),
  profile_id   uuid not null references profiles (id),
  amount_cents integer not null,
  currency     currency_t not null default 'MXN',
  status       payment_status_t not null default 'pending',
  provider_ref text,
  due_at       timestamptz not null,
  paid_at      timestamptz,
  unique (match_id, profile_id)
);

create table messages (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references matches (id) on delete cascade,
  sender_id  uuid not null references profiles (id),
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index on messages (match_id, created_at);

create table safety_alerts (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references matches (id),
  profile_id uuid not null references profiles (id),
  kind       alert_kind_t not null,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

-- Confirmación mutua de llegada al inicio de la cita
create table arrivals (
  match_id     uuid not null references matches (id) on delete cascade,
  confirmer_id uuid not null references profiles (id),   -- quien marca
  arrived_id   uuid not null references profiles (id),   -- quien llegó
  confirmed_at timestamptz not null default now(),
  primary key (match_id, arrived_id),
  constraint no_auto check (confirmer_id <> arrived_id)
);

create table feedback (
  match_id   uuid not null references matches (id) on delete cascade,
  author_id  uuid not null references profiles (id),
  stars      smallint not null check (stars between 1 and 5),
  went_well  text,
  went_wrong text,
  exchanged_contact boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (match_id, author_id)
);

create table no_shows (
  profile_id uuid not null references profiles (id),
  match_id   uuid not null references matches (id),
  year       smallint not null,
  created_at timestamptz not null default now(),
  primary key (profile_id, match_id)
);

create table reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles (id),
  reported_id uuid not null references profiles (id),
  match_id    uuid references matches (id),
  reason      text not null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- ---------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------
create or replace function is_participant(m matches, uid uuid) returns boolean
language sql immutable as $$ select uid in (m.user_a, m.user_b) $$;

create or replace function partner_of(m matches, uid uuid) returns uuid
language sql immutable as $$ select case when uid = m.user_a then m.user_b else m.user_a end $$;

-- ¿Comparten un match en el que ya pueden verse? (fotos y tarjeta)
create or replace function shares_visible_match(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from matches m
    where ((m.user_a = a and m.user_b = b) or (m.user_a = b and m.user_b = a))
      and m.status not in ('pending_review')
  )
$$;

-- ---------------------------------------------------------------------
-- Seguridad a nivel de fila (RLS)
-- ---------------------------------------------------------------------
alter table app_settings           enable row level security;
alter table profiles               enable row level security;
alter table profile_private        enable row level security;
alter table formal_preferences     enable row level security;
alter table interests              enable row level security;
alter table photos                 enable row level security;
alter table identity_verifications enable row level security;
alter table payment_methods        enable row level security;
alter table pauses                 enable row level security;
alter table venues                 enable row level security;
alter table matches                enable row level security;
alter table match_responses        enable row level security;
alter table payments               enable row level security;
alter table messages               enable row level security;
alter table safety_alerts          enable row level security;
alter table arrivals               enable row level security;
alter table feedback               enable row level security;
alter table no_shows               enable row level security;
alter table reports                enable row level security;

-- Perfil: cada quien el suyo. Campos que controla el backend no se pueden tocar.
create policy perfil_propio_leer on profiles for select to authenticated using (id = auth.uid());
create policy perfil_propio_crear on profiles for insert to authenticated
  with check (id = auth.uid() and status = 'onboarding' and identity_verified = false and linkedin_verified = false);
create policy perfil_propio_editar on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function proteger_campos_perfil() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    if new.identity_verified is distinct from old.identity_verified
       or new.linkedin_verified is distinct from old.linkedin_verified
       or new.suspended_until is distinct from old.suspended_until
       or new.phone is distinct from old.phone
       or (new.status is distinct from old.status and not (
            (old.status = 'active' and new.status = 'paused') or
            (old.status = 'paused' and new.status = 'active')))
    then
      raise exception 'Este campo solo lo puede cambiar el sistema';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger perfil_campos_protegidos before update on profiles
  for each row execute function proteger_campos_perfil();

create policy privado_propio on profile_private for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy formal_propio on formal_preferences for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy intereses_propios on interests for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy fotos_propias on photos for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy fotos_de_mi_match on photos for select to authenticated
  using (shares_visible_match(auth.uid(), profile_id));

create policy verif_leer_propia on identity_verifications for select to authenticated using (profile_id = auth.uid());
create policy pago_metodo_leer on payment_methods for select to authenticated using (profile_id = auth.uid());
create policy pausas_leer on pauses for select to authenticated using (profile_id = auth.uid());

create policy lugares_activos on venues for select to authenticated using (active);

-- Matches: solo participantes, y nunca los que esperan revisión del curador
create policy match_participante on matches for select to authenticated
  using (auth.uid() in (user_a, user_b) and status <> 'pending_review');

create policy respuestas_leer on match_responses for select to authenticated
  using (profile_id = auth.uid());
create policy pagos_leer on payments for select to authenticated using (profile_id = auth.uid());

-- Chat: solo con la reserva publicada y hasta que se cierre la cita
create policy chat_leer on messages for select to authenticated using (
  exists (select 1 from matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b)
          and m.status in ('booked', 'completed'))
);
create policy chat_escribir on messages for insert to authenticated with check (
  sender_id = auth.uid() and exists (
    select 1 from matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b) and m.status = 'booked')
);

create policy alertas_crear on safety_alerts for insert to authenticated with check (
  profile_id = auth.uid() and exists (
    select 1 from matches m where m.id = match_id and auth.uid() in (m.user_a, m.user_b) and m.status = 'booked')
);
create policy alertas_leer on safety_alerts for select to authenticated using (profile_id = auth.uid());

create policy llegadas_leer on arrivals for select to authenticated using (auth.uid() in (confirmer_id, arrived_id));
create policy feedback_leer on feedback for select to authenticated using (author_id = auth.uid());
create policy inasistencias_leer on no_shows for select to authenticated using (profile_id = auth.uid());
create policy reportes_crear on reports for insert to authenticated with check (reporter_id = auth.uid());

-- Las escrituras de matches, respuestas, pagos, llegadas y feedback pasan
-- por las funciones de reglas de negocio (siguiente migración).
