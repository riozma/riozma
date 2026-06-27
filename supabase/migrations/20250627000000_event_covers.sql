-- Optional event cover images (compressed client-side, auto-purged after expiry).

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS cover_image_path text,
  ADD COLUMN IF NOT EXISTS cover_image_expires_at timestamptz;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-covers', 'event-covers', true, 5242880, ARRAY['image/jpeg', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS event_covers_public_read ON storage.objects;
CREATE POLICY event_covers_public_read
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-covers');

DROP POLICY IF EXISTS event_covers_organizer_write ON storage.objects;
CREATE POLICY event_covers_organizer_write
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'event-covers'
    AND auth.uid() IS NOT NULL
    AND public.is_event_organizer((split_part(name, '/', 1))::uuid)
  )
  WITH CHECK (
    bucket_id = 'event-covers'
    AND auth.uid() IS NOT NULL
    AND public.is_event_organizer((split_part(name, '/', 1))::uuid)
  );

CREATE OR REPLACE FUNCTION public.purge_expired_event_covers()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  rec record;
  purged integer := 0;
BEGIN
  FOR rec IN
    SELECT id, cover_image_path
    FROM public.events
    WHERE cover_image_path IS NOT NULL
      AND cover_image_expires_at IS NOT NULL
      AND cover_image_expires_at < now()
  LOOP
    DELETE FROM storage.objects
    WHERE bucket_id = 'event-covers' AND name = rec.cover_image_path;
    UPDATE public.events
    SET cover_image_path = NULL, cover_image_expires_at = NULL
    WHERE id = rec.id;
    purged := purged + 1;
  END LOOP;
  RETURN purged;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_expired_event_covers() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_event_covers() TO anon;
