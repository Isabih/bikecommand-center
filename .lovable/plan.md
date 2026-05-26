
## Goal

Convert the single-page dashboard into a multi-page app with a bike registry so users select/register a bike before controlling it. Topics, sessions, and telemetry become per-bike. Add a live MQTT debug table and animated "receiving" indicators. Provide a complete FastAPI backend that syncs Mosquitto subscriptions from the DB.

## Pages (TanStack routes)

```
/              → Bikes index (list + register new)
/bikes/$id     → Live dashboard for selected bike (gauge, telemetry, controls)
/bikes/$id/topics → Topic bindings editor for that bike + live debug table
/docs          → FastAPI + Mosquitto integration guide
```

Shared header with nav links + global WS connection badge.

## Database changes (new migration)

- `bikes` table: id, name, esp32_id (unique), description, created_at, updated_at
- `mqtt_topics`: add `bike_id uuid` FK → bikes.id (nullable for global topics), keep existing columns; unique(bike_id, name)
- `telemetry_events`: id, bike_id, topic, payload jsonb, received_at — for the live debug table & history
- Open RLS (public CRUD) consistent with existing setup; GRANTs for anon/authenticated/service_role
- Enable realtime on `bikes`, `mqtt_topics`, `telemetry_events`

## Frontend

- `src/routes/__root.tsx`: add top nav (Bikes / Docs) + global connection badge
- `src/routes/index.tsx`: bike registry — grid of registered bikes, "Register Bike" dialog (name, esp32_id, description), click → `/bikes/$id`
- `src/routes/bikes.$id.tsx`: live dashboard. Selected bike loaded from DB. Controls call REST with `?bike_id=` query. WebSocket filters telemetry by `esp32_id`. Per-topic blinking "RX" indicator (pulses when `last_seen_at` updates within ~3s, gray otherwise).
- `src/routes/bikes.$id.topics.tsx`: topic editor (CRUD) scoped to bike_id + Live Debug Table (topic, direction, last_seen_at relative time, last_payload preview, animated active dot). Realtime subscription on `mqtt_topics` + `telemetry_events`.
- `src/routes/docs.tsx`: keep existing `IntegrationDocs` content, expand FastAPI sample to: load topics from DB on startup, listen for Supabase Realtime on `mqtt_topics` → re-subscribe in Mosquitto, REST endpoints `POST/PUT/DELETE /topics`, `GET /topics/status` (effective subscriptions), `?bike_id=` on start/stop endpoints.
- `src/lib/bike-api.ts`: add bikes CRUD, pass bike_id in control calls.
- `src/hooks/use-bike-socket.ts`: accept `esp32_id` filter, also push events to a `useTopicActivity` store keyed by topic.
- New `LiveTopicTable.tsx` with blinking active dots + smooth row animation.
- Reuse existing glass/neon design tokens; no new colors.

## Backend docs (`/docs` page)

Provide complete `main.py`:
- On startup: query `mqtt_topics` (with bike join) → subscribe each via paho-mqtt
- Background task subscribes to Supabase Realtime (`postgres_changes`) for `mqtt_topics` → diff & re-subscribe/unsubscribe live
- `POST /bikes`, `GET /bikes`, control endpoints take `bike_id`
- On every MQTT message: `UPDATE mqtt_topics SET last_seen_at, last_payload WHERE topic=...` + `INSERT INTO telemetry_events` + broadcast over WS to dashboard
- `GET /topics/status` returns `[{topic, subscribed: bool, last_seen_at}]`

## What I will not change

- Existing visual design system (glass panels, neon tokens)
- Auth (still public for IoT control as before)
- Existing `BikeVisual`, `SpeedGauge`, `TelemetryCard`, `ControlButton` — reused as-is on the per-bike dashboard

After you approve, I'll run the migration first, then write the routes and components.
