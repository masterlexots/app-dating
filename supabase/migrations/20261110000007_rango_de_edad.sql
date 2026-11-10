-- Rango de edad: cada persona dice (en "Mis preferencias", después del registro) hasta cuántos años mayor y hasta cuántos
-- años menor acepta. 0 = no acepta a alguien mayor (o menor). Vacío = sin
-- límite (mientras la persona no lo defina).
alter table profiles add column if not exists age_older_max   smallint check (age_older_max   between 0 and 60);
alter table profiles add column if not exists age_younger_max smallint check (age_younger_max between 0 and 60);

-- ¿La edad de "b" está dentro de lo que acepta "a"? (diferencia en años cumplidos)
create or replace function age_ok(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select (pa.age_older_max   is null or date_part('year', age(pb.birthdate)) - date_part('year', age(pa.birthdate)) <= pa.age_older_max)
       and (pa.age_younger_max is null or date_part('year', age(pa.birthdate)) - date_part('year', age(pb.birthdate)) <= pa.age_younger_max)
    from profiles pa, profiles pb where pa.id = a and pb.id = b
  ), false)
$$;

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
    -- la edad de cada uno está dentro del rango que acepta el otro
    and age_ok(pa.id, pb.id) and age_ok(pb.id, pa.id)
    and (p_intent <> 'formal' or (formal_ok(pa.id, pb.id) and formal_ok(pb.id, pa.id)))
$$;

revoke execute on function age_ok(uuid, uuid) from public, anon, authenticated;
grant execute on function age_ok(uuid, uuid) to service_role;
