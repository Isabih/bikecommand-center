
-- BIKES
CREATE TABLE public.bikes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  esp32_id text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bikes TO anon, authenticated;
GRANT ALL ON public.bikes TO service_role;
ALTER TABLE public.bikes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read bikes" ON public.bikes FOR SELECT USING (true);
CREATE POLICY "public insert bikes" ON public.bikes FOR INSERT WITH CHECK (true);
CREATE POLICY "public update bikes" ON public.bikes FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete bikes" ON public.bikes FOR DELETE USING (true);

CREATE TRIGGER bikes_touch_updated_at
BEFORE UPDATE ON public.bikes
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- MQTT TOPICS: link to bikes
ALTER TABLE public.mqtt_topics
  ADD COLUMN bike_id uuid REFERENCES public.bikes(id) ON DELETE CASCADE;

CREATE INDEX idx_mqtt_topics_bike_id ON public.mqtt_topics(bike_id);

-- TELEMETRY EVENTS
CREATE TABLE public.telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bike_id uuid REFERENCES public.bikes(id) ON DELETE CASCADE,
  topic text NOT NULL,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_telemetry_events_bike_id ON public.telemetry_events(bike_id, received_at DESC);
CREATE INDEX idx_telemetry_events_topic ON public.telemetry_events(topic, received_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemetry_events TO anon, authenticated;
GRANT ALL ON public.telemetry_events TO service_role;
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read telemetry" ON public.telemetry_events FOR SELECT USING (true);
CREATE POLICY "public insert telemetry" ON public.telemetry_events FOR INSERT WITH CHECK (true);
CREATE POLICY "public delete telemetry" ON public.telemetry_events FOR DELETE USING (true);

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.bikes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_events;
ALTER TABLE public.bikes REPLICA IDENTITY FULL;
ALTER TABLE public.telemetry_events REPLICA IDENTITY FULL;
ALTER TABLE public.mqtt_topics REPLICA IDENTITY FULL;
