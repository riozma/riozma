-- Anmeldefrist (optional) + nach Event-Ende keine Anmeldung mehr

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS registration_closes_at timestamptz;

CREATE OR REPLACE FUNCTION public.is_event_registration_open(p_event public.events)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  event_end timestamp;
BEGIN
  IF p_event.event_date IS NULL THEN
    RETURN true;
  END IF;

  IF p_event.open_end THEN
    event_end := (COALESCE(p_event.end_date, p_event.event_date)::timestamp + time '23:59:59');
  ELSE
    event_end := (
      COALESCE(p_event.end_date, p_event.event_date)::timestamp
      + COALESCE(p_event.end_time, p_event.start_time, time '23:59')
    );
  END IF;

  IF (now() AT TIME ZONE 'Europe/Zurich') >= event_end THEN
    RETURN false;
  END IF;

  IF p_event.registration_closes_at IS NOT NULL AND now() >= p_event.registration_closes_at THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

DROP POLICY IF EXISTS "Anyone can register on published events" ON public.event_registrations;
DROP POLICY IF EXISTS "Public insert registrations" ON public.event_registrations;
DROP POLICY IF EXISTS "Public register for published events" ON public.event_registrations;
DROP POLICY IF EXISTS "Guests register for published events" ON public.event_registrations;

DROP POLICY IF EXISTS "registrations_insert" ON public.event_registrations;
CREATE POLICY "registrations_insert"
  ON public.event_registrations FOR INSERT
  WITH CHECK (
    public.is_event_public(event_id)
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_registrations.event_id
        AND public.is_event_registration_open(e)
    )
  );
