-- JobPilot Auth + cross-device application tracking
-- Run this in Supabase Dashboard > SQL Editor.
-- This migration never requires a database password or service-role key.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.tracked_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id text not null,
  title text not null,
  company text not null,
  location text,
  url text not null,
  source text,
  status text not null check (status in ('saved', 'applied', 'interview', 'rejected')),
  job_published timestamptz,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, job_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists tracked_applications_set_updated_at on public.tracked_applications;
create trigger tracked_applications_set_updated_at
before update on public.tracked_applications
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(new.raw_user_meta_data ->> 'role', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.tracked_applications enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can read their own tracked applications" on public.tracked_applications;
create policy "Users can read their own tracked applications"
on public.tracked_applications for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own tracked applications" on public.tracked_applications;
create policy "Users can create their own tracked applications"
on public.tracked_applications for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own tracked applications" on public.tracked_applications;
create policy "Users can update their own tracked applications"
on public.tracked_applications for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own tracked applications" on public.tracked_applications;
create policy "Users can delete their own tracked applications"
on public.tracked_applications for delete
to authenticated
using ((select auth.uid()) = user_id);
