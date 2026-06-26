-- Create events via SECURITY DEFINER RPC (avoids RLS insert edge cases).

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
    event_date, start_time, end_time, open_end, attendee_visibility,
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
