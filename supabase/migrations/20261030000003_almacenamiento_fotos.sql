-- Bucket privado de fotos. Ruta: <profile_id>/<archivo>
-- Cada usuario sube y borra solo en su carpeta; puede ver las fotos de
-- alguien solo si comparten un match visible.
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

create policy fotos_subir_propias on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy fotos_borrar_propias on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy fotos_ver on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.shares_visible_match(auth.uid(), ((storage.foldername(name))[1])::uuid)
  ));
