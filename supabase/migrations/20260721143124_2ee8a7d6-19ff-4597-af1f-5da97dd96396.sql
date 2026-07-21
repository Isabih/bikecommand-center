
ALTER TABLE public.bikes
  ADD COLUMN IF NOT EXISTS firmware_version TEXT,
  ADD COLUMN IF NOT EXISTS firmware_reported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS firmware_state TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS firmware_progress INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS firmware_message TEXT,
  ADD COLUMN IF NOT EXISTS firmware_target_version TEXT,
  ADD COLUMN IF NOT EXISTS firmware_updated_at TIMESTAMPTZ;
