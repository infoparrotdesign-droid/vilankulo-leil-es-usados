-- Repair sale-financial capture after commission columns were removed from marketplace_sales.
-- The marketplace commission remains private in marketplace_sale_financials.
-- Current platform commission policy is 10%; do not read it from the public sale row.

create or replace function public.capture_marketplace_sale_financials()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  applied_commission_rate numeric(5,4) := 0.1000;
  calculated_commission numeric(12,2);
begin
  calculated_commission := round(new.agreed_price * applied_commission_rate, 2);

  insert into public.marketplace_sale_financials
    (sale_id, commission_rate, commission_amount, buyer_total_amount, seller_net_amount)
  values (
    new.id,
    applied_commission_rate,
    calculated_commission,
    new.agreed_price,
    new.agreed_price - calculated_commission
  );

  return new;
end;
$$;

revoke all on function public.capture_marketplace_sale_financials() from public, anon, authenticated;

drop trigger if exists marketplace_sales_capture_financials on public.marketplace_sales;
create trigger marketplace_sales_capture_financials
  after insert on public.marketplace_sales
  for each row
  execute function public.capture_marketplace_sale_financials();
