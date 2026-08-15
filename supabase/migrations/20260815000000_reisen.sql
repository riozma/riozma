-- Reisen: gemeinsamer Fahrradtour-Reiseplaner (mehrere Mitreisende, Einladungslinks,
-- Tag-für-Tag-Plan mit Vergleichsoptionen für Unterkunft/Transport, Finanzen, Packliste, To-Dos)

-- ============================================================================
-- Kern-Tabellen
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  trip_type text NOT NULL DEFAULT 'fahrradtour',
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_location text NOT NULL DEFAULT '',
  end_location text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  komoot_url text,
  cover_map_image_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT trips_date_range_check CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS trips_creator_idx ON public.trips (creator_id);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trips_updated_at ON public.trips;
CREATE TRIGGER trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.trip_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  is_placeholder boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_members_trip_idx ON public.trip_members (trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS trip_members_trip_user_uidx
  ON public.trip_members (trip_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.trip_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  placeholder_member_id uuid REFERENCES public.trip_members(id) ON DELETE SET NULL,
  max_uses int,
  uses_count int NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS trip_invites_trip_idx ON public.trip_invites (trip_id);

-- ============================================================================
-- Reiseplan: ein Tag = eine Zeile, trägt Route; Unterkunft/Transport als
-- Vergleichsoptionen-Zeilen mit is_selected pro Tag/Etappe
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trip_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  start_place text NOT NULL DEFAULT '',
  end_place text NOT NULL DEFAULT '',
  distance_km numeric,
  elevation_gain_m numeric,
  ride_time_estimate text NOT NULL DEFAULT '',
  komoot_url text,
  map_image_path text,
  notes text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (trip_id, day_date)
);

CREATE INDEX IF NOT EXISTS trip_days_trip_idx ON public.trip_days (trip_id, sort_order);

CREATE TABLE IF NOT EXISTS public.trip_accommodations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_id uuid NOT NULL REFERENCES public.trip_days(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  place_note text NOT NULL DEFAULT '',
  price numeric,
  currency text NOT NULL DEFAULT 'CHF',
  booking_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'considering', 'booked')),
  is_selected boolean NOT NULL DEFAULT false,
  image_path text,
  notes text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_accommodations_trip_idx ON public.trip_accommodations (trip_id);
CREATE INDEX IF NOT EXISTS trip_accommodations_day_idx ON public.trip_accommodations (day_id);
CREATE UNIQUE INDEX IF NOT EXISTS trip_accommodations_selected_uidx
  ON public.trip_accommodations (day_id) WHERE is_selected;

CREATE TABLE IF NOT EXISTS public.trip_transport_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_id uuid NOT NULL REFERENCES public.trip_days(id) ON DELETE CASCADE,
  leg_label text NOT NULL DEFAULT '',
  leg_order int NOT NULL DEFAULT 0,
  traveler_name text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT 'zug',
  provider text NOT NULL DEFAULT '',
  from_place text NOT NULL DEFAULT '',
  to_place text NOT NULL DEFAULT '',
  departure_at timestamptz,
  arrival_at timestamptz,
  price numeric,
  currency text NOT NULL DEFAULT 'CHF',
  booking_url text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'idea' CHECK (status IN ('idea', 'considering', 'booked')),
  is_selected boolean NOT NULL DEFAULT false,
  notes text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_transport_options_trip_idx ON public.trip_transport_options (trip_id);
CREATE INDEX IF NOT EXISTS trip_transport_options_day_idx ON public.trip_transport_options (day_id);
CREATE UNIQUE INDEX IF NOT EXISTS trip_transport_options_selected_uidx
  ON public.trip_transport_options (day_id, leg_label) WHERE is_selected;

CREATE TABLE IF NOT EXISTS public.trip_useful_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  url text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS trip_useful_links_trip_idx ON public.trip_useful_links (trip_id, sort_order);

CREATE TABLE IF NOT EXISTS public.trip_budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT '',
  amount_per_person numeric,
  currency text NOT NULL DEFAULT 'CHF',
  notes text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS trip_budget_items_trip_idx ON public.trip_budget_items (trip_id, sort_order);

