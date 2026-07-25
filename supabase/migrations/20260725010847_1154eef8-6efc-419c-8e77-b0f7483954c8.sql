
CREATE TABLE public.firmware_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL UNIQUE,
  url text NOT NULL,
  sha256 text,
  notes text,
  released_at timestamptz,
  is_latest boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'github',
  manifest jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.firmware_versions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.firmware_versions TO authenticated;
GRANT ALL ON public.firmware_versions TO service_role;

ALTER TABLE public.firmware_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read firmware_versions" ON public.firmware_versions FOR SELECT USING (true);
CREATE POLICY "public write firmware_versions" ON public.firmware_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "public update firmware_versions" ON public.firmware_versions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete firmware_versions" ON public.firmware_versions FOR DELETE USING (true);

CREATE TRIGGER firmware_versions_updated_at
  BEFORE UPDATE ON public.firmware_versions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX firmware_versions_latest_idx ON public.firmware_versions (is_latest) WHERE is_latest = true;
CREATE INDEX firmware_versions_released_idx ON public.firmware_versions (released_at DESC NULLS LAST);

-- Add per-bike target selection so users can pin any version, not just latest.
ALTER TABLE public.bikes
  ADD COLUMN IF NOT EXISTS firmware_pinned_version text;

-- Enable cron + net so we can hourly-poll GitHub for new manifests.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
