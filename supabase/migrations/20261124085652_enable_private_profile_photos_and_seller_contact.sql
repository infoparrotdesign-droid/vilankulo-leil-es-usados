CREATE POLICY profile_photo_read_self ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'boladas-media' AND (storage.foldername(name))[1] = auth.uid()::text AND (storage.foldername(name))[2] = 'profile'
);
CREATE OR REPLACE FUNCTION public.get_seller_contact(_listing_id uuid)
RETURNS TABLE (phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT profiles.phone
  FROM public.listings
  JOIN public.profiles ON profiles.id = listings.seller_id
  WHERE listings.id = _listing_id
    AND listings.status = 'active'
    AND auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles AS viewer WHERE viewer.id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.get_seller_contact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_contact(uuid) TO authenticated;