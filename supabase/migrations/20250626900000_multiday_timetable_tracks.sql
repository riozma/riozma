-- Multi-day events and named timetable tracks.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_date date;

CREATE TABLE IF NOT EXISTS public.event_timetable_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE public.event_timetable_items
  ADD COLUMN IF NOT EXISTS track_id uuid REFERENCES public.event_timetable_tracks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS item_date date;

CREATE INDEX IF NOT EXISTS idx_timetable_tracks_event ON public.event_timetable_tracks(event_id);
CREATE INDEX IF NOT EXISTS idx_timetable_items_track ON public.event_timetable_items(track_id);

ALTER TABLE public.event_timetable_tracks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracks_select ON public.event_timetable_tracks;
CREATE POLICY tracks_select ON public.event_timetable_tracks
  FOR SELECT USING (is_event_public(event_id) OR is_event_organizer(event_id));

DROP POLICY IF EXISTS tracks_manage ON public.event_timetable_tracks;
CREATE POLICY tracks_manage ON public.event_timetable_tracks
  FOR ALL
  USING (is_event_organizer(event_id))
  WITH CHECK (is_event_organizer(event_id));

GRANT SELECT ON public.event_timetable_tracks TO anon, authenticated;
GRANT ALL ON public.event_timetable_tracks TO authenticated;

CREATE OR REPLACE FUNCTION public.create_trouvo_event(p_payload jsonb)
RETURNS TABLE(id uuid, slug text, is_published boolean, organizer_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_row public.events%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.events (
    organizer_id, slug, name, description, location, organizer_phone,
    event_date, end_date, start_time, end_time, open_end, attendee_visibility,
    show_attendee_list, photos_show_preview, photos_preview_text,
    photos_upload_enabled, photos_upload_url, photos_gallery_url,
    photos_closes_at, is_published
  ) VALUES (
    uid,
    p_payload->>'slug',
    p_payload->>'name',
    COALESCE(p_payload->>'description', ''),
    COALESCE(p_payload->>'location', ''),
    NULLIF(p_payload->>'organizer_phone', ''),
    (p_payload->>'event_date')::date,
    NULLIF(p_payload->>'end_date', '')::date,
    (p_payload->>'start_time')::time,
    NULLIF(p_payload->>'end_time', '')::time,
    COALESCE((p_payload->>'open_end')::boolean, false),
    COALESCE(NULLIF(p_payload->>'attendee_visibility', ''), 'none'),
    COALESCE((p_payload->>'show_attendee_list')::boolean, false),
    COALESCE((p_payload->>'photos_show_preview')::boolean, false),
    NULLIF(p_payload->>'photos_preview_text', ''),
    COALESCE((p_payload->>'photos_upload_enabled')::boolean, false),
    NULLIF(p_payload->>'photos_upload_url', ''),
    NULLIF(p_payload->>'photos_gallery_url', ''),
    NULLIF(p_payload->>'photos_closes_at', '')::date,
    COALESCE((p_payload->>'is_published')::boolean, false)
  )
  RETURNING * INTO new_row;

  RETURN QUERY SELECT new_row.id, new_row.slug, new_row.is_published, new_row.organizer_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_trouvo_event(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_trouvo_event(jsonb) TO anon;
