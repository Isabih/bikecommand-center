
DELETE FROM public.mqtt_topics WHERE name IN ('status', 'telemetry', 'wildcard');

-- Unify the bike-scoped data entry: rename + flip to sub
UPDATE public.mqtt_topics SET direction = 'sub'
WHERE topic = 'bike/data';

INSERT INTO public.mqtt_topics (bike_id, name, topic, direction, description)
SELECT NULL, 'control', 'bike/control', 'pub', 'Start/stop ESP32 active mode'
WHERE NOT EXISTS (SELECT 1 FROM public.mqtt_topics WHERE name = 'control');

INSERT INTO public.mqtt_topics (bike_id, name, topic, direction, description)
SELECT NULL, 'simulation', 'bike/simulation', 'pub', 'Start/stop ESP32 simulation mode'
WHERE NOT EXISTS (SELECT 1 FROM public.mqtt_topics WHERE name = 'simulation');
