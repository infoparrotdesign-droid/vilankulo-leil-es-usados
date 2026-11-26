-- Private, on-platform buyer/seller conversations. No phone or off-platform contact is exposed.
create table if not exists public.marketplace_conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketplace_conversations_distinct_users check (buyer_id <> seller_id),
  constraint marketplace_conversations_listing_buyer_seller_key unique (listing_id, buyer_id, seller_id)
);

create table if not exists public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.marketplace_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists marketplace_conversations_buyer_updated_idx
  on public.marketplace_conversations (buyer_id, updated_at desc);
create index if not exists marketplace_conversations_seller_updated_idx
  on public.marketplace_conversations (seller_id, updated_at desc);
create index if not exists marketplace_messages_conversation_created_idx
  on public.marketplace_messages (conversation_id, created_at);

alter table public.marketplace_conversations enable row level security;
alter table public.marketplace_messages enable row level security;
revoke all on public.marketplace_conversations from public, anon, authenticated;
revoke all on public.marketplace_messages from public, anon, authenticated;

create or replace function public.start_listing_conversation(_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  listing_row public.listings;
  conversation_id uuid;
begin
  if uid is null then raise exception 'Entre na sua conta para iniciar uma conversa.'; end if;

  select * into listing_row
  from public.listings
  where id = _listing_id and status = 'active';

  if not found then raise exception 'Este anúncio já não está disponível para conversa.'; end if;
  if listing_row.seller_id = uid then raise exception 'Não pode iniciar uma conversa consigo próprio.'; end if;

  insert into public.marketplace_conversations (listing_id, buyer_id, seller_id)
  values (_listing_id, uid, listing_row.seller_id)
  on conflict (listing_id, buyer_id, seller_id)
  do update set updated_at = public.marketplace_conversations.updated_at
  returning id into conversation_id;

  return conversation_id;
end;
$$;
revoke all on function public.start_listing_conversation(uuid) from public, anon;
grant execute on function public.start_listing_conversation(uuid) to authenticated;

create or replace function public.list_my_conversations()
returns table (
  conversation_id uuid,
  listing_id uuid,
  listing_title text,
  other_user_id uuid,
  other_user_name text,
  last_message text,
  last_message_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.listing_id, l.title,
    case when c.buyer_id = auth.uid() then c.seller_id else c.buyer_id end,
    coalesce(p.display_name, 'Utilizador VilaShop'),
    latest.body, coalesce(latest.created_at, c.updated_at),
    (select count(*) from public.marketplace_messages unread
      where unread.conversation_id = c.id
        and unread.sender_id <> auth.uid() and unread.read_at is null)
  from public.marketplace_conversations c
  join public.listings l on l.id = c.listing_id
  join public.profiles p on p.id = case when c.buyer_id = auth.uid() then c.seller_id else c.buyer_id end
  left join lateral (
    select m.body, m.created_at
    from public.marketplace_messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) latest on true
  where auth.uid() in (c.buyer_id, c.seller_id)
  order by coalesce(latest.created_at, c.updated_at) desc;
$$;
revoke all on function public.list_my_conversations() from public, anon;
grant execute on function public.list_my_conversations() to authenticated;

create or replace function public.get_conversation_messages(_conversation_id uuid)
returns table (
  id uuid,
  sender_id uuid,
  sender_name text,
  body text,
  created_at timestamptz,
  is_mine boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not exists (
    select 1 from public.marketplace_conversations c
    where c.id = _conversation_id and uid in (c.buyer_id, c.seller_id)
  ) then
    raise exception 'Não tem autorização para consultar esta conversa.';
  end if;

  update public.marketplace_messages
  set read_at = now()
  where conversation_id = _conversation_id and sender_id <> uid and read_at is null;

  return query
    select m.id, m.sender_id, coalesce(p.display_name, 'Utilizador VilaShop'),
      m.body, m.created_at, m.sender_id = uid
    from public.marketplace_messages m
    left join public.profiles p on p.id = m.sender_id
    where m.conversation_id = _conversation_id
    order by m.created_at asc;
end;
$$;
revoke all on function public.get_conversation_messages(uuid) from public, anon;
grant execute on function public.get_conversation_messages(uuid) to authenticated;

create or replace function public.send_conversation_message(_conversation_id uuid, _body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  clean_body text := btrim(coalesce(_body, ''));
  new_message_id uuid;
begin
  if uid is null then raise exception 'Entre na sua conta para enviar mensagens.'; end if;
  if char_length(clean_body) not between 1 and 2000 then
    raise exception 'A mensagem deve ter entre 1 e 2000 caracteres.';
  end if;
  if clean_body ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
     or clean_body ~* '(https?://|www\.)'
     or clean_body ~* '(^|[^0-9])((\+?258)[ .()-]*)?(8[2-7]|9[0-9])([ .()-]*[0-9]){7}([^0-9]|$)'
     or clean_body ~* '\m(whatsapp|telegram|instagram|facebook|messenger|viber|tiktok)\M' then
    raise exception 'Por segurança, mantenha a comunicação dentro do VilaShop e não partilhe contactos externos.';
  end if;
  if not exists (
    select 1 from public.marketplace_conversations c
    where c.id = _conversation_id and uid in (c.buyer_id, c.seller_id)
  ) then
    raise exception 'Não tem autorização para enviar mensagens nesta conversa.';
  end if;

  insert into public.marketplace_messages (conversation_id, sender_id, body)
  values (_conversation_id, uid, clean_body)
  returning id into new_message_id;

  update public.marketplace_conversations
  set updated_at = now()
  where id = _conversation_id;

  return new_message_id;
end;
$$;
revoke all on function public.send_conversation_message(uuid, text) from public, anon;
grant execute on function public.send_conversation_message(uuid, text) to authenticated;
