
create table if not exists public.mqtt_topics (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  topic text not null,
  description text,
  direction text not null default 'sub' check (direction in ('sub','pub','both')),
  last_seen_at timestamptz,
  last_payload text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mqtt_topics enable row level security;

create policy "public read mqtt_topics" on public.mqtt_topics for select using (true);
create policy "public insert mqtt_topics" on public.mqtt_topics for insert with check (true);
create policy "public update mqtt_topics" on public.mqtt_topics for update using (true) with check (true);
create policy "public delete mqtt_topics" on public.mqtt_topics for delete using (true);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists mqtt_topics_touch on public.mqtt_topics;
create trigger mqtt_topics_touch
before update on public.mqtt_topics
for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.mqtt_topics;

insert into public.mqtt_topics (name, topic, description, direction) values
  ('control',    'bike/control',    'Active mode control commands {"command":"on"|"off"}', 'pub'),
  ('simulation', 'bike/simulation', 'Simulation control commands {"command":"start"|"stop"}', 'pub'),
  ('telemetry',  'bike/telemetry',  'Live telemetry from ESP32 (speed, ignition, brake, etc.)', 'sub'),
  ('status',     'bike/status',     'Bike status / heartbeat messages', 'sub'),
  ('wildcard',   'bike/#',          'Catch-all subscription used by mosquitto_sub for debugging', 'sub')
on conflict (name) do nothing;
