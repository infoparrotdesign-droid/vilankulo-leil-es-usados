-- Private seller e-Mola settlement details and public VilaShop collection wallets.
-- Payments remain manual: the platform verifies incoming transfers and records outgoing settlements.

alter table public.marketplace_sales
  add column if not exists payout_method text,
  add column if not exists payout_content text;

alter table public.marketplace_sales
  drop constraint if exists marketplace_sales_payment_method_check;
alter table public.marketplace_sales
  add constraint marketplace_sales_payment_method_check
  check (payment_method is null or payment_method in ('e-Mola','M-Pesa'));

create table if not exists public.seller_payout_details (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  emola_number text not null check (emola_number ~ '^(\+?258)?[0-9]{9}$'),
  account_holder text not null check (char_length(btrim(account_holder)) between 3 and 120),
  updated_at timestamptz not null default now()
);
alter table public.seller_payout_details enable row level security;
revoke all on public.seller_payout_details from public, anon, authenticated;

create or replace function public.save_my_seller_payout_details(_emola_number text, _account_holder text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare uid uuid := auth.uid(); normalized_number text;
begin
  if uid is null or not exists (select 1 from public.profiles p where p.id=uid) then
    raise exception 'Inicie sessão e complete o seu perfil.';
  end if;
  normalized_number := regexp_replace(coalesce(_emola_number,''), '[[:space:]-]', '', 'g');
  if normalized_number !~ '^(\+?258)?[0-9]{9}$' then
    raise exception 'Indique um número e-Mola válido, com 9 dígitos ou indicativo +258.';
  end if;
  if char_length(btrim(coalesce(_account_holder,''))) not between 3 and 120 then
    raise exception 'Indique o nome do titular da carteira e-Mola.';
  end if;
  insert into public.seller_payout_details(seller_id,emola_number,account_holder,updated_at)
  values(uid,normalized_number,btrim(_account_holder),now())
  on conflict(seller_id) do update set
    emola_number=excluded.emola_number,
    account_holder=excluded.account_holder,
    updated_at=now();
end;
$$;
revoke all on function public.save_my_seller_payout_details(text,text) from public, anon;
grant execute on function public.save_my_seller_payout_details(text,text) to authenticated;

create or replace function public.get_my_seller_payout_details()
returns table(emola_number text, account_holder text, updated_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select d.emola_number,d.account_holder,d.updated_at
  from public.seller_payout_details d
  where d.seller_id=(select auth.uid());
$$;
revoke all on function public.get_my_seller_payout_details() from public, anon;
grant execute on function public.get_my_seller_payout_details() to authenticated;

create or replace function public.admin_list_seller_payout_details()
returns table(seller_id uuid, display_name text, emola_number text, account_holder text, updated_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_vilashop_admin() then
    raise exception 'Apenas a administração pode consultar os dados de recebimento dos vendedores.';
  end if;
  return query
    select d.seller_id,p.display_name,d.emola_number,d.account_holder,d.updated_at
    from public.seller_payout_details d
    left join public.profiles p on p.id=d.seller_id
    order by p.display_name;
end;
$$;
revoke all on function public.admin_list_seller_payout_details() from public, anon;
grant execute on function public.admin_list_seller_payout_details() to authenticated;

create or replace function public.create_marketplace_sale_with_payment(
  _listing_id uuid, _delivery_method text, _payment_method text, _offer_id uuid default null
)
returns public.marketplace_sales
language plpgsql security definer set search_path = ''
as $$
declare created_sale public.marketplace_sales;
begin
  if _payment_method is null or _payment_method not in ('e-Mola','M-Pesa') then
    raise exception 'Escolha e-Mola ou M-Pesa para pagar ao VilaShop.';
  end if;
  created_sale := public.create_marketplace_sale(_listing_id,_delivery_method,_offer_id);
  update public.marketplace_sales
    set payment_method=_payment_method,updated_at=now()
    where id=created_sale.id and buyer_id=auth.uid()
    returning * into created_sale;
  return created_sale;
end;
$$;
revoke all on function public.create_marketplace_sale_with_payment(uuid,text,text,uuid) from public, anon;
grant execute on function public.create_marketplace_sale_with_payment(uuid,text,text,uuid) to authenticated;

create or replace function public.report_marketplace_payment(_sale_id uuid,_payment_method text,_payment_reference text)
returns public.marketplace_sales
language plpgsql security definer set search_path = ''
as $$
declare s public.marketplace_sales; result_row public.marketplace_sales; uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Inicie sessão.'; end if;
  if _payment_method not in ('e-Mola','M-Pesa') then raise exception 'Escolha e-Mola ou M-Pesa.'; end if;
  if nullif(btrim(_payment_reference),'') is null or char_length(btrim(_payment_reference)) > 160 then
    raise exception 'Indique uma referência de pagamento válida.';
  end if;
  select * into s from public.marketplace_sales where id=_sale_id for update;
  if not found or s.buyer_id<>uid or s.status<>'awaiting_payment' then
    raise exception 'Este pagamento já não pode ser reportado.';
  end if;
  update public.marketplace_sales set status='payment_reported',
    payment_method=_payment_method,payment_reference=btrim(_payment_reference),
    payment_reported_at=now(),updated_at=now()
  where id=_sale_id returning * into result_row;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (s.seller_id,uid,'sale_update','Pagamento comunicado',
    'O comprador comunicou o pagamento. A equipa VilaShop fará a verificação.','sale',_sale_id);
  return result_row;
end;
$$;
revoke all on function public.report_marketplace_payment(uuid,text,text) from public, anon;
grant execute on function public.report_marketplace_payment(uuid,text,text) to authenticated;

create or replace function public.admin_record_seller_payout(_sale_id uuid,_payout_reference text)
returns public.marketplace_sales
language plpgsql security definer set search_path = ''
as $$
declare result_row public.marketplace_sales; seller_net numeric(12,2); uid uuid:=auth.uid();
begin
  if uid is null or not public.is_vilashop_admin() then
    raise exception 'Apenas a administração pode registar a liquidação.';
  end if;
  if nullif(btrim(_payout_reference),'') is null or char_length(btrim(_payout_reference)) > 160 then
    raise exception 'Registe a referência da transferência e-Mola.';
  end if;
  if not exists(select 1 from public.seller_payout_details d
    join public.marketplace_sales s on s.seller_id=d.seller_id
    where s.id=_sale_id) then
    raise exception 'O vendedor ainda não registou os seus dados e-Mola.';
  end if;
  update public.marketplace_sales
  set status='payout_recorded',payout_recorded_at=now(),
      payout_reference=btrim(_payout_reference),payout_method='e-Mola',
      payout_content='VILASHOP',updated_at=now()
  where id=_sale_id and status='delivery_confirmed'
    and not exists(select 1 from public.sale_disputes d
      where d.sale_id=_sale_id and d.status in ('open','under_review'))
  returning * into result_row;
  if not found then raise exception 'A liquidação está bloqueada ou a venda ainda não foi validada.'; end if;
  select f.seller_net_amount into seller_net
  from public.marketplace_sale_financials f where f.sale_id=_sale_id;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values(result_row.seller_id,uid,'sale_update','Pagamento ao vendedor registado',
    'O VilaShop registou a liquidação de '||seller_net::text||' MZN.','sale',_sale_id);
  return result_row;
end;
$$;
revoke all on function public.admin_record_seller_payout(uuid,text) from public, anon;
grant execute on function public.admin_record_seller_payout(uuid,text) to authenticated;
