-- Prueba de punta a punta de las reglas de negocio en un Postgres local.
-- Uso: ver supabase/tests/README.md
\set ON_ERROR_STOP on

-- ---------- Datos de prueba (como backend) ----------
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c'), ('00000000-0000-0000-0000-00000000000d'),
  ('00000000-0000-0000-0000-00000000000e');

insert into profiles (id, first_name, last_name, email, phone, birthdate, gender, seeking_gender, intent, match_type, personality, career_level, alcaldia)
values
 ('00000000-0000-0000-0000-00000000000a','Luis','Pérez','l@x.mx','5500000001','1993-01-01','hombre','mujer','formal','comun','{"social":4,"plan":4,"conflict":3,"ritmo":4}','3 a 7 años','Benito Juárez'),
 ('00000000-0000-0000-0000-00000000000b','Mariana','Ruiz','m@x.mx','5500000002','1995-01-01','mujer','hombre','formal','comun','{"social":4,"plan":5,"conflict":3,"ritmo":4}','3 a 7 años','Coyoacán'),
 ('00000000-0000-0000-0000-00000000000c','Diego','Soto','d@x.mx','5500000003','1990-01-01','hombre','mujer','casual','comun','{}','8 a 15 años','Cuauhtémoc'),
 ('00000000-0000-0000-0000-00000000000d','Ana','Lara','a@x.mx','5500000004','1994-01-01','mujer','hombre','casual','complemento','{}','3 a 7 años','Miguel Hidalgo'),
 ('00000000-0000-0000-0000-00000000000e','Sofía','Gil','s@x.mx','5500000005','1996-01-01','mujer','hombre','casual','comun','{}','3 a 7 años','Roma');

update profiles set status = 'active', identity_verified = true;
insert into photos (profile_id, storage_path, position)
select p.id, p.id || '/' || g || '.jpg', g from profiles p, generate_series(0,4) g;
insert into payment_methods select id, 'stripe', 'cus_' || left(id::text, 4), 'Visa terminada en 4242' from profiles;
insert into interests values
 ('00000000-0000-0000-0000-00000000000a','Cine','{Terror,Ciencia ficción}'),
 ('00000000-0000-0000-0000-00000000000b','Cine','{Terror,Drama}'),
 ('00000000-0000-0000-0000-00000000000c','Música en vivo','{Rock}'),
 ('00000000-0000-0000-0000-00000000000d','Música en vivo','{Rock,Jazz}');
insert into formal_preferences values
 ('00000000-0000-0000-0000-00000000000a', false, 'sin', 'centro', 'similar', 'Católica', 'No me importa', now(), 'firma-1'),
 ('00000000-0000-0000-0000-00000000000b', false, 'igual', 'centro-izquierda', 'similar', 'Católica', 'Misma que la mía', now(), 'firma-2');
insert into venues (id, name, kind, address, alcaldia, safety_keyword) values
 ('10000000-0000-0000-0000-000000000001','Casa Bugambilia','restaurante','Álvaro Obregón 100','Cuauhtémoc','limonada de bugambilia'),
 ('10000000-0000-0000-0000-000000000002','Motel X','motel','Calle 1','Tlalpan','—');

-- ---------- Semanal: la IA propone, el curador aprueba ----------
select propose_weekly_matches() as propuestos_semanales;
do $$ begin assert (select count(*) from matches where intent='formal' and status='pending_review') = 1, 'falta match formal'; end $$;

-- Usuario no ve un match en revisión
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false), set_config('request.jwt.claim.role','authenticated',false);
do $$ begin assert (select count(*) from matches) = 0, 'el usuario no debe ver matches en revisión'; end $$;
reset role; select set_config('request.jwt.claim.role','',false);

select curator_approve(id, gen_random_uuid()) from matches where status='pending_review';

-- Primer intento: no coinciden en horario
set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select get_match_card((select id from matches limit 1))->'shared' as en_comun_luis;
select respond_to_match((select id from matches limit 1), 'accept', array[(select slot_options[1] from matches limit 1)]);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000b',false);
select respond_to_match((select id from matches limit 1), 'accept', array[(select slot_options[2] from matches limit 1)]) as tras_intento_1;
do $$ begin assert (select attempt from matches limit 1) = 2, 'debe pasar al segundo intento'; end $$;

