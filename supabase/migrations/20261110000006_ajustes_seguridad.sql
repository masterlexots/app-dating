-- Ajustes del asesor de seguridad de Supabase.

-- 1. Fijar search_path en funciones auxiliares.
alter function public.casual_slot_options(timestamptz)          set search_path = public;
alter function public.weekly_slot_options(timestamptz, int)     set search_path = public;
alter function public.politics_rank(text)                       set search_path = public;
alter function public.setting(text)                             set search_path = public;
alter function public.partner_of(matches, uuid)                 set search_path = public;
alter function public.is_participant(matches, uuid)             set search_path = public;
alter function public.local_tz()                                set search_path = public;
alter function public.proteger_campos_perfil()                  set search_path = public;

-- 2. shares_visible_match solo responde sobre el propio usuario, para que
--    nadie pueda preguntar si dos personas ajenas tienen un match.
create or replace function shares_visible_match(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (auth.role() <> 'authenticated' or a = auth.uid())
     and exists (
       select 1 from matches m
       where ((m.user_a = a and m.user_b = b) or (m.user_a = b and m.user_b = a))
         and m.status not in ('pending_review')
     )
$$;

-- app_settings sin políticas es intencional: solo la lee el backend.
