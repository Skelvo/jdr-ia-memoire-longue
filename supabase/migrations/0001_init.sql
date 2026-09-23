-- Phase 1 schema: worlds, world_state (+ history), messages, summaries, memories, usage_daily
-- See SPEC.md §4 for the full data model rationale.

create extension if not exists vector;
create extension if not exists pgcrypto; -- gen_random_uuid()

-- A "world" = one story/playthrough
create table worlds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  premise text not null,          -- starting pitch written by the player or picked from a template
  genre text,                     -- fantasy, sci-fi, noir, light horror, etc.
  tone text,                      -- dark, light, epic, humorous...
  player_character jsonb,         -- name, description, traits
  turn_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The world sheet (source of truth), versioned
create table world_state (
  world_id uuid primary key references worlds(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

-- History of the sheet (for undo / debugging)
create table world_state_history (
  id bigserial primary key,
  world_id uuid not null references worlds(id) on delete cascade,
  version int not null,
  state jsonb not null,
  diff jsonb,
  source text not null check (source in ('ai', 'player')),
  created_at timestamptz not null default now()
);

create table messages (
  id bigserial primary key,
  world_id uuid not null references worlds(id) on delete cascade,
  turn_index int not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  input_tokens int,
  output_tokens int,
  created_at timestamptz not null default now()
);

create index messages_world_turn_idx on messages (world_id, turn_index);

create table summaries (
  id bigserial primary key,
  world_id uuid not null references worlds(id) on delete cascade,
  level int not null default 1, -- 1 = slice summary, 2 = meta-summary
  from_turn int not null,
  to_turn int not null,
  content text not null,
  created_at timestamptz not null default now()
);

create table memories (
  id bigserial primary key,
  world_id uuid not null references worlds(id) on delete cascade,
  turn_index int not null,
  content text not null,        -- 1-2 factual sentences
  importance smallint not null check (importance between 1 and 5),
  embedding vector(1024),       -- adjust to the chosen embeddings model dimension
  created_at timestamptz not null default now()
);

create index memories_embedding_idx on memories using hnsw (embedding vector_cosine_ops);

create table usage_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  messages_count int not null default 0,
  primary key (user_id, day)
);

-- Row Level Security: a user only ever sees/modifies their own worlds.
alter table worlds enable row level security;
alter table world_state enable row level security;
alter table world_state_history enable row level security;
alter table messages enable row level security;
alter table summaries enable row level security;
alter table memories enable row level security;
alter table usage_daily enable row level security;

create policy "worlds_owner" on worlds
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "world_state_owner" on world_state
  for all using (exists (select 1 from worlds w where w.id = world_state.world_id and w.user_id = auth.uid()))
  with check (exists (select 1 from worlds w where w.id = world_state.world_id and w.user_id = auth.uid()));

create policy "world_state_history_owner" on world_state_history
  for all using (exists (select 1 from worlds w where w.id = world_state_history.world_id and w.user_id = auth.uid()))
  with check (exists (select 1 from worlds w where w.id = world_state_history.world_id and w.user_id = auth.uid()));

create policy "messages_owner" on messages
  for all using (exists (select 1 from worlds w where w.id = messages.world_id and w.user_id = auth.uid()))
  with check (exists (select 1 from worlds w where w.id = messages.world_id and w.user_id = auth.uid()));

create policy "summaries_owner" on summaries
  for all using (exists (select 1 from worlds w where w.id = summaries.world_id and w.user_id = auth.uid()))
  with check (exists (select 1 from worlds w where w.id = summaries.world_id and w.user_id = auth.uid()));

create policy "memories_owner" on memories
  for all using (exists (select 1 from worlds w where w.id = memories.world_id and w.user_id = auth.uid()))
  with check (exists (select 1 from worlds w where w.id = memories.world_id and w.user_id = auth.uid()));

create policy "usage_daily_owner" on usage_daily
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
