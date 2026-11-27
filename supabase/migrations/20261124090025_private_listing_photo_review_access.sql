drop policy if exists marketplace_photos_read_own on storage.objects;
create policy marketplace_photos_read_own on storage.objects for select to authenticated
using (bucket_id = 'boladas-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and (storage.foldername(name))[2] = 'listings');
drop policy if exists marketplace_photos_read_admin on storage.objects;
create policy marketplace_photos_read_admin on storage.objects for select to authenticated
using (bucket_id = 'boladas-media' and (select public.is_vilashop_admin())
  and exists (select 1 from public.listings l where l.photo_path = storage.objects.name
    and l.status in ('pending_review','active','suspended','rejected')));
revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
