-- VilaShop community, negotiation, trust and manual transaction workflow.
-- Generated as a Supabase CLI migration by the GitHub Actions migration generator.
-- Scope: follows, favorites, notifications, offers, reports, disputes and manual sales.
-- No payment provider API is called: payment verification and seller settlement remain manual.

-- Marketplace profile type is informational and does not affect authorization.
alter table public.profiles
  add column if not exists seller_kind text not null default 'individual'
  check (seller_kind in ('individual','business'));

create or replace function public.create_profile_for_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  supplied_birth_date date;
  supplied_name text;
  supplied_phone text;
  supplied_address text;
  supplied_seller_kind text;
begin
  supplied_birth_date := nullif(new.raw_user_meta_data ->> 'birth_date', '')::date;
  supplied_name := nullif(btrim(new.raw_user_meta_data ->> 'full_name'), '');
  supplied_phone := nullif(btrim(new.raw_user_meta_data ->> 'phone'), '');
  supplied_address := nullif(btrim(new.raw_user_meta_data ->> 'address'), '');
  supplied_seller_kind := case when new.raw_user_meta_data ->> 'seller_kind' = 'business' then 'business' else 'individual' end;

  if supplied_birth_date is null and supplied_name is null and supplied_phone is null and supplied_address is null then
    return new;
  end if;
  if supplied_birth_date is null or supplied_birth_date > (current_date - interval '18 years')::date then
    raise exception 'A inscrição está disponível apenas para maiores de 18 anos.';
  end if;
  if supplied_name is null or char_length(supplied_name) not between 1 and 100
     or supplied_phone is null or char_length(supplied_phone) not between 5 and 30
     or supplied_address is null or char_length(supplied_address) not between 2 and 300 then
    raise exception 'Preencha correctamente os dados obrigatórios do perfil.';
  end if;
  insert into public.profiles (id,display_name,phone,address,birth_date,seller_kind)
  values (new.id,supplied_name,supplied_phone,supplied_address,supplied_birth_date,supplied_seller_kind);
  return new;
end;
$;
revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;

alter table public.listings drop constraint if exists listings_listing_type_check;
alter table public.listings add constraint listings_listing_type_check
  check (listing_type in ('sale','auction','negotiation'));
alter table public.listings drop constraint if exists auction_requires_end_time;
alter table public.listings add constraint auction_requires_end_time
  check ((listing_type='auction' and auction_ends_at is not null)
    or (listing_type in ('sale','negotiation') and auction_ends_at is null));

drop policy if exists listings_public_active on public.listings;
create policy listings_public_active on public.listings for select to anon, authenticated
  using (status='active' or (status='ended' and listing_type='auction'));

drop policy if exists marketplace_photos_read_active on storage.objects;
create policy marketplace_photos_read_active on storage.objects for select to anon, authenticated
using (
  bucket_id='boladas-media' and exists (
    select 1 from public.listings l
    where l.photo_path=storage.objects.name
      and (l.status='active' or (l.status='ended' and l.listing_type='auction'))
  )
);


alter table public.listings drop constraint if exists listings_status_check;
alter table public.listings add constraint listings_status_check
  check (status in ('pending_review','active','reserved','sold','withdrawn','ended','rejected','suspended'));

-- Follow sellers and save listings.
create table if not exists public.seller_follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint seller_follows_not_self check (follower_id <> seller_id),
  constraint seller_follows_unique unique (follower_id, seller_id)
);
create index if not exists seller_follows_seller_idx on public.seller_follows(seller_id, created_at desc);
alter table public.seller_follows enable row level security;
grant select, insert, delete on public.seller_follows to authenticated;
create policy seller_follows_read_own on public.seller_follows for select to authenticated
  using (follower_id = (select auth.uid()));
create policy seller_follows_insert_own on public.seller_follows for insert to authenticated
  with check (follower_id = (select auth.uid()) and follower_id <> seller_id);
create policy seller_follows_delete_own on public.seller_follows for delete to authenticated
  using (follower_id = (select auth.uid()));

create table if not exists public.listing_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint listing_favorites_unique unique (user_id, listing_id)
);
create index if not exists listing_favorites_listing_idx on public.listing_favorites(listing_id);
alter table public.listing_favorites enable row level security;
grant select, insert, delete on public.listing_favorites to authenticated;
create policy listing_favorites_read_own on public.listing_favorites for select to authenticated
  using (user_id = (select auth.uid()));
