-- Storage-Buckets für Kunst & Blog (falls noch nicht vorhanden)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('artworks', 'artworks', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('blog-images', 'blog-images', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "artworks_storage_public_read" ON storage.objects;
CREATE POLICY "artworks_storage_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'artworks');

DROP POLICY IF EXISTS "blog_images_storage_public_read" ON storage.objects;
CREATE POLICY "blog_images_storage_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-images');
