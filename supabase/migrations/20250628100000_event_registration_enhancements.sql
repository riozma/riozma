-- Anmeldung: Limit, +1, E-Mail-Pflicht, Bestätigungsmail; Gast-Feedback nach Event

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS max_registrations integer,
  ADD COLUMN IF NOT EXISTS allow_plus_one boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guest_email_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS send_registration_email boolean NOT NULL DEFAULT false;

ALTER TABLE public.event_registrations
  ADD COLUMN IF NOT EXISTS party_size integer NOT NULL DEFAULT 1;

ALTER TABLE public.event_registrations
  DROP CONSTRAINT IF EXISTS event_registrations_party_size_check;

ALTER TABLE public.event_registrations
  ADD CONSTRAINT event_registrations_party_size_check CHECK (party_size >= 1 AND party_size <= 2);

CREATE TABLE IF NOT EXISTS public.event_guest_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  guest_name text NOT NULL DEFAULT '',
  guest_email text,
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_guest_feedback_event_id_idx ON public.event_guest_feedback(event_id);

ALTER TABLE public.event_guest_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Guest feedback public insert" ON public.event_guest_feedback;
CREATE POLICY "Guest feedback public insert"
  ON public.event_guest_feedback FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_guest_feedback.event_id
        AND e.is_published = true
    )
  );

DROP POLICY IF EXISTS "Organizers read guest feedback" ON public.event_guest_feedback;
CREATE POLICY "Organizers read guest feedback"
  ON public.event_guest_feedback FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_guest_feedback.event_id
        AND (
          e.organizer_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.event_co_organizers co
            WHERE co.event_id = e.id AND co.user_id = auth.uid()
          )
        )
    )
  );