create policy listing_favorites_insert_own on public.listing_favorites for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy listing_favorites_delete_own on public.listing_favorites for delete to authenticated
  using (user_id = (select auth.uid()));

-- In-app notifications only; no SMS or WhatsApp provider is assumed.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('new_follower','new_listing','new_bid','new_offer','offer_update','sale_update','report_update','system')),
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 500),
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_inbox_idx on public.notifications(recipient_id, created_at desc);
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_read_own on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()))
  with check (recipient_id = (select auth.uid()));
revoke insert, delete on public.notifications from anon, authenticated;

create or replace function public.notify_new_follower()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare follower_name text;
begin
  select p.display_name into follower_name from public.profiles p where p.id = new.follower_id;
  insert into public.notifications(recipient_id, actor_id, kind, title, body, entity_type, entity_id)
  values (new.seller_id, new.follower_id, 'new_follower', 'Novo seguidor',
    coalesce(follower_name, 'Alguém') || ' começou a seguir a sua loja.',
    'seller', new.seller_id);
  return new;
end;
$$;
drop trigger if exists seller_follows_notify on public.seller_follows;
create trigger seller_follows_notify after insert on public.seller_follows
for each row execute function public.notify_new_follower();

create or replace function public.notify_followers_of_new_listing()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    insert into public.notifications(recipient_id, actor_id, kind, title, body, entity_type, entity_id)
    select f.follower_id, new.seller_id, 'new_listing', 'Nova publicação',
      'Uma loja que segue publicou: ' || new.title, 'listing', new.id
    from public.seller_follows f
    where f.seller_id = new.seller_id and f.follower_id <> new.seller_id;
  end if;
  return new;
end;
$$;
drop trigger if exists listings_notify_followers on public.listings;
create trigger listings_notify_followers after insert or update of status on public.listings
for each row execute function public.notify_followers_of_new_listing();

create or replace function public.notify_new_bid_to_seller()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare seller uuid; listing_title text;
begin
  select l.seller_id, l.title into seller, listing_title
  from public.listings l where l.id = new.listing_id;
  insert into public.notifications(recipient_id, actor_id, kind, title, body, entity_type, entity_id)
  values (seller, new.bidder_id, 'new_bid', 'Novo lance no seu leilão',
    'Foi registado um novo lance em "' || coalesce(listing_title, 'o seu anúncio') || '".',
    'listing', new.listing_id);
  return new;
end;
$$;
drop trigger if exists bids_notify_seller on public.bids;
create trigger bids_notify_seller after insert on public.bids
for each row execute function public.notify_new_bid_to_seller();