-- Segundo intento: coinciden
select respond_to_match((select id from matches limit 1), 'accept', (select slot_options from matches limit 1));
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
select respond_to_match((select id from matches limit 1), 'accept', array[(select slot_options[2] from matches limit 1)]) as tras_intento_2;
reset role; select set_config('request.jwt.claim.role','',false);
do $$ begin assert (select status from matches where intent='formal') = 'awaiting_payment', 'debe esperar pago'; end $$;

-- Pagos, reserva (motel rechazado), chat
select mark_payment_paid(id, user_a, 'pi_1') from matches where intent='formal';
select mark_payment_paid(id, user_b, 'pi_2') from matches where intent='formal';
do $$ begin
  begin perform publish_booking((select id from matches where intent='formal'), '10000000-0000-0000-0000-000000000002', 'r'); assert false, 'motel no permitido';
  exception when raise_exception then null; end;
end $$;
select publish_booking(id, '10000000-0000-0000-0000-000000000001', 'RES-1') from matches where intent='formal';

-- Fecha en el pasado para simular que llegó el día
update matches set starts_at = now() - interval '10 minutes' where intent='formal';

set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
insert into messages (match_id, sender_id, body) select id, '00000000-0000-0000-0000-00000000000a', '¡Hola!' from matches where intent='formal';
select get_booking((select id from matches where intent='formal'))->>'safety_keyword' as palabra_clave;
-- Solo Luis confirma que Mariana llegó; Mariana no confirma a Luis => inasistencia de Luis
select confirm_arrival((select id from matches where intent='formal'));
select submit_feedback((select id from matches where intent='formal'), 5, 'Buena plática', null, true);
reset role; select set_config('request.jwt.claim.role','',false);
do $$ begin
  assert (select status from matches where intent='formal') = 'completed', 'cita debe cerrar';
  assert (select count(*) from no_shows where profile_id='00000000-0000-0000-0000-00000000000a') = 1, 'Luis debe tener 1 inasistencia';
  assert (select count(*) from no_shows where profile_id='00000000-0000-0000-0000-00000000000b') = 0, 'Mariana sin inasistencia';
end $$;

-- Mariana no puede recibir otro match hasta dar feedback
do $$ begin assert not is_eligible('00000000-0000-0000-0000-00000000000b'), 'feedback pendiente debe bloquear'; end $$;

-- ---------- Noche casual: 3 intentos al día ----------
set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select request_casual_match() is not null as intento_1;
do $$ begin
  begin perform request_casual_match(); assert false, 'no debe dar otro con uno abierto';
  exception when raise_exception then null; end;
end $$;
select respond_to_match((select id from matches where intent='casual' and status='proposed'), 'reject');
select request_casual_match() is not null as intento_2;
select respond_to_match((select id from matches where intent='casual' and status='proposed'), 'reject');
select request_casual_match() as intento_3_sin_candidatas;  -- ya no quedan mujeres sin repetir
reset role; select set_config('request.jwt.claim.role','',false);

-- Tercera inasistencia suspende 6 meses
-- Luis ya tiene 1; dos citas más sin confirmación de llegada suman 3
insert into matches (id,user_a,user_b,intent,status,compatibility,slot_options,starts_at,venue_id)
values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000e','casual','booked',50,'{}',now()-interval '5 hours','10000000-0000-0000-0000-000000000001'),
       ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-00000000000d','casual','booked',50,'{}',now()-interval '5 hours','10000000-0000-0000-0000-000000000001');
select run_maintenance();
do $$ begin
  assert (select status from profiles where id='00000000-0000-0000-0000-00000000000a') = 'suspended', 'tercera inasistencia debe suspender';
end $$;

-- Usuario no puede activarse a sí mismo ni marcarse verificado
set role authenticated; select set_config('request.jwt.claim.role','authenticated',false);
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000a',false);
do $$ begin
  begin update profiles set status='active' where id=auth.uid(); assert false, 'no puede quitarse la suspensión';
  exception when raise_exception then null; end;
end $$;
reset role;

select 'TODAS LAS PRUEBAS PASARON' as resultado;
