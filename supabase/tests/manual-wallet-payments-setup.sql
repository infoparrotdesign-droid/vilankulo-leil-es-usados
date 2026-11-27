-- Disposable PostgreSQL fixture for VilaShop manual-wallet migration.
-- No production data, credentials, or hosted Supabase connection are used.
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.profiles (
  id uuid primary key,
  display_name text not null,
  is_vilashop_admin boolean not null default false
);
create or replace function public.is_vilashop_admin() returns boolean
language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_vilashop_admin) $$;

create table public.listings (
  id uuid primary key,
  seller_id uuid not null references public.profiles(id),
  title text not null,
  status text not null default 'active',
  listing_type text not null default 'sale',
  price numeric(12,2) not null
);
create table public.marketplace_sales (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  buyer_id uuid not null references public.profiles(id),
  seller_id uuid not null references public.profiles(id),
  agreed_price numeric(12,2) not null,
  delivery_method text not null,
  status text not null default 'awaiting_payment',
  payment_method text,
  payment_reference text,
  payment_reported_at timestamptz,
  payout_reference text,
  payout_recorded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint marketplace_sales_not_self check (buyer_id <> seller_id)
);
create table public.marketplace_sale_financials (
  sale_id uuid primary key references public.marketplace_sales(id),
  commission_rate numeric(5,4) not null,
  commission_amount numeric(12,2) not null,
  buyer_total_amount numeric(12,2) not null,
  seller_net_amount numeric(12,2) not null
);
create table public.sale_disputes (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.marketplace_sales(id),
  status text not null
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id),
  actor_id uuid references public.profiles(id),
  kind text not null,
  title text not null,
  body text not null,
  entity_type text,
  entity_id uuid
);

-- Minimal equivalent of the existing sale-creation RPC; the trigger migration
-- under test supplies the private 10% financial capture.
create or replace function public.create_marketplace_sale(_listing_id uuid,_delivery_method text,_offer_id uuid default null)
returns public.marketplace_sales
language plpgsql security definer set search_path=''
as $$
declare l public.listings; s public.marketplace_sales; buyer uuid:=auth.uid();
begin
  select * into l from public.listings where id=_listing_id;
  if buyer is null or l.id is null or l.status<>'active' or l.seller_id=buyer then
    raise exception 'sale fixture rejected';
  end if;
  insert into public.marketplace_sales(listing_id,buyer_id,seller_id,agreed_price,delivery_method)
  values(l.id,buyer,l.seller_id,l.price,_delivery_method) returning * into s;
  update public.listings set status='reserved' where id=l.id;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values(l.seller_id,buyer,'sale_update','Novo pedido','Novo pedido de compra.','sale',s.id);
  return s;
end;
$$;
grant usage on schema public, auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant execute on function public.is_vilashop_admin() to authenticated;
grant execute on function public.create_marketplace_sale(uuid,text,uuid) to authenticated;

create or replace function public.test_marketplace_sale_state(
  _listing_id uuid,_buyer_id uuid,_status text,_payment_method text default null,
  _payout_method text default null,_payout_content text default null,_payout_reference text default null
) returns boolean
language sql stable security definer set search_path=''
as $
  select exists(
    select 1 from public.marketplace_sales s
    where s.listing_id=_listing_id and s.buyer_id=_buyer_id and s.status=_status
      and (_payment_method is null or s.payment_method=_payment_method)
      and (_payout_method is null or s.payout_method=_payout_method)
      and (_payout_content is null or s.payout_content=_payout_content)
      and (_payout_reference is null or s.payout_reference=_payout_reference)
  );
$;
grant execute on function public.test_marketplace_sale_state(uuid,uuid,text,text,text,text,text) to authenticated;
create or replace function public.get_test_sale_id(_listing_id uuid)
returns uuid language sql stable security definer set search_path=''
as $ select s.id from public.marketplace_sales s where s.listing_id=_listing_id order by s.id desc limit 1 $;
grant execute on function public.get_test_sale_id(uuid) to authenticated;

insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002'),
 ('30000000-0000-4000-8000-000000000003');
insert into public.profiles(id,display_name,is_vilashop_admin) values
 ('10000000-0000-4000-8000-000000000001','Comprador de teste',false),
 ('20000000-0000-4000-8000-000000000002','Vendedor de teste',false),
 ('30000000-0000-4000-8000-000000000003','Admin de teste',true);
insert into public.listings(id,seller_id,title,price) values
 ('40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','Artigo de teste',1000.00),
 ('50000000-0000-4000-8000-000000000005','20000000-0000-4000-8000-000000000002','Artigo com disputa',2000.00);
