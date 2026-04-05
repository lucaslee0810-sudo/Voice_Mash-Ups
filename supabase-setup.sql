-- ============================================
-- VOICE SWAP STORIES - DATABASE SETUP
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. ROOMS TABLE
create table rooms (
  id uuid default gen_random_uuid() primary key,
  code text not null unique,
  story_pack text,
  game_mode text,
  status text not null default 'lobby', -- lobby, voting, picking-story, recording, playback, voting-awards
  host_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. PLAYERS TABLE
create table players (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade,
  name text not null,
  avatar text not null default '😎',
  bio text,
  voice_style text default 'normal',
  fave_sport text,
  fave_food text,
  fave_game text,
  is_host boolean default false,
  created_at timestamptz default now()
);

-- 3. RECORDINGS TABLE
create table recordings (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  prompt_fill text,
  prompt_text text,
  audio_url text,
  round_number int default 1,
  created_at timestamptz default now()
);

-- 4. VOTES TABLE
create table votes (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade,
  voter_id uuid references players(id) on delete cascade,
  voted_for_id uuid references players(id) on delete cascade,
  category text not null, -- 'funniest', 'most-random'
  round_number int default 1,
  created_at timestamptz default now()
);

-- 5. GAME MODE VOTES TABLE
create table mode_votes (
  id uuid default gen_random_uuid() primary key,
  room_id uuid references rooms(id) on delete cascade,
  player_id uuid references players(id) on delete cascade,
  mode text not null,
  created_at timestamptz default now()
);

-- 6. Enable Row Level Security (but allow all for now - tighten later)
alter table rooms enable row level security;
alter table players enable row level security;
alter table recordings enable row level security;
alter table votes enable row level security;
alter table mode_votes enable row level security;

-- Allow anonymous access (since players don't have accounts)
create policy "Allow all on rooms" on rooms for all using (true) with check (true);
create policy "Allow all on players" on players for all using (true) with check (true);
create policy "Allow all on recordings" on recordings for all using (true) with check (true);
create policy "Allow all on votes" on votes for all using (true) with check (true);
create policy "Allow all on mode_votes" on mode_votes for all using (true) with check (true);

-- 7. Enable Realtime on all tables
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
alter publication supabase_realtime add table recordings;
alter publication supabase_realtime add table votes;
alter publication supabase_realtime add table mode_votes;

-- 8. Create storage bucket for audio clips
insert into storage.buckets (id, name, public) values ('audio-clips', 'audio-clips', true);

-- Allow anonymous uploads and reads on the audio bucket
create policy "Allow public read on audio" on storage.objects for select using (bucket_id = 'audio-clips');
create policy "Allow public insert on audio" on storage.objects for insert with check (bucket_id = 'audio-clips');
create policy "Allow public delete on audio" on storage.objects for delete using (bucket_id = 'audio-clips');

-- 9. Auto-cleanup: function to delete rooms older than 2 hours
create or replace function cleanup_old_rooms() returns void as $$
begin
  delete from rooms where created_at < now() - interval '2 hours';
end;
$$ language plpgsql;