-- Offers support proposal, rejection and counterproposal for direct-sale listings.
create table if not exists public.listing_offers (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  counter_amount numeric(12,2) check (counter_amount is null or counter_amount > 0),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','countered','withdrawn','expired')),
  buyer_message text check (buyer_message is null or char_length(buyer_message) <= 500),
  seller_message text check (seller_message is null or char_length(seller_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint listing_offers_not_self check (buyer_id <> seller_id)
);
create index if not exists listing_offers_buyer_idx on public.listing_offers(buyer_id, created_at desc);
create index if not exists listing_offers_seller_idx on public.listing_offers(seller_id, created_at desc);
create index if not exists listing_offers_listing_idx on public.listing_offers(listing_id, created_at desc);
alter table public.listing_offers enable row level security;
grant select on public.listing_offers to authenticated;
create policy listing_offers_participant_read on public.listing_offers for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or (select public.is_vilashop_admin()));

create or replace function public.create_listing_offer(_listing_id uuid, _amount numeric, _message text default null)
returns public.listing_offers language plpgsql security definer set search_path = ''
as $$
declare l public.listings; result_row public.listing_offers; uid uuid := auth.uid();
begin
  if uid is null or not exists (select 1 from public.profiles p where p.id = uid) then
    raise exception 'Entre e complete o seu perfil para negociar.';
  end if;
  if _amount is null or _amount <= 0 then raise exception 'Indique um valor válido.'; end if;
  select * into l from public.listings where id = _listing_id for update;
  if not found or l.status <> 'active' or l.listing_type <> 'negotiation' then
    raise exception 'Este anúncio não aceita propostas neste momento.';
  end if;
  if l.seller_id = uid then raise exception 'Não pode negociar o seu próprio anúncio.'; end if;
  if exists (select 1 from public.listing_offers o where o.listing_id = _listing_id and o.buyer_id = uid and o.status = 'pending') then
    raise exception 'Já tem uma proposta pendente para este anúncio.';
  end if;
  insert into public.listing_offers(listing_id,buyer_id,seller_id,amount,buyer_message)
  values (_listing_id,uid,l.seller_id,_amount,nullif(btrim(_message),'')) returning * into result_row;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (l.seller_id,uid,'new_offer','Nova proposta recebida',
    'Recebeu uma proposta para "' || l.title || '".','offer',result_row.id);
  return result_row;
end;
$$;
revoke all on function public.create_listing_offer(uuid,numeric,text) from public, anon;
grant execute on function public.create_listing_offer(uuid,numeric,text) to authenticated;

create or replace function public.respond_listing_offer(_offer_id uuid, _decision text, _counter_amount numeric default null, _message text default null)
returns public.listing_offers language plpgsql security definer set search_path = ''
as $$
declare o public.listing_offers; result_row public.listing_offers; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Inicie sessão.'; end if;
  select * into o from public.listing_offers where id = _offer_id for update;
  if not found or o.seller_id <> uid or o.status <> 'pending' then
    raise exception 'Esta proposta já não está disponível para resposta.';
  end if;
  if _decision not in ('accept','reject','counter') then raise exception 'Resposta inválida.'; end if;
  if _decision = 'counter' and (_counter_amount is null or _counter_amount <= 0) then
    raise exception 'Indique o valor da contraproposta.';
  end if;
  update public.listing_offers set
    status = case _decision when 'accept' then 'accepted' when 'reject' then 'rejected' else 'countered' end,
    counter_amount = case when _decision = 'counter' then _counter_amount else null end,
    seller_message = nullif(btrim(_message),''),
    updated_at = now()
  where id = _offer_id returning * into result_row;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (o.buyer_id,uid,'offer_update','Resposta à sua proposta',
    case _decision when 'accept' then 'A sua proposta foi aceite.' when 'reject' then 'A sua proposta foi recusada.' else 'O vendedor enviou uma contraproposta.' end,
    'offer',_offer_id);
  return result_row;
end;
$$;
revoke all on function public.respond_listing_offer(uuid,text,numeric,text) from public, anon;
grant execute on function public.respond_listing_offer(uuid,text,numeric,text) to authenticated;

create or replace function public.accept_listing_counteroffer(_offer_id uuid)
returns public.listing_offers language plpgsql security definer set search_path = ''
as $$
declare o public.listing_offers; result_row public.listing_offers; uid uuid := auth.uid();
begin
  select * into o from public.listing_offers where id = _offer_id for update;
  if not found or o.buyer_id <> uid or o.status <> 'countered' or o.counter_amount is null then
    raise exception 'A contraproposta já não está disponível.';
  end if;
  update public.listing_offers set status='accepted', amount=counter_amount, updated_at=now()
  where id=_offer_id returning * into result_row;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (o.seller_id,uid,'offer_update','Contraproposta aceite','O comprador aceitou a sua contraproposta.','offer',_offer_id);
  return result_row;
end;
$$;
revoke all on function public.accept_listing_counteroffer(uuid) from public, anon;
grant execute on function public.accept_listing_counteroffer(uuid) to authenticated;

-- Automatically close auctions when their published deadline is reached.
create or replace function public.end_due_vilashop_auctions()
returns integer language plpgsql set search_path = ''
as $$
declare ended_count integer;
begin
  with ended as (
    update public.listings set status='ended'
    where status='active' and listing_type='auction' and auction_ends_at <= now()
    returning id,title,seller_id
  ), notified as (
    insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
    select winner.bidder_id,ended.seller_id,'sale_update','Leilão encerrado',
      'Parabéns! O seu lance venceu o leilão "' || ended.title || '". Pode acompanhar a compra na sua área de comunidade.',
      'listing',ended.id
    from ended
    join lateral (
      select b.bidder_id from public.bids b
      where b.listing_id=ended.id
      order by b.amount desc,b.created_at asc
      limit 1
    ) winner on true
    returning 1
  )
  select count(*) into ended_count from ended;
  return ended_count;
end;
$$;
revoke all on function public.end_due_vilashop_auctions() from public, anon, authenticated;
grant execute on function public.end_due_vilashop_auctions() to service_role;
do $$
begin
  if not exists (select 1 from cron.job where jobname='vilashop-end-due-auctions') then
    perform cron.schedule('vilashop-end-due-auctions','* * * * *','select public.end_due_vilashop_auctions();');
  end if;
end;
$;

-- Public bid history deliberately excludes bidder IDs and profile details.
create or replace function public.get_listing_bid_history(_listing_id uuid)
returns table (bid_number bigint, amount numeric, placed_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select row_number() over (order by b.created_at asc, b.id asc),
         b.amount, b.created_at
  from public.bids b
  join public.listings l on l.id = b.listing_id
  where b.listing_id = _listing_id
    and l.listing_type = 'auction'
    and l.status in ('active','ended','sold');
$$;
revoke all on function public.get_listing_bid_history(uuid) from public;
grant execute on function public.get_listing_bid_history(uuid) to anon, authenticated;

-- Prevent deletion of a listing once it has bids or a financial record.
create or replace function public.prevent_listing_delete_with_history()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.bids b where b.listing_id = old.id)
     or exists (select 1 from public.listing_offers o where o.listing_id = old.id) then
    raise exception 'Este anúncio tem histórico e não pode ser eliminado. Pode retirá-lo da venda.';
  end if;
  return old;
end;
$$;
drop trigger if exists listings_preserve_history on public.listings;
create trigger listings_preserve_history before delete on public.listings
for each row execute function public.prevent_listing_delete_with_history();

-- Manual payment and delivery workflow. No M-Pesa/e-Mola API is assumed.
create table if not exists public.marketplace_sales (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  offer_id uuid references public.listing_offers(id) on delete restrict,
  agreed_price numeric(12,2) not null check (agreed_price > 0),
  commission_rate numeric(5,4) not null default 0.05 check (commission_rate = 0.05),
  commission_amount numeric(12,2) generated always as (round(agreed_price * commission_rate,2)) stored,
  seller_net_amount numeric(12,2) generated always as (agreed_price - round(agreed_price * commission_rate,2)) stored,
  delivery_method text not null check (delivery_method in ('in_person','seller_delivery')),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment','payment_reported','payment_confirmed','seller_delivered','buyer_confirmed','disputed','delivery_confirmed','payout_recorded','cancelled')),
  payment_method text,
  payment_reference text,
  payment_reported_at timestamptz,
  payment_verified_at timestamptz,
  payment_verified_by uuid references auth.users(id) on delete set null,
  seller_delivered_at timestamptz,
  buyer_confirmed_at timestamptz,
  buyer_confirmation_deadline timestamptz,
  delivery_confirmed_at timestamptz,
  delivery_confirmed_by uuid references auth.users(id) on delete set null,
  payout_due_at timestamptz,
  payout_recorded_at timestamptz,
  payout_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_sales_not_self check (buyer_id <> seller_id)
);
create unique index if not exists marketplace_sales_one_open_per_listing
  on public.marketplace_sales(listing_id) where status <> 'cancelled';
create index if not exists marketplace_sales_buyer_idx on public.marketplace_sales(buyer_id,created_at desc);
create index if not exists marketplace_sales_seller_idx on public.marketplace_sales(seller_id,created_at desc);
alter table public.marketplace_sales enable row level security;
grant select on public.marketplace_sales to authenticated;
create policy marketplace_sales_participant_read on public.marketplace_sales for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()) or (select public.is_vilashop_admin()));

