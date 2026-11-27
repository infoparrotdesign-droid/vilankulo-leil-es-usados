create or replace function public.test_marketplace_sale_state(
  _listing_id uuid,_buyer_id uuid,_status text,_payment_method text default null,
  _payout_method text default null,_payout_content text default null,_payout_reference text default null
) returns boolean language sql stable security definer set search_path=''
as $fn$
  select exists(select 1 from public.marketplace_sales s
    where s.listing_id=_listing_id and s.buyer_id=_buyer_id and s.status=_status
      and (_payment_method is null or s.payment_method=_payment_method)
      and (_payout_method is null or s.payout_method=_payout_method)
      and (_payout_content is null or s.payout_content=_payout_content)
      and (_payout_reference is null or s.payout_reference=_payout_reference));
$fn$;
grant execute on function public.test_marketplace_sale_state(uuid,uuid,text,text,text,text,text) to authenticated;
create or replace function public.get_test_sale_id(_listing_id uuid)
returns uuid language sql stable security definer set search_path=''
as $fn$ select s.id from public.marketplace_sales s where s.listing_id=_listing_id order by s.id desc limit 1 $fn$;
grant execute on function public.get_test_sale_id(uuid) to authenticated;