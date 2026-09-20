create table if not exists public.delegate_clicks (
  delegate_id integer primary key,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_settings (
  id integer primary key check (id = 1),
  password_hash text not null,
  password_salt text not null,
  updated_at timestamptz not null default now()
);

alter table public.delegate_clicks enable row level security;
alter table public.admin_settings enable row level security;

create or replace function public.increment_delegate_click(delegate_id_input integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare next_count integer;
begin
  insert into public.delegate_clicks (delegate_id, count, updated_at)
  values (delegate_id_input, 1, now())
  on conflict (delegate_id) do update
    set count = public.delegate_clicks.count + 1,
        updated_at = now()
  returning count into next_count;
  return next_count;
end;
$$;