create table if not exists public.sale_disputes (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.marketplace_sales(id) on delete restrict,
  opened_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (char_length(reason) between 10 and 2000),
  evidence_note text check (evidence_note is null or char_length(evidence_note) <= 2000),
  status text not null default 'open' check (status in ('open','under_review','resolved_buyer','resolved_seller','closed')),
  resolution_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.sale_disputes enable row level security;
grant select on public.sale_disputes to authenticated;
create policy sale_disputes_participant_read on public.sale_disputes for select to authenticated
  using (opened_by = (select auth.uid()) or exists (
    select 1 from public.marketplace_sales s where s.id = sale_id
      and (s.buyer_id = (select auth.uid()) or s.seller_id = (select auth.uid()))
  ) or (select public.is_vilashop_admin()));

-- Reports for suspicious listings; admins review them in the moderation queue.
create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  reporter_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (reason in ('suspected_fraud','prohibited_item','misleading','duplicate','harassment','other')),
  details text not null check (char_length(details) between 10 and 1500),
  status text not null default 'open' check (status in ('open','under_review','resolved','dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now()
);
create index if not exists listing_reports_queue_idx on public.listing_reports(status,created_at);
alter table public.listing_reports enable row level security;
grant select, insert on public.listing_reports to authenticated;
create policy listing_reports_read_own_or_admin on public.listing_reports for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_vilashop_admin()));
create policy listing_reports_insert_own on public.listing_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
revoke update, delete on public.listing_reports from authenticated;

