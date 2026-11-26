-- The sale insert must succeed without a commission_rate column on marketplace_sales.
insert into public.marketplace_sales (id, agreed_price)
values ('11111111-1111-4111-8111-111111111111', 1000.00);

do $$
declare
  financial_row public.marketplace_sale_financials;
begin
  select * into financial_row
  from public.marketplace_sale_financials
  where sale_id = '11111111-1111-4111-8111-111111111111';

  if not found then
    raise exception 'FAIL: trigger did not create the private financial row';
  end if;
  if financial_row.commission_rate <> 0.1000
     or financial_row.commission_amount <> 100.00
     or financial_row.buyer_total_amount <> 1000.00
     or financial_row.seller_net_amount <> 900.00 then
    raise exception 'FAIL: unexpected financial values: %', row_to_json(financial_row);
  end if;

  if (select count(*) from public.marketplace_sales) <> 1
     or (select count(*) from public.marketplace_sale_financials) <> 1 then
    raise exception 'FAIL: unexpected fixture row counts';
  end if;
end;
$$;

-- Verify a second sale also gets its own financial record.
insert into public.marketplace_sales (id, agreed_price)
values ('22222222-2222-4222-8222-222222222222', 1250.50);

do $$
begin
  if not exists (
    select 1 from public.marketplace_sale_financials
    where sale_id = '22222222-2222-4222-8222-222222222222'
      and commission_amount = 125.05
      and buyer_total_amount = 1250.50
      and seller_net_amount = 1125.45
  ) then
    raise exception 'FAIL: second sale financial record is incorrect';
  end if;
end;
$$;

rollback;
