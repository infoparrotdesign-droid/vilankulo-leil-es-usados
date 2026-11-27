create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create table public.profiles (
  id uuid primary key references auth.users(id),
  display_name text not null
);
create table public.listings (
  id uuid primary key,
  seller_id uuid not null references auth.users(id),
  title text not null,
  status text not null
);

insert into auth.users(id) values
 ('00000000-0000-0000-0000-000000000001'),
 ('00000000-0000-0000-0000-000000000002'),
 ('00000000-0000-0000-0000-000000000003');
insert into public.profiles(id,display_name) values
 ('00000000-0000-0000-0000-000000000001','Comprador Teste'),
 ('00000000-0000-0000-0000-000000000002','Vendedor Teste'),
 ('00000000-0000-0000-0000-000000000003','Terceiro Teste');
insert into public.listings(id,seller_id,title,status) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','Bicicleta de teste','active');
create or replace function public.get_seller_contact(_listing_id uuid)
returns table(phone text) language sql as $$ select '841234567'::text $$;