-- Start a sale atomically, reserving the listing and locking its final price.
create or replace function public.create_marketplace_sale(_listing_id uuid, _delivery_method text, _offer_id uuid default null)
returns public.marketplace_sales language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  l public.listings;
  final_price numeric(12,2);
  selected_offer public.listing_offers;
  result_row public.marketplace_sales;
begin
  if uid is null or not exists (select 1 from public.profiles p where p.id=uid) then
    raise exception 'Entre e complete o seu perfil para comprar.';
  end if;
  if _delivery_method not in ('in_person','seller_delivery') then raise exception 'Método de entrega inválido.'; end if;
  select * into l from public.listings where id=_listing_id for update;
  if not found or (l.listing_type='sale' and l.status<>'active') or (l.listing_type='auction' and l.status<>'ended') then
    raise exception 'Este anúncio já não está disponível.';
  end if;
  if l.seller_id=uid then raise exception 'Não pode comprar o seu próprio artigo.'; end if;

  if l.listing_type='auction' then
    if l.status <> 'ended' or _offer_id is not null then raise exception 'O leilão ainda não terminou.'; end if;
    select b.amount into final_price from public.bids b
      where b.listing_id=l.id order by b.amount desc,b.created_at asc limit 1;
    if final_price is null or not exists (
      select 1 from public.bids b where b.listing_id=l.id and b.bidder_id=uid and b.amount=final_price
    ) then raise exception 'Só o vencedor do leilão pode iniciar esta compra.'; end if;
  elsif l.listing_type='negotiation' and _offer_id is null then
    raise exception 'Este anúncio exige uma proposta aceite antes da compra.';
  elsif _offer_id is not null then
    select * into selected_offer from public.listing_offers o
      where o.id=_offer_id and o.listing_id=l.id and o.buyer_id=uid and o.seller_id=l.seller_id and o.status='accepted'
      for update;
    if not found then raise exception 'Não existe uma proposta aceite para esta compra.'; end if;
    final_price := selected_offer.amount;
  else
    final_price := l.price;
  end if;

  insert into public.marketplace_sales(listing_id,buyer_id,seller_id,offer_id,agreed_price,delivery_method)
  values (l.id,uid,l.seller_id,_offer_id,final_price,_delivery_method)
  returning * into result_row;
  update public.listings set status='reserved' where id=l.id;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (l.seller_id,uid,'sale_update','Novo pedido de compra','Um comprador iniciou o processo de compra do seu artigo.','sale',result_row.id);
  return result_row;
end;
$$;
revoke all on function public.create_marketplace_sale(uuid,text,uuid) from public, anon;
grant execute on function public.create_marketplace_sale(uuid,text,uuid) to authenticated;

