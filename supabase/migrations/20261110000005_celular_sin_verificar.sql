-- Mientras no haya proveedor de SMS, el inicio de sesión es por correo y el
-- celular se captura en el registro sin verificar. Esta columna indica si
-- ya se verificó; solo la cambia el sistema.
alter table profiles add column if not exists phone_verified boolean not null default false;

alter table profiles drop constraint if exists celular_formato;
alter table profiles add constraint celular_formato check (phone ~ '^\+52[0-9]{10}$');

create or replace function proteger_campos_perfil() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'authenticated' then
    if new.identity_verified is distinct from old.identity_verified
       or new.linkedin_verified is distinct from old.linkedin_verified
       or new.phone_verified    is distinct from old.phone_verified
       or new.suspended_until   is distinct from old.suspended_until
       or new.email             is distinct from old.email
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

-- Al crear el perfil, el correo debe ser el mismo con el que inició sesión.
drop policy if exists perfil_propio_crear on profiles;
create policy perfil_propio_crear on profiles for insert to authenticated
  with check (
    id = auth.uid() and status = 'onboarding' and identity_verified = false
    and linkedin_verified = false and phone_verified = false
    and lower(email) = lower(coalesce(auth.jwt() ->> 'email', email))
  );
