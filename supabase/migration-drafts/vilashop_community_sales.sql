-- Protect listing photos with short-lived signed URLs.
-- The application already creates signed URLs through the server-side Supabase client.
-- Do not grant public or authenticated direct reads from the storage bucket.
drop policy if exists marketplace_photos_read_active on storage.objects;
