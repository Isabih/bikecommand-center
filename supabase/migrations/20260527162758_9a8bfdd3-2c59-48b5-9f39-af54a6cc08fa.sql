ALTER TABLE public.bikes ADD COLUMN IF NOT EXISTS session_mode text NOT NULL DEFAULT 'IDLE';
ALTER TABLE public.bikes ADD CONSTRAINT bikes_session_mode_check CHECK (session_mode IN ('IDLE','ACTIVE','SIMULATION'));
ALTER TABLE public.bikes ADD COLUMN IF NOT EXISTS session_started_at timestamptz;