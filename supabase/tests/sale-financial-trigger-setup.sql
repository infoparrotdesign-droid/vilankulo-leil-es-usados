-- Isolated PostgreSQL fixture: intentionally omits commission_rate from marketplace_sales.
-- Supabase roles referenced by the migration are stubbed only in this disposable database.
create role anon;
create role authenticated;

create table public.marketplace_sales (
  id uuid primary key,
  agreed_price numeric(12,2) not null
);

create table public.marketplace_sale_financials (
  sale_id uuid primary key references public.marketplace_sales(id),
  commission_rate numeric(5,4) not null,
  commission_amount numeric(12,2) not null,
  buyer_total_amount numeric(12,2) not null,
  seller_net_amount numeric(12,2) not null
);
