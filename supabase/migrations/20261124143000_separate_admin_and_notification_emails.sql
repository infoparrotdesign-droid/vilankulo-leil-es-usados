-- Separate VilaShop administrator identity from the notification mailbox.
-- The notification address must never receive administrative privileges.

create or replace function public.is_vilashop_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.vilashop_admins a
    join auth.users u on u.id = a.user_id
    where a.user_id = (select auth.uid())
      and lower(coalesce(u.email, '')) = 'info.parrotdesign@gmail.com'
      and u.email_confirmed_at is not null
  );
$$;
revoke all on function public.is_vilashop_admin() from public, anon;
grant execute on function public.is_vilashop_admin() to authenticated;

create or replace function public.bootstrap_vilashop_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) = 'info.parrotdesign@gmail.com'
     and new.email_confirmed_at is not null then
    insert into public.vilashop_admins(user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  else
    delete from public.vilashop_admins where user_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.bootstrap_vilashop_admin() from public, anon, authenticated;

-- Recreate the trigger so verified-email changes also revoke stale access.
drop trigger if exists on_vilashop_admin_email_verified on auth.users;
create trigger on_vilashop_admin_email_verified
  after insert or update of email, email_confirmed_at on auth.users
  for each row execute function public.bootstrap_vilashop_admin();

-- Remove the former notification mailbox and any other legacy admin rows.
delete from public.vilashop_admins a
using auth.users u
where u.id = a.user_id
  and lower(coalesce(u.email, '')) <> 'info.parrotdesign@gmail.com';

-- Grant the role automatically if the authorised account already exists and is verified.
insert into public.vilashop_admins(user_id)
select id
from auth.users
where lower(email) = 'info.parrotdesign@gmail.com'
  and email_confirmed_at is not null
on conflict (user_id) do nothing;

-- Make the intentional absence of direct admin-table access explicit.
-- Privileged checks are performed only inside SECURITY DEFINER functions.
drop policy if exists vilashop_admins_no_direct_access on public.vilashop_admins;
create policy vilashop_admins_no_direct_access
  on public.vilashop_admins
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);
