-- Co-Veranstalter: bearbeiten ja, löschen nur Ersteller

CREATE TABLE IF NOT EXISTS public.event_co_organizers (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS event_co_organizers_user_idx ON public.event_co_organizers (user_id);

CREATE OR REPLACE FUNCTION public.is_event_creator(eid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = eid AND e.organizer_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_event_organizer(eid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_event_creator(eid)
    OR EXISTS (
      SELECT 1 FROM public.event_co_organizers co
      WHERE co.event_id = eid AND co.user_id = auth.uid()
    );
$$;

DROP POLICY IF EXISTS events_select ON public.events;
CREATE POLICY events_select ON public.events
  FOR SELECT USING (public.is_event_public(id) OR public.is_event_organizer(id));

DROP POLICY IF EXISTS events_update ON public.events;
CREATE POLICY events_update ON public.events
  FOR UPDATE USING (public.is_event_organizer(id));

ALTER TABLE public.event_co_organizers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS co_org_select ON public.event_co_organizers;
CREATE POLICY co_org_select ON public.event_co_organizers
  FOR SELECT TO authenticated
  USING (public.is_event_organizer(event_id));

DROP POLICY IF EXISTS co_org_insert ON public.event_co_organizers;
CREATE POLICY co_org_insert ON public.event_co_organizers
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_event_creator(event_id)
    AND user_id <> (SELECT organizer_id FROM public.events WHERE id = event_id)
  );

DROP POLICY IF EXISTS co_org_delete ON public.event_co_organizers;
CREATE POLICY co_org_delete ON public.event_co_organizers
  FOR DELETE TO authenticated
  USING (public.is_event_creator(event_id));

CREATE OR REPLACE FUNCTION public.add_event_co_organizer_by_email(p_event_id uuid, p_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
DECLARE
  target_user uuid;
  owner_id uuid;
BEGIN
  IF NOT public.is_event_creator(p_event_id) THEN
    RAISE EXCEPTION 'Nur der Ersteller kann Veranstalter hinzufügen.';
  END IF;

  SELECT organizer_id INTO owner_id FROM public.events WHERE id = p_event_id;
  SELECT id INTO target_user FROM auth.users WHERE lower(email) = lower(trim(p_email));

  IF target_user IS NULL THEN
    RAISE EXCEPTION 'Kein Konto mit dieser E-Mail gefunden.';
  END IF;

  IF target_user = owner_id THEN
    RAISE EXCEPTION 'Der Ersteller ist bereits Veranstalter.';
  END IF;

  INSERT INTO public.event_co_organizers (event_id, user_id)
  VALUES (p_event_id, target_user)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_event_co_organizer(p_event_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_event_creator(p_event_id) THEN
    RAISE EXCEPTION 'Nur der Ersteller kann Veranstalter entfernen.';
  END IF;

  DELETE FROM public.event_co_organizers
  WHERE event_id = p_event_id AND user_id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_event_co_organizers(p_event_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth'
AS $$
BEGIN
  IF NOT public.is_event_organizer(p_event_id) THEN
    RAISE EXCEPTION 'Kein Zugriff.';
  END IF;

  RETURN QUERY
  SELECT co.user_id, u.email::text
  FROM public.event_co_organizers co
  JOIN auth.users u ON u.id = co.user_id
  WHERE co.event_id = p_event_id
  ORDER BY co.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_event_co_organizer_by_email(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_event_co_organizer(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_event_co_organizers(uuid) TO authenticated;