create or replace function public.report_marketplace_payment(_sale_id uuid,_payment_method text,_payment_reference text)
returns public.marketplace_sales language plpgsql security definer set search_path = ''
as $$
declare s public.marketplace_sales; result_row public.marketplace_sales; uid uuid:=auth.uid();
begin
  select * into s from public.marketplace_sales where id=_sale_id for update;
  if not found or s.buyer_id<>uid or s.status<>'awaiting_payment' then raise exception 'Este pagamento já não pode ser reportado.'; end if;
  if nullif(btrim(_payment_method),'') is null or nullif(btrim(_payment_reference),'') is null then
    raise exception 'Indique o meio e a referência do pagamento.';
  end if;
  update public.marketplace_sales set status='payment_reported',payment_method=btrim(_payment_method),
    payment_reference=btrim(_payment_reference),payment_reported_at=now(),updated_at=now()
  where id=_sale_id returning * into result_row;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (s.seller_id,uid,'sale_update','Pagamento comunicado','O comprador comunicou o pagamento. A equipa VilaShop fará a verificação.','sale',_sale_id);
  return result_row;
end;
$$;
revoke all on function public.report_marketplace_payment(uuid,text,text) from public, anon;
grant execute on function public.report_marketplace_payment(uuid,text,text) to authenticated;

create or replace function public.admin_verify_marketplace_payment(_sale_id uuid)
returns public.marketplace_sales language plpgsql security definer set search_path = ''
as $$
declare s public.marketplace_sales; result_row public.marketplace_sales; uid uuid:=auth.uid();
begin
  if uid is null or not public.is_vilashop_admin() then raise exception 'Apenas a administração pode verificar pagamentos.'; end if;
  update public.marketplace_sales set status='payment_confirmed',payment_verified_at=now(),payment_verified_by=uid,updated_at=now()
  where id=_sale_id and status='payment_reported' returning * into result_row;
  if not found then raise exception 'O pagamento não está pendente de verificação.'; end if;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (result_row.buyer_id,uid,'sale_update','Pagamento confirmado','O VilaShop confirmou o pagamento do seu pedido.','sale',_sale_id),
         (result_row.seller_id,uid,'sale_update','Pagamento confirmado','O pagamento do comprador foi confirmado. Pode organizar a entrega.','sale',_sale_id);
  return result_row;
end;
$$;
revoke all on function public.admin_verify_marketplace_payment(uuid) from public, anon;
grant execute on function public.admin_verify_marketplace_payment(uuid) to authenticated;

create or replace function public.seller_mark_sale_delivered(_sale_id uuid)
returns public.marketplace_sales language plpgsql security definer set search_path = ''
as $$
declare s public.marketplace_sales; result_row public.marketplace_sales; uid uuid:=auth.uid();
begin
  update public.marketplace_sales set status='seller_delivered',seller_delivered_at=now(),
    buyer_confirmation_deadline=now()+interval '48 hours',updated_at=now()
  where id=_sale_id and seller_id=uid and status='payment_confirmed' returning * into result_row;
  if not found then raise exception 'O pedido ainda não está pronto para registar a entrega.'; end if;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (result_row.buyer_id,uid,'sale_update','Entrega comunicada','O vendedor informou que entregou o artigo. Confirme a recepção ou apresente uma reclamação em 48 horas.','sale',_sale_id);
  return result_row;
end;
$$;
revoke all on function public.seller_mark_sale_delivered(uuid) from public, anon;
grant execute on function public.seller_mark_sale_delivered(uuid) to authenticated;

create or replace function public.buyer_confirm_sale_receipt(_sale_id uuid)
returns public.marketplace_sales language plpgsql security definer set search_path = ''
as $$
declare result_row public.marketplace_sales; uid uuid:=auth.uid();
begin
  update public.marketplace_sales set status='buyer_confirmed',buyer_confirmed_at=now(),updated_at=now()
  where id=_sale_id and buyer_id=uid and status='seller_delivered'
    and buyer_confirmation_deadline>=now()
  returning * into result_row;
  if not found then raise exception 'Não é possível confirmar esta entrega. Verifique o prazo de 48 horas.'; end if;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (result_row.seller_id,uid,'sale_update','Recepção confirmada','O comprador confirmou a recepção. A equipa VilaShop fará a validação final.','sale',_sale_id);
  return result_row;
end;
$$;
revoke all on function public.buyer_confirm_sale_receipt(uuid) from public, anon;
grant execute on function public.buyer_confirm_sale_receipt(uuid) to authenticated;

