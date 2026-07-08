-- ============================================================
-- 01 — PROFILES
-- ============================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  avatar_url  text,
  role        text not null default 'attorney' check (role in ('admin', 'attorney')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "auth_full" on public.profiles
  for all using (auth.role() = 'authenticated');
