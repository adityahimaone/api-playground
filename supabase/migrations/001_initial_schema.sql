-- API Playground Database Schema
-- Supabase PostgreSQL

-- Enable UUID extension

-- Users table (managed by Supabase Auth, but we add extra fields)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  email text not null,
  name text,
  avatar_url text,
  created_at timestamptz default now() not null
);

-- Workspaces
create table public.workspaces (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  owner_id uuid references public.users(id) on delete cascade not null,
  created_at timestamptz default now() not null
);

-- Workspace members
create table public.workspace_members (
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz default now() not null,
  primary key (workspace_id, user_id)
);

-- Collections (group of requests)
create table public.collections (
  id uuid default gen_random_uuid() primary key,
  workspace_id uuid references public.workspaces(id) on delete cascade not null,
  name text not null,
  variables jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null
);

-- Environments (per-collection variable sets)
create table public.environments (
  id uuid default gen_random_uuid() primary key,
  collection_id uuid references public.collections(id) on delete cascade not null,
  name text not null,
  variables jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null
);

-- HTTP Requests
create table public.requests (
  id uuid default gen_random_uuid() primary key,
  collection_id uuid references public.collections(id) on delete cascade not null,
  name text not null,
  method text not null default 'GET' check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS')),
  url text not null default '',
  headers jsonb default '[]'::jsonb not null,
  body text default '',
  body_type text default 'none' check (body_type in ('none', 'json', 'form-data', 'x-www-form-urlencoded', 'raw')),
  auth jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null
);

-- Row Level Security (RLS)
alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.collections enable row level security;
alter table public.environments enable row level security;
alter table public.requests enable row level security;

-- RLS Policies: Users can read their own data
create policy "Users can view own profile" on public.users
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.users
  for update using (auth.uid() = id);

-- RLS Policies: Workspace access
create policy "Users can view workspaces they belong to" on public.workspaces
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = id and user_id = auth.uid()
    )
  );

create policy "Users can create workspaces" on public.workspaces
  for insert with check (auth.uid() = owner_id);

create policy "Owners can update workspaces" on public.workspaces
  for update using (auth.uid() = owner_id);

create policy "Owners can delete workspaces" on public.workspaces
  for delete using (auth.uid() = owner_id);

-- RLS Policies: Workspace members
create policy "Members can view workspace members" on public.workspace_members
  for select using (
    exists (
      select 1 from public.workspace_members wm
      where wm.workspace_id = workspace_members.workspace_id and wm.user_id = auth.uid()
    )
  );

create policy "Owners can manage members" on public.workspace_members
  for all using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = workspace_members.workspace_id and user_id = auth.uid() and role = 'owner'
    )
  );

-- RLS Policies: Collections
create policy "Members can view collections" on public.collections
  for select using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = collections.workspace_id and user_id = auth.uid()
    )
  );

create policy "Editors can manage collections" on public.collections
  for all using (
    exists (
      select 1 from public.workspace_members
      where workspace_id = collections.workspace_id and user_id = auth.uid() and role in ('owner', 'editor')
    )
  );

-- RLS Policies: Environments
create policy "Members can view environments" on public.environments
  for select using (
    exists (
      select 1 from public.workspace_members wm
      join public.collections c on c.workspace_id = wm.workspace_id
      where c.id = environments.collection_id and wm.user_id = auth.uid()
    )
  );

create policy "Editors can manage environments" on public.environments
  for all using (
    exists (
      select 1 from public.workspace_members wm
      join public.collections c on c.workspace_id = wm.workspace_id
      where c.id = environments.collection_id and wm.user_id = auth.uid() and wm.role in ('owner', 'editor')
    )
  );

-- RLS Policies: Requests
create policy "Members can view requests" on public.requests
  for select using (
    exists (
      select 1 from public.workspace_members wm
      join public.collections c on c.workspace_id = wm.workspace_id
      where c.id = requests.collection_id and wm.user_id = auth.uid()
    )
  );

create policy "Editors can manage requests" on public.requests
  for all using (
    exists (
      select 1 from public.workspace_members wm
      join public.collections c on c.workspace_id = wm.workspace_id
      where c.id = requests.collection_id and wm.user_id = auth.uid() and wm.role in ('owner', 'editor')
    )
  );

-- Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', '')
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger for new user signup
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
