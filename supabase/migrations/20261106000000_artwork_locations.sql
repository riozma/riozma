-- Kunst-Karte: wo sich die Gemälde befinden. Nur für manuelzeltner@gmail.com lesbar und änderbar.
-- artwork_id = id aus src/artworks.json bzw. public.artworks

CREATE TABLE IF NOT EXISTS public.artwork_locations (
  artwork_id  text PRIMARY KEY,
  place       text,              -- Ort (z.B. "Zuchwil"); leer = unbekannt
  holder      text,              -- bei wem (z.B. "Eltern")
  status      text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'unknown', 'gone')),
  lat         double precision,
  lng         double precision,
  note        text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.artwork_locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "artwork_locations_admin_all" ON public.artwork_locations;
CREATE POLICY "artwork_locations_admin_all"
  ON public.artwork_locations FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'email') = 'manuelzeltner@gmail.com')
  WITH CHECK ((auth.jwt() ->> 'email') = 'manuelzeltner@gmail.com');

REVOKE ALL ON public.artwork_locations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.artwork_locations TO authenticated;
