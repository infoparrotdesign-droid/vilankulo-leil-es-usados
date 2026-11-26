-- Listing photos stay in the private boladas-media bucket.
-- Public access is issued only through the existing server-side signed-URL flow
-- in src/lib/listing-photos.functions.ts (service-role client).
-- Keep seller-owner and VilaShop-admin SELECT policies unchanged.
drop policy if exists marketplace_photos_read_active on storage.objects;
