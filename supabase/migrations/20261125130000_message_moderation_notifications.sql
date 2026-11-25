-- Secure queue for messages explicitly flagged by VilaShop moderation.
-- This migration is versioned only; production application remains manual.
create table if not exists public.message_moderation_flags (
  id uuid primary key default gen_random_uuid(),
  message_id text not null check (char_length(btrim(message_id)) between 1 and 128),
  conversation_id text check (conversation_id is null or char_length(conversation_id) <= 128),
  flagged_by uuid not null references auth.users(id) on delete restrict,
  category text not null check (category in (
    'personal_contact',
    'offensive_language',
    'threat',
    'discrimination',
    'other'
  )),
  message_content text not null check (char_length(btrim(message_content)) between 1 and 5000),
  details text check (details is null or char_length(details) <= 1000),
  review_status text not null default 'open'
    check (review_status in ('open','under_review','resolved','dismissed')),
  email_status text not null default 'pending'
    check (email_status in ('pending','sending','sent','failed')),
  email_message_id text,
  email_started_at timestamptz,
  email_error text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (message_id, category, flagged_by),
  check ((reviewed_at is null) = (reviewed_by is null)),
  check (email_status <> 'sending' or email_started_at is not null)
);

create index if not exists message_moderation_flags_queue_idx
  on public.message_moderation_flags(review_status, created_at desc);
create index if not exists message_moderation_flags_reporter_idx
  on public.message_moderation_flags(flagged_by, created_at desc);

alter table public.message_moderation_flags enable row level security;
revoke all on public.message_moderation_flags from anon, authenticated;
grant select on public.message_moderation_flags to authenticated;
grant update (review_status, reviewed_at, reviewed_by) on public.message_moderation_flags to authenticated;
grant all on public.message_moderation_flags to service_role;

create policy message_moderation_flags_admin_read
  on public.message_moderation_flags
  for select to authenticated
  using ((select public.is_vilashop_admin()));

create policy message_moderation_flags_admin_update
  on public.message_moderation_flags
  for update to authenticated
  using ((select public.is_vilashop_admin()))
  with check ((select public.is_vilashop_admin()));
