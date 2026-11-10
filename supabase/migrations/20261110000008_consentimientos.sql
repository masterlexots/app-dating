-- Evidencia de consentimientos: versión y fecha del aviso de privacidad
-- aceptado, y consentimiento expreso para el rango de ingreso (dato patrimonial).
alter table profiles        add column if not exists privacy_version     text;
alter table profiles        add column if not exists privacy_accepted_at timestamptz;
alter table profile_private add column if not exists salary_consent_at   timestamptz;

-- Si guarda un rango de ingreso, debe existir su consentimiento.
alter table profile_private drop constraint if exists ingreso_con_consentimiento;
alter table profile_private add constraint ingreso_con_consentimiento check (
  salary_range is null or salary_range = 'Prefiero no decir' or salary_consent_at is not null
) not valid;  -- no se valida contra perfiles de prueba creados antes de este cambio
