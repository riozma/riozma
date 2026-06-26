-- Ensure event organizer_id always matches the authenticated user on insert.

CREATE OR REPLACE FUNCTION public.events_set_organizer_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  NEW.organizer_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_set_organizer ON public.events;
CREATE TRIGGER trg_events_set_organizer
  BEFORE INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.events_set_organizer_id();
