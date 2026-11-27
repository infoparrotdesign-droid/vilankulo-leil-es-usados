-- VilaShop: six-hour observation and trusted moderation.
create table if not exists public.vilashop_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.vilashop_admins enable row level security;
revoke all on public.vilashop_admins from anon, authenticated;
grant all on public.vilashop_admins to service_role;

create or replace function public.is_vilashop_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.vilashop_admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_vilashop_admin() from public, anon;
grant execute on function public.is_vilashop_admin() to authenticated;

create or replace function public.bootstrap_vilashop_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) = 'adminvilashop@gmail.com' and new.email_confirmed_at is not null then
    insert into public.vilashop_admins(user_id) values (new.id) on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.bootstrap_vilashop_admin() from public, anon, authenticated;
drop trigger if exists on_vilashop_admin_email_verified on auth.users;
create trigger on_vilashop_admin_email_verified
after insert or update of email, email_confirmed_at on auth.users
for each row execute function public.bootstrap_vilashop_admin();
insert into public.vilashop_admins(user_id)
select id from auth.users where lower(email) = 'adminvilashop@gmail.com' and email_confirmed_at is not null
on conflict (user_id) do nothing;

alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
check (status in ('pending_review','active','sold','withdrawn','ended','rejected','suspended'));
alter table public.listings
  add column if not exists submitted_at timestamptz,
  add column if not exists publish_after timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists review_note text;
alter table public.listings alter column status set default 'pending_review';
update public.listings set submitted_at = coalesce(submitted_at, created_at),
  publish_after = coalesce(publish_after, created_at + interval '6 hours')
where submitted_at is null or publish_after is null;
create index if not exists listings_publish_queue_idx on public.listings(status, publish_after) where status = 'pending_review';
create index if not exists listings_seller_status_idx on public.listings(seller_id, status, submitted_at desc);

create or replace function public.enforce_listing_observation_window()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'pending_review';
    new.submitted_at := now();
    new.publish_after := now() + interval '6 hours';
    new.reviewed_at := null; new.reviewed_by := null; new.review_note := null;
  elsif (
    new.title is distinct from old.title or new.description is distinct from old.description or
    new.category is distinct from old.category or new.item_condition is distinct from old.item_condition or
    new.listing_type is distinct from old.listing_type or new.price is distinct from old.price or
    new.auction_ends_at is distinct from old.auction_ends_at or new.photo_path is distinct from old.photo_path
  ) then
    new.status := 'pending_review';
    new.submitted_at := now();
    new.publish_after := now() + interval '6 hours';
    new.reviewed_at := null; new.reviewed_by := null; new.review_note := null;
  end if;
  return new;
end;
$$;
drop trigger if exists listings_enforce_observation_window on public.listings;
create trigger listings_enforce_observation_window before insert or update on public.listings
for each row execute function public.enforce_listing_observation_window();

drop policy if exists listings_public_active on public.listings;
create policy listings_public_active on public.listings for select to anon, authenticated using (status = 'active');
drop policy if exists listings_seller_read_own on public.listings;
create policy listings_seller_read_own on public.listings for select to authenticated using (seller_id = (select auth.uid()));
drop policy if exists listings_admin_read_all on public.listings;
create policy listings_admin_read_all on public.listings for select to authenticated using ((select public.is_vilashop_admin()));
drop policy if exists listings_seller_update_own on public.listings;
create policy listings_seller_update_own on public.listings for update to authenticated
using (seller_id = (select auth.uid()) and status = 'active')
with check (seller_id = (select auth.uid()) and status in ('active','pending_review'));

create or replace function public.admin_moderate_listing(_listing_id uuid, _decision text, _reason text default null)
returns public.listings language plpgsql security definer set search_path = ''
as $$
declare result_row public.listings; admin_id uuid := auth.uid();
begin
  if admin_id is null or not exists (select 1 from public.vilashop_admins a where a.user_id = admin_id) then
    raise exception 'Apenas a administração VilaShop pode moderar anúncios.';
  end if;
  if _decision not in ('approve','reject','suspend') then raise exception 'Decisão de moderação inválida.'; end if;
  if _decision in ('reject','suspend') and nullif(btrim(_reason), '') is null then
    raise exception 'Indique o motivo da rejeição ou suspensão.';
  end if;
  update public.listings set
    status = case when _decision = 'reject' then 'rejected' when _decision = 'suspend' then 'suspended' else status end,
    reviewed_at = now(), reviewed_by = admin_id, review_note = nullif(btrim(_reason), '')
  where id = _listing_id and (
    (_decision in ('approve','reject') and status = 'pending_review') or
    (_decision = 'suspend' and status in ('pending_review','active'))
  ) returning * into result_row;
  if not found then raise exception 'Anúncio não encontrado ou já não pode receber esta decisão.'; end if;
  return result_row;
end;
$$;
revoke all on function public.admin_moderate_listing(uuid,text,text) from public, anon;
grant execute on function public.admin_moderate_listing(uuid,text,text) to authenticated;

create or replace function public.publish_due_vilashop_listings()
returns integer language plpgsql set search_path = ''
as $$
declare published_count integer;
begin
  update public.listings set status = 'active'
  where status = 'pending_review' and publish_after <= now();
  get diagnostics published_count = row_count;
  return published_count;
end;
$$;
revoke all on function public.publish_due_vilashop_listings() from public, anon, authenticated;
grant execute on function public.publish_due_vilashop_listings() to service_role;

insert into storage.buckets(id,name,public) values ('boladas-media','boladas-media',false)
on conflict (id) do update set public = false;
create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'vilashop-publish-due-listings') then
    perform cron.schedule('vilashop-publish-due-listings','* * * * *','select public.publish_due_vilashop_listings();');
  end if;
end;
$$;