create or replace function public.open_sale_dispute(_sale_id uuid,_reason text,_evidence_note text default null)
returns public.sale_disputes language plpgsql security definer set search_path = ''
as $$
declare s public.marketplace_sales; result_row public.sale_disputes; uid uuid:=auth.uid();
begin
  select * into s from public.marketplace_sales where id=_sale_id for update;
  if not found or s.buyer_id<>uid or s.status<>'seller_delivered'
    or s.buyer_confirmation_deadline<now() then
    raise exception 'A reclamação deve ser apresentada pelo comprador dentro das 48 horas após a entrega comunicada.';
  end if;
  if char_length(btrim(coalesce(_reason,''))) not between 10 and 2000 then raise exception 'Descreva a reclamação (10 a 2000 caracteres).'; end if;
  insert into public.sale_disputes(sale_id,opened_by,reason,evidence_note)
  values (_sale_id,uid,btrim(_reason),nullif(btrim(_evidence_note),'')) returning * into result_row;
  update public.marketplace_sales set status='disputed',updated_at=now() where id=_sale_id;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (s.seller_id,uid,'sale_update','Reclamação aberta','O comprador abriu uma reclamação. A liquidação fica suspensa até decisão da equipa.','sale',_sale_id);
  return result_row;
end;
$$;
revoke all on function public.open_sale_dispute(uuid,text,text) from public, anon;
grant execute on function public.open_sale_dispute(uuid,text,text) to authenticated;

create or replace function public.admin_confirm_sale_delivery(_sale_id uuid)
returns public.marketplace_sales language plpgsql security definer set search_path = ''
as $$
declare s public.marketplace_sales; result_row public.marketplace_sales; uid uuid:=auth.uid();
begin
  if uid is null or not public.is_vilashop_admin() then raise exception 'Apenas a equipa VilaShop pode confirmar oficialmente a entrega.'; end if;
  update public.marketplace_sales set status='delivery_confirmed',delivery_confirmed_at=now(),
    delivery_confirmed_by=uid,payout_due_at=now()+interval '3 days',updated_at=now()
  where id=_sale_id and status='buyer_confirmed'
  returning * into result_row;
  if not found then raise exception 'A entrega exige confirmação do comprador e não pode ter reclamação pendente.'; end if;
  update public.listings set status='sold',
    delivery_confirmed_at=now(),photos_delete_after=now()+interval '72 hours',
    reviewed_at=coalesce(reviewed_at,now()),reviewed_by=uid
  where id=result_row.listing_id;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (result_row.buyer_id,uid,'sale_update','Entrega validada','A equipa VilaShop confirmou oficialmente a entrega.','sale',_sale_id),
         (result_row.seller_id,uid,'sale_update','Entrega validada','A liquidação do seu valor está prevista até 3 dias após a validação.','sale',_sale_id);
  return result_row;
end;
$$;
revoke all on function public.admin_confirm_sale_delivery(uuid) from public, anon;
grant execute on function public.admin_confirm_sale_delivery(uuid) to authenticated;

create or replace function public.admin_record_seller_payout(_sale_id uuid,_payout_reference text)
returns public.marketplace_sales language plpgsql security definer set search_path = ''
as $$
declare result_row public.marketplace_sales; uid uuid:=auth.uid();
begin
  if uid is null or not public.is_vilashop_admin() then raise exception 'Apenas a administração pode registar a liquidação.'; end if;
  if nullif(btrim(_payout_reference),'') is null then raise exception 'Registe a referência do pagamento ao vendedor.'; end if;
  update public.marketplace_sales set status='payout_recorded',payout_recorded_at=now(),
    payout_reference=btrim(_payout_reference),updated_at=now()
  where id=_sale_id and status='delivery_confirmed'
    and not exists (select 1 from public.sale_disputes d where d.sale_id=_sale_id and d.status in ('open','under_review'))
  returning * into result_row;
  if not found then raise exception 'A liquidação está bloqueada ou a venda ainda não foi validada.'; end if;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (result_row.seller_id,uid,'sale_update','Pagamento ao vendedor registado',
    'O VilaShop registou a liquidação de ' || result_row.seller_net_amount::text || ' MZN.','sale',_sale_id);
  return result_row;
end;
$$;
revoke all on function public.admin_record_seller_payout(uuid,text) from public, anon;
grant execute on function public.admin_record_seller_payout(uuid,text) to authenticated;

