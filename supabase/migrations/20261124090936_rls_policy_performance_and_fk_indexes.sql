create index if not exists bids_listing_id_idx on public.bids(listing_id);
create index if not exists listings_reviewed_by_idx on public.listings(reviewed_by);

drop policy if exists listings_public_active on public.listings;
drop policy if exists listings_seller_read_own on public.listings;
drop policy if exists listings_admin_read_all on public.listings;
create policy listings_public_active on public.listings for select to anon using (status = 'active');
create policy listings_authenticated_read on public.listings for select to authenticated
using (status = 'active' or seller_id = (select auth.uid()) or (select public.is_vilashop_admin()));

drop policy if exists listings_authenticated_create on public.listings;
create policy listings_authenticated_create on public.listings for insert to authenticated
with check (seller_id = (select auth.uid()) and exists (
  select 1 from public.profiles where profiles.id = (select auth.uid())
));

drop policy if exists listings_seller_delete_own on public.listings;
create policy listings_seller_delete_own on public.listings
for delete to authenticated using (seller_id = (select auth.uid()));

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
with check (id = (select auth.uid()));

drop policy if exists bidders_read_own_bids on public.bids;
create policy bidders_read_own_bids on public.bids for select to authenticated
using (bidder_id = (select auth.uid()));
