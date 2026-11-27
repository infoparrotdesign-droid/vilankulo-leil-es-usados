-- VilaShop: official delivery confirmation and 72-hour photo retention.
-- The listing and bids are retained permanently as sale history.
alter table public.listings
  add column if not exists delivery_confirmed_at timestamptz,
  add column if not exists photos_delete_after timestamptz,
  add column if not exists photos_deleted_at timestamptz;

create index if not exists listings_photo_cleanup_queue_idx
  on public.listings (photos_delete_after)
  where photos_delete_after is not null and photos_deleted_at is null;

create or replace function public.admin_confirm_listing_delivery(_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  result_row public.listings;
  admin_id uuid := auth.uid();
begin
  if admin_id is null or not exists (
    select 1 from public.vilashop_admins a where a.user_id = admin_id
  ) then
    raise exception 'Apenas a administração VilaShop pode confirmar a entrega.';
  end if;

  update public.listings
  set status = 'sold',
      delivery_confirmed_at = coalesce(delivery_confirmed_at, now()),
      photos_delete_after = coalesce(photos_delete_after, now() + interval '72 hours'),
      reviewed_at = coalesce(reviewed_at, now()),
      reviewed_by = admin_id
  where id = _listing_id
    and status in ('active','ended','sold')
  returning * into result_row;

  if not found then
    raise exception 'Anúncio não encontrado ou não está num estado que permita confirmar a entrega.';
  end if;
  return result_row;
end;
$$;

revoke all on function public.admin_confirm_listing_delivery(uuid) from public, anon;
grant execute on function public.admin_confirm_listing_delivery(uuid) to authenticated;

comment on column public.listings.delivery_confirmed_at is
  'Momento em que a equipa VilaShop confirmou oficialmente a entrega ao comprador.';
comment on column public.listings.photos_delete_after is
  'Prazo de eliminação das fotografias: 72 horas após confirmação oficial da entrega.';
comment on column public.listings.photos_deleted_at is
  'Momento em que as fotografias foram removidas do Storage; o registo e histórico da venda permanecem.';