-- A sale with a dispute cannot be completed until an admin resolves it.
create or replace function public.admin_resolve_sale_dispute(_dispute_id uuid,_resolution text,_note text)
returns public.sale_disputes language plpgsql security definer set search_path = ''
as $$
declare d public.sale_disputes; result_row public.sale_disputes; uid uuid:=auth.uid();
begin
  if uid is null or not public.is_vilashop_admin() then raise exception 'Apenas a equipa VilaShop pode resolver reclamações.'; end if;
  if _resolution not in ('resolved_buyer','resolved_seller') or char_length(btrim(coalesce(_note,'')))<10 then
    raise exception 'Indique uma decisão e uma nota de resolução (mínimo 10 caracteres).';
  end if;
  update public.sale_disputes set status=_resolution,resolution_note=btrim(_note),reviewed_by=uid,reviewed_at=now()
  where id=_dispute_id and status in ('open','under_review') returning * into result_row;
  if not found then raise exception 'A reclamação já foi tratada.'; end if;
  if _resolution='resolved_seller' then
    update public.marketplace_sales set status='buyer_confirmed',updated_at=now() where id=result_row.sale_id and status='disputed';
  else
    update public.marketplace_sales set status='cancelled',updated_at=now() where id=result_row.sale_id and status='disputed';
    update public.listings set status='suspended', review_note='Venda em reclamação resolvida a favor do comprador; requer revisão administrativa antes de voltar a publicar.'
    where id=(select s.listing_id from public.marketplace_sales s where s.id=result_row.sale_id);
  end if;
  return result_row;
end;
$$;
revoke all on function public.admin_resolve_sale_dispute(uuid,text,text) from public, anon;
grant execute on function public.admin_resolve_sale_dispute(uuid,text,text) to authenticated;

-- Public seller profile RPC exposes no phone, address or date of birth.
create or replace function public.get_public_seller_profile(_seller_id uuid)
returns table (seller_id uuid, display_name text, member_since timestamptz, active_listings bigint, follower_count bigint)
language sql stable security definer set search_path = ''
as $$
  select p.id,p.display_name,p.created_at,
    (select count(*) from public.listings l where l.seller_id=p.id and l.status='active'),
    (select count(*) from public.seller_follows f where f.seller_id=p.id)
  from public.profiles p where p.id=_seller_id;
$$;
revoke all on function public.get_public_seller_profile(uuid) from public;
grant execute on function public.get_public_seller_profile(uuid) to anon, authenticated;
grant update (seller_kind) on public.profiles to authenticated;


create or replace function public.admin_review_listing_report(_report_id uuid,_decision text,_note text)
returns public.listing_reports language plpgsql security definer set search_path = ''
as $$
declare result_row public.listing_reports; uid uuid:=auth.uid();
begin
  if uid is null or not public.is_vilashop_admin() then raise exception 'Apenas a equipa VilaShop pode rever denúncias.'; end if;
  if _decision not in ('under_review','resolved','dismissed') then raise exception 'Decisão de denúncia inválida.'; end if;
  update public.listing_reports set status=_decision,reviewed_by=uid,reviewed_at=now(),
    resolution_note=nullif(btrim(_note),'')
  where id=_report_id and status in ('open','under_review')
  returning * into result_row;
  if not found then raise exception 'Denúncia não encontrada ou já tratada.'; end if;
  insert into public.notifications(recipient_id,actor_id,kind,title,body,entity_type,entity_id)
  values (result_row.reporter_id,uid,'report_update','Actualização da denúncia',
    case _decision when 'under_review' then 'A sua denúncia está a ser analisada.' when 'resolved' then 'A sua denúncia foi analisada e resolvida.' else 'A sua denúncia foi analisada e arquivada.' end,
    'report',_report_id);
  return result_row;
end;
$;
revoke all on function public.admin_review_listing_report(uuid,text,text) from public, anon;
grant execute on function public.admin_review_listing_report(uuid,text,text) to authenticated;

-- Admins can read and process reports and disputes; participants retain read access.
create policy listing_reports_admin_read on public.listing_reports for select to authenticated
  using ((select public.is_vilashop_admin()));
create policy sale_disputes_admin_read on public.sale_disputes for select to authenticated
  using ((select public.is_vilashop_admin()));

-- Listing history must survive sale/photo cleanup. Existing bids remain append-only:
-- no UPDATE/DELETE grant is given to authenticated users.
