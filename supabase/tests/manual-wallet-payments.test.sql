-- Assertions for the manual e-Mola/M-Pesa migration; runs only on disposable PostgreSQL.
\set ON_ERROR_STOP on
begin;

-- Seller saves private e-Mola payout details and can read only their own record.
set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',false);
select public.save_my_seller_payout_details('875 492 563','JUNIOR PAULO FERNANDO HUATE');
do $$ begin
  if not exists (
    select 1 from public.get_my_seller_payout_details()
    where emola_number='875492563' and account_holder='JUNIOR PAULO FERNANDO HUATE'
  ) then raise exception 'FAIL: seller could not read their own payout details'; end if;
end $$;
do $$ begin
  begin
    perform 1 from public.seller_payout_details;
    raise exception 'FAIL: authenticated role can directly read private payout table';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Buyer cannot read seller payout details through the seller-scoped RPC or admin RPC.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$ begin
  if exists(select 1 from public.get_my_seller_payout_details()) then
    raise exception 'FAIL: buyer read another user payout details';
  end if;
  begin
    perform * from public.admin_list_seller_payout_details();
    raise exception 'FAIL: non-admin called admin payout RPC';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

-- Checkout supports both official wallet methods; invalid methods are rejected.
select public.create_marketplace_sale_with_payment(
 '40000000-0000-4000-8000-000000000004','in_person','M-Pesa',null
);
do $$ begin
  if not public.test_marketplace_sale_state('40000000-0000-4000-8000-000000000004',auth.uid(),'awaiting_payment','M-Pesa') then
    raise exception 'FAIL: M-Pesa checkout did not create expected sale';
  end if;
  begin
    perform public.create_marketplace_sale_with_payment(
      '50000000-0000-4000-8000-000000000005','in_person','INVALID',null
    );
    raise exception 'FAIL: invalid checkout wallet was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

-- Buyer reports payment; admin can inspect seller details, but cannot settle early.
select public.report_marketplace_payment(
 public.get_test_sale_id('40000000-0000-4000-8000-000000000004'),
 'M-Pesa','MPESA-TEST-001'
);
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',false);
do $$ begin
  if (select count(*) from public.admin_list_seller_payout_details()) <> 1 then
    raise exception 'FAIL: admin cannot list seller payout details';
  end if;
  begin
    perform public.admin_record_seller_payout(
      public.get_test_sale_id('40000000-0000-4000-8000-000000000004'),
      'PAYOUT-TOO-EARLY'
    );
    raise exception 'FAIL: payout allowed before delivery confirmation';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

-- Payout succeeds only after delivery is officially confirmed and uses e-Mola/VILASHOP.
reset role;
update public.marketplace_sales set status='delivery_confirmed'
where listing_id='40000000-0000-4000-8000-000000000004';
set role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',false);
select public.admin_record_seller_payout(
 public.get_test_sale_id('40000000-0000-4000-8000-000000000004'),
 'EMOLA-PAYOUT-001'
);
do $$ begin
  if not public.test_marketplace_sale_state('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','payout_recorded',null,'e-Mola','VILASHOP','EMOLA-PAYOUT-001') then
    raise exception 'FAIL: seller payout metadata is incorrect';
  end if;
end $$;

-- Null payment methods and oversized payout references must be rejected.
select public.create_marketplace_sale_with_payment(
 '50000000-0000-4000-8000-000000000005','in_person','e-Mola',null
);
do $ begin
  begin
    perform public.report_marketplace_payment(
      public.get_test_sale_id('50000000-0000-4000-8000-000000000005'),
      null,'NULL-METHOD'
    );
    raise exception 'FAIL: null payment method was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $;

-- An open dispute blocks settlement; oversized references are also rejected.
reset role;
update public.marketplace_sales set status='delivery_confirmed'
where listing_id='50000000-0000-4000-8000-000000000005';
set role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',false);
do $ begin
  begin
    perform public.admin_record_seller_payout(
      public.get_test_sale_id('50000000-0000-4000-8000-000000000005'),
      repeat('X',161)
    );
    raise exception 'FAIL: oversized payout reference was accepted';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $;
reset role;
insert into public.sale_disputes(sale_id,status)
select id,'open' from public.marketplace_sales
where listing_id='50000000-0000-4000-8000-000000000005';
set role authenticated;
select set_config('request.jwt.claim.sub','30000000-0000-4000-8000-000000000003',false);
do $ begin
  begin
    perform public.admin_record_seller_payout(
      public.get_test_sale_id('50000000-0000-4000-8000-000000000005'),
      'PAYOUT-BLOCKED'
    );
    raise exception 'FAIL: payout allowed while dispute is open';
  exception when others then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $;

reset role;
rollback;
