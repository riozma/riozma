-- Nur manuelzeltner@gmail.com darf Blog-Posts und Kunstwerke verwalten

DROP POLICY IF EXISTS "blog_posts_auth_all" ON public.blog_posts;
DROP POLICY IF EXISTS "blog_posts_auth_read_drafts" ON public.blog_posts;
DROP POLICY IF EXISTS "artworks_auth_all" ON public.artworks;
DROP POLICY IF EXISTS "artworks_storage_auth_write" ON storage.objects;
DROP POLICY IF EXISTS "blog_images_storage_auth_write" ON storage.objects;

CREATE POLICY "blog_posts_admin_all"
  ON public.blog_posts FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'manuelzeltner@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'manuelzeltner@gmail.com');

CREATE POLICY "artworks_admin_all"
  ON public.artworks FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'manuelzeltner@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'manuelzeltner@gmail.com');

CREATE POLICY "artworks_storage_admin_write"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'artworks'
    AND (auth.jwt() ->> 'email') = 'manuelzeltner@gmail.com'
  )
  WITH CHECK (
    bucket_id = 'artworks'
    AND (auth.jwt() ->> 'email') = 'manuelzeltner@gmail.com'
  );

CREATE POLICY "blog_images_storage_admin_write"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'blog-images'
    AND (auth.jwt() ->> 'email') = 'manuelzeltner@gmail.com'
  )
  WITH CHECK (
    bucket_id = 'blog-images'
    AND (auth.jwt() ->> 'email') = 'manuelzeltner@gmail.com'
  );