-- ============================================================================
-- Finanzen (Splitwise-artig — Salden werden clientseitig berechnet)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trip_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CHF',
  paid_by_member_id uuid NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT current_date,
  category text NOT NULL DEFAULT '',
  split_mode text NOT NULL DEFAULT 'equal' CHECK (split_mode IN ('equal', 'custom')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS trip_expenses_trip_idx ON public.trip_expenses (trip_id, expense_date);

CREATE TABLE IF NOT EXISTS public.trip_expense_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id uuid NOT NULL REFERENCES public.trip_expenses(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.trip_members(id) ON DELETE CASCADE,
  share_amount numeric,
  UNIQUE (expense_id, member_id)
);

CREATE INDEX IF NOT EXISTS trip_expense_participants_expense_idx ON public.trip_expense_participants (expense_id);

-- ============================================================================
-- Packliste / To-Dos
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trip_packing_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  quantity text NOT NULL DEFAULT '',
  assignee_member_id uuid REFERENCES public.trip_members(id) ON DELETE SET NULL,
  packed boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS trip_packing_items_trip_idx ON public.trip_packing_items (trip_id, sort_order);

CREATE TABLE IF NOT EXISTS public.trip_todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  assignee_member_id uuid REFERENCES public.trip_members(id) ON DELETE SET NULL,
  done boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS trip_todos_trip_idx ON public.trip_todos (trip_id, sort_order);

-- ============================================================================
-- Helper-Functions (RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_trip_creator(tid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trips t WHERE t.id = tid AND t.creator_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_trip_member(tid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.is_trip_creator(tid)
    OR EXISTS (
      SELECT 1 FROM public.trip_members m WHERE m.trip_id = tid AND m.user_id = auth.uid()
    );
$$;

-- ============================================================================
-- Trigger: nur je eine gewählte Option pro Nacht / pro Transport-Etappengruppe
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trip_accommodations_enforce_single_selection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_selected THEN
    UPDATE public.trip_accommodations
    SET is_selected = false
    WHERE day_id = NEW.day_id AND id <> NEW.id AND is_selected;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_accommodations_single_selection ON public.trip_accommodations;
CREATE TRIGGER trip_accommodations_single_selection
  BEFORE INSERT OR UPDATE ON public.trip_accommodations
  FOR EACH ROW EXECUTE FUNCTION public.trip_accommodations_enforce_single_selection();

CREATE OR REPLACE FUNCTION public.trip_transport_options_enforce_single_selection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.is_selected THEN
    UPDATE public.trip_transport_options
    SET is_selected = false
    WHERE day_id = NEW.day_id AND leg_label = NEW.leg_label AND id <> NEW.id AND is_selected;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_transport_options_single_selection ON public.trip_transport_options;
CREATE TRIGGER trip_transport_options_single_selection
  BEFORE INSERT OR UPDATE ON public.trip_transport_options
  FOR EACH ROW EXECUTE FUNCTION public.trip_transport_options_enforce_single_selection();

-- ============================================================================
-- Trigger: Ersteller kann die Reise nicht verlassen (nur löschen)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trip_members_block_creator_leave()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.user_id IS NOT NULL AND OLD.user_id = (SELECT creator_id FROM public.trips WHERE id = OLD.trip_id) THEN
    RAISE EXCEPTION 'Der Ersteller kann die Reise nicht verlassen – bitte stattdessen löschen.' USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trip_members_no_creator_leave ON public.trip_members;
CREATE TRIGGER trip_members_no_creator_leave
  BEFORE DELETE ON public.trip_members
  FOR EACH ROW EXECUTE FUNCTION public.trip_members_block_creator_leave();

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_accommodations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_transport_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_useful_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_expense_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_packing_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trips_select ON public.trips;
CREATE POLICY trips_select ON public.trips
  FOR SELECT USING (public.is_trip_member(id));

DROP POLICY IF EXISTS trips_update ON public.trips;
CREATE POLICY trips_update ON public.trips
  FOR UPDATE USING (public.is_trip_member(id)) WITH CHECK (public.is_trip_member(id));

DROP POLICY IF EXISTS trips_delete ON public.trips;
CREATE POLICY trips_delete ON public.trips
  FOR DELETE USING (public.is_trip_creator(id));

-- Kein direktes INSERT auf trips — Erstellung ausschliesslich über create_trip() (SECURITY DEFINER).

DROP POLICY IF EXISTS trip_members_select ON public.trip_members;
CREATE POLICY trip_members_select ON public.trip_members
  FOR SELECT USING (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_members_insert ON public.trip_members;
CREATE POLICY trip_members_insert ON public.trip_members
  FOR INSERT WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_members_update ON public.trip_members;
CREATE POLICY trip_members_update ON public.trip_members
  FOR UPDATE USING (public.is_trip_member(trip_id)) WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_members_delete ON public.trip_members;
CREATE POLICY trip_members_delete ON public.trip_members
  FOR DELETE USING (
    (user_id IS NOT NULL AND user_id = auth.uid()) OR public.is_trip_creator(trip_id)
  );

DROP POLICY IF EXISTS trip_invites_select ON public.trip_invites;
CREATE POLICY trip_invites_select ON public.trip_invites
  FOR SELECT USING (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_invites_insert ON public.trip_invites;
CREATE POLICY trip_invites_insert ON public.trip_invites
  FOR INSERT WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_invites_update ON public.trip_invites;
CREATE POLICY trip_invites_update ON public.trip_invites
  FOR UPDATE USING (public.is_trip_member(trip_id)) WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_invites_delete ON public.trip_invites;
CREATE POLICY trip_invites_delete ON public.trip_invites
  FOR DELETE USING (public.is_trip_member(trip_id));

-- Anonymer/eingeloggter Vorschau- und Beitritts-Zugriff läuft ausschliesslich über
-- preview_trip_invite()/accept_trip_invite() (SECURITY DEFINER) — keine Tabellen-Policy dafür.

DROP POLICY IF EXISTS trip_days_all ON public.trip_days;
CREATE POLICY trip_days_all ON public.trip_days
  FOR ALL USING (public.is_trip_member(trip_id)) WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_accommodations_all ON public.trip_accommodations;
CREATE POLICY trip_accommodations_all ON public.trip_accommodations
  FOR ALL USING (public.is_trip_member(trip_id)) WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_transport_options_all ON public.trip_transport_options;
CREATE POLICY trip_transport_options_all ON public.trip_transport_options
  FOR ALL USING (public.is_trip_member(trip_id)) WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_useful_links_all ON public.trip_useful_links;
CREATE POLICY trip_useful_links_all ON public.trip_useful_links
  FOR ALL USING (public.is_trip_member(trip_id)) WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_budget_items_all ON public.trip_budget_items;
CREATE POLICY trip_budget_items_all ON public.trip_budget_items
  FOR ALL USING (public.is_trip_member(trip_id)) WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_expenses_all ON public.trip_expenses;
CREATE POLICY trip_expenses_all ON public.trip_expenses
  FOR ALL USING (public.is_trip_member(trip_id)) WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_expense_participants_all ON public.trip_expense_participants;
CREATE POLICY trip_expense_participants_all ON public.trip_expense_participants
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.trip_expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.trip_expenses e WHERE e.id = expense_id AND public.is_trip_member(e.trip_id))
  );

DROP POLICY IF EXISTS trip_packing_items_all ON public.trip_packing_items;
CREATE POLICY trip_packing_items_all ON public.trip_packing_items
  FOR ALL USING (public.is_trip_member(trip_id)) WITH CHECK (public.is_trip_member(trip_id));

DROP POLICY IF EXISTS trip_todos_all ON public.trip_todos;
CREATE POLICY trip_todos_all ON public.trip_todos
  FOR ALL USING (public.is_trip_member(trip_id)) WITH CHECK (public.is_trip_member(trip_id));

-- ============================================================================
-- RPCs
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_trip(p_payload jsonb)
RETURNS public.trips
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_row public.trips%ROWTYPE;
  v_start date;
  v_end date;
  v_name text;
  d date;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  v_start := (p_payload->>'start_date')::date;
  v_end := (p_payload->>'end_date')::date;
  IF v_start IS NULL OR v_end IS NULL THEN
    RAISE EXCEPTION 'Start- und Enddatum sind erforderlich.';
  END IF;
  IF v_end < v_start THEN
    RAISE EXCEPTION 'Enddatum darf nicht vor dem Startdatum liegen.';
  END IF;

  v_name := NULLIF(TRIM(p_payload->>'name'), '');
  IF v_name IS NULL THEN
    v_name := TRIM(BOTH ' – ' FROM (COALESCE(p_payload->>'start_location', '') || ' – ' || COALESCE(p_payload->>'end_location', '')));
  END IF;

  INSERT INTO public.trips (
    creator_id, name, trip_type, start_date, end_date, start_location, end_location, description
  ) VALUES (
    uid,
    COALESCE(v_name, ''),
    COALESCE(NULLIF(p_payload->>'trip_type', ''), 'fahrradtour'),
    v_start,
    v_end,
    COALESCE(p_payload->>'start_location', ''),
    COALESCE(p_payload->>'end_location', ''),
    COALESCE(p_payload->>'description', '')
  )
  RETURNING * INTO new_row;

  INSERT INTO public.trip_members (trip_id, user_id, display_name, is_placeholder)
  VALUES (new_row.id, uid, COALESCE(NULLIF(TRIM(p_payload->>'creator_display_name'), ''), ''), false);

  d := v_start;
  WHILE d <= v_end LOOP
    INSERT INTO public.trip_days (trip_id, day_date, sort_order) VALUES (new_row.id, d, (d - v_start));
    d := d + 1;
  END LOOP;

  RETURN new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_trip(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_trip_invite(
  p_trip_id uuid,
  p_placeholder_member_id uuid DEFAULT NULL,
  p_expires_in_days int DEFAULT 30,
  p_max_uses int DEFAULT NULL
)
RETURNS public.trip_invites
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_row public.trip_invites%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trip_member(p_trip_id) THEN
    RAISE EXCEPTION 'Kein Zugriff auf diese Reise.' USING ERRCODE = '42501';
  END IF;
  IF p_placeholder_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trip_members m
    WHERE m.id = p_placeholder_member_id AND m.trip_id = p_trip_id AND m.is_placeholder
  ) THEN
    RAISE EXCEPTION 'Ungültiger Platzhalter.';
  END IF;

  INSERT INTO public.trip_invites (trip_id, created_by, placeholder_member_id, max_uses, expires_at)
  VALUES (
    p_trip_id, uid, p_placeholder_member_id, p_max_uses,
    CASE WHEN p_expires_in_days IS NULL THEN NULL ELSE now() + (p_expires_in_days || ' days')::interval END
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_trip_invite(uuid, uuid, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_trip_invite(p_token uuid)
RETURNS TABLE(
  trip_id uuid,
  trip_name text,
  start_date date,
  end_date date,
  invited_as text,
  valid boolean,
  reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  inv public.trip_invites%ROWTYPE;
  t public.trips%ROWTYPE;
BEGIN
  SELECT * INTO inv FROM public.trip_invites i WHERE i.token = p_token;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::date, NULL::date, NULL::text, false, 'Ungültiger Einladungslink.';
    RETURN;
  END IF;

  SELECT * INTO t FROM public.trips WHERE id = inv.trip_id;

  IF inv.revoked THEN
    RETURN QUERY SELECT inv.trip_id, t.name, t.start_date, t.end_date, NULL::text, false, 'Dieser Einladungslink wurde widerrufen.';
    RETURN;
  END IF;

  IF inv.expires_at IS NOT NULL AND inv.expires_at < now() THEN
    RETURN QUERY SELECT inv.trip_id, t.name, t.start_date, t.end_date, NULL::text, false, 'Dieser Einladungslink ist abgelaufen.';
    RETURN;
  END IF;

  IF inv.max_uses IS NOT NULL AND inv.uses_count >= inv.max_uses THEN
    RETURN QUERY SELECT inv.trip_id, t.name, t.start_date, t.end_date, NULL::text, false, 'Dieser Einladungslink wurde bereits verwendet.';
    RETURN;
  END IF;

  RETURN QUERY SELECT
    inv.trip_id, t.name, t.start_date, t.end_date,
    (SELECT m.display_name FROM public.trip_members m WHERE m.id = inv.placeholder_member_id),
    true, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_trip_invite(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.accept_trip_invite(p_token uuid, p_display_name text)
RETURNS public.trip_members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  inv public.trip_invites%ROWTYPE;
  existing public.trip_members%ROWTYPE;
  result public.trip_members%ROWTYPE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO inv FROM public.trip_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ungültiger Einladungslink.';
  END IF;
  IF inv.revoked THEN
    RAISE EXCEPTION 'Dieser Einladungslink wurde widerrufen.';
  END IF;
  IF inv.expires_at IS NOT NULL AND inv.expires_at < now() THEN
    RAISE EXCEPTION 'Dieser Einladungslink ist abgelaufen.';
  END IF;
  IF inv.max_uses IS NOT NULL AND inv.uses_count >= inv.max_uses THEN
    RAISE EXCEPTION 'Dieser Einladungslink wurde bereits verwendet.';
  END IF;

  SELECT * INTO existing FROM public.trip_members WHERE trip_id = inv.trip_id AND user_id = uid;

  IF FOUND THEN
    UPDATE public.trip_members
    SET display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name)
    WHERE id = existing.id
    RETURNING * INTO result;
  ELSIF inv.placeholder_member_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.trip_members WHERE id = inv.placeholder_member_id AND user_id IS NULL
  ) THEN
    UPDATE public.trip_members
    SET user_id = uid, is_placeholder = false,
        display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name)
    WHERE id = inv.placeholder_member_id
    RETURNING * INTO result;
  ELSE
    INSERT INTO public.trip_members (trip_id, user_id, display_name, is_placeholder)
    VALUES (inv.trip_id, uid, COALESCE(NULLIF(TRIM(p_display_name), ''), ''), false)
    RETURNING * INTO result;
  END IF;

  UPDATE public.trip_invites SET uses_count = uses_count + 1, last_used_at = now() WHERE id = inv.id;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_trip_invite(uuid, text) TO authenticated;

-- ============================================================================
-- Storage
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('trip-images', 'trip-images', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS trip_images_public_read ON storage.objects;
CREATE POLICY trip_images_public_read
  ON storage.objects FOR SELECT
  USING (bucket_id = 'trip-images');

DROP POLICY IF EXISTS trip_images_member_write ON storage.objects;
CREATE POLICY trip_images_member_write
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'trip-images'
    AND auth.uid() IS NOT NULL
    AND public.is_trip_member((split_part(name, '/', 1))::uuid)
  )
  WITH CHECK (
    bucket_id = 'trip-images'
    AND auth.uid() IS NOT NULL
    AND public.is_trip_member((split_part(name, '/', 1))::uuid)
  );
