-- Feedback-Modus (Nachbesprechung) pro Event, geteilt zwischen Info & Planung

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS feedback_mode_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS feedback_notes jsonb NOT NULL DEFAULT '{}'::jsonb;
