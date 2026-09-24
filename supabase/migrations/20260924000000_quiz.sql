-- Quiz: Kahoot-Alternative — Quiz erstellen/bearbeiten, live hosten (Code/QR),
-- Mitspieler ohne Account per Code+Name, Echtzeit-Rangliste.

-- ============================================================================
-- Kern-Tabellen (Editor)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  points_mode text NOT NULL DEFAULT 'speed' CHECK (points_mode IN ('speed', 'fixed', 'none')),
  points_per_question int NOT NULL DEFAULT 1000 CHECK (points_per_question >= 0),
  max_players int CHECK (max_players IS NULL OR max_players > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quizzes_owner_idx ON public.quizzes (owner_id);

DROP TRIGGER IF EXISTS quizzes_updated_at ON public.quizzes;
CREATE TRIGGER quizzes_updated_at
  BEFORE UPDATE ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  question_text text NOT NULL DEFAULT '',
  image_path text,
  answer_mode text NOT NULL DEFAULT 'four' CHECK (answer_mode IN ('two', 'four')),
  time_limit_sec int NOT NULL DEFAULT 20 CHECK (time_limit_sec > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_questions_quiz_idx ON public.quiz_questions (quiz_id, sort_order);

CREATE TABLE IF NOT EXISTS public.quiz_question_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  sort_order int NOT NULL CHECK (sort_order BETWEEN 0 AND 3),
  option_text text NOT NULL DEFAULT '',
  is_correct boolean NOT NULL DEFAULT false,
  UNIQUE (question_id, sort_order)
);

CREATE INDEX IF NOT EXISTS quiz_question_options_question_idx ON public.quiz_question_options (question_id);

-- ============================================================================
-- Live-Sessions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  host_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  join_code text NOT NULL,
  status text NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'question', 'reveal', 'leaderboard', 'ended')),
  current_question_index int NOT NULL DEFAULT -1,
  question_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX IF NOT EXISTS quiz_sessions_quiz_idx ON public.quiz_sessions (quiz_id);
CREATE INDEX IF NOT EXISTS quiz_sessions_host_idx ON public.quiz_sessions (host_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS quiz_sessions_join_code_active_uidx
  ON public.quiz_sessions (join_code) WHERE status <> 'ended';

CREATE TABLE IF NOT EXISTS public.quiz_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  client_token uuid NOT NULL,
  name text NOT NULL DEFAULT '',
  score int NOT NULL DEFAULT 0,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, client_token)
);

CREATE INDEX IF NOT EXISTS quiz_players_session_idx ON public.quiz_players (session_id);

CREATE TABLE IF NOT EXISTS public.quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.quiz_players(id) ON DELETE CASCADE,
  option_ids uuid[] NOT NULL DEFAULT '{}',
  is_correct boolean NOT NULL DEFAULT false,
  points_awarded int NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, player_id)
);

CREATE INDEX IF NOT EXISTS quiz_answers_session_idx ON public.quiz_answers (session_id, question_id);

-- ============================================================================
-- Helper-Functions (RLS)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_quiz_owner(qid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = qid AND q.owner_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.is_quiz_session_host(sid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.quiz_sessions s WHERE s.id = sid AND s.host_user_id = auth.uid()
  );
$$;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;

-- quizzes / quiz_questions / quiz_question_options: nur Owner (enthalten Lösungen!)

DROP POLICY IF EXISTS quizzes_all ON public.quizzes;
CREATE POLICY quizzes_all ON public.quizzes
  FOR ALL USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS quiz_questions_all ON public.quiz_questions;
CREATE POLICY quiz_questions_all ON public.quiz_questions
  FOR ALL USING (public.is_quiz_owner(quiz_id)) WITH CHECK (public.is_quiz_owner(quiz_id));

DROP POLICY IF EXISTS quiz_question_options_all ON public.quiz_question_options;
CREATE POLICY quiz_question_options_all ON public.quiz_question_options
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.quiz_questions qq WHERE qq.id = question_id AND public.is_quiz_owner(qq.quiz_id))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.quiz_questions qq WHERE qq.id = question_id AND public.is_quiz_owner(qq.quiz_id))
  );

-- quiz_sessions: öffentlich lesbar (kein sensibler Inhalt — nur Status/Zeiten), Schreiben nur Host.
-- Mitspieler ohne Account brauchen Lesezugriff für Realtime (Status/Fragen-Index/Timer).

DROP POLICY IF EXISTS quiz_sessions_select ON public.quiz_sessions;
CREATE POLICY quiz_sessions_select ON public.quiz_sessions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS quiz_sessions_insert ON public.quiz_sessions;
CREATE POLICY quiz_sessions_insert ON public.quiz_sessions
  FOR INSERT WITH CHECK (host_user_id = auth.uid() AND public.is_quiz_owner(quiz_id));

DROP POLICY IF EXISTS quiz_sessions_update ON public.quiz_sessions;
CREATE POLICY quiz_sessions_update ON public.quiz_sessions
  FOR UPDATE USING (host_user_id = auth.uid()) WITH CHECK (host_user_id = auth.uid());

DROP POLICY IF EXISTS quiz_sessions_delete ON public.quiz_sessions;
CREATE POLICY quiz_sessions_delete ON public.quiz_sessions
  FOR DELETE USING (host_user_id = auth.uid());

-- quiz_players: öffentlich lesbar (Rangliste), Schreiben ausschliesslich über join_quiz_session()
-- (SECURITY DEFINER, umgeht RLS) bzw. Host darf Spieler entfernen.

DROP POLICY IF EXISTS quiz_players_select ON public.quiz_players;
CREATE POLICY quiz_players_select ON public.quiz_players
  FOR SELECT USING (true);

DROP POLICY IF EXISTS quiz_players_delete ON public.quiz_players;
CREATE POLICY quiz_players_delete ON public.quiz_players
  FOR DELETE USING (public.is_quiz_session_host(session_id));

-- quiz_answers: enthält is_correct — nur der Host darf lesen (z.B. Auswertungs-Balken).
-- Schreiben ausschliesslich über submit_quiz_answer() (SECURITY DEFINER).

DROP POLICY IF EXISTS quiz_answers_select ON public.quiz_answers;
CREATE POLICY quiz_answers_select ON public.quiz_answers
  FOR SELECT USING (public.is_quiz_session_host(session_id));

-- ============================================================================
-- RPCs
-- ============================================================================

-- Neue Live-Session mit eindeutigem 6-stelligem Code starten (Host, authentifiziert).
CREATE OR REPLACE FUNCTION public.create_quiz_session(p_quiz_id uuid)
RETURNS public.quiz_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  new_row public.quiz_sessions%ROWTYPE;
  code text;
  attempt int := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_quiz_owner(p_quiz_id) THEN
    RAISE EXCEPTION 'Kein Zugriff auf dieses Quiz.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quiz_questions WHERE quiz_id = p_quiz_id) THEN
    RAISE EXCEPTION 'Dieses Quiz hat noch keine Fragen.';
  END IF;

  LOOP
    code := lpad(floor(random() * 1000000)::text, 6, '0');
    attempt := attempt + 1;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.quiz_sessions WHERE join_code = code AND status <> 'ended'
    ) OR attempt > 20;
  END LOOP;
  IF attempt > 20 THEN
    RAISE EXCEPTION 'Konnte keinen freien Code erzeugen — bitte erneut versuchen.';
  END IF;

  INSERT INTO public.quiz_sessions (quiz_id, host_user_id, join_code)
  VALUES (p_quiz_id, uid, code)
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_quiz_session(uuid) TO authenticated;

-- Mitspieler tritt per Code bei (kein Account nötig). client_token identifiziert das Gerät,
-- damit ein Reload nicht als neuer Spieler zählt.
CREATE OR REPLACE FUNCTION public.join_quiz_session(p_join_code text, p_name text, p_client_token uuid)
RETURNS TABLE(player_id uuid, session_id uuid, quiz_title text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.quiz_sessions%ROWTYPE;
  q public.quizzes%ROWTYPE;
  player_count int;
  existing_id uuid;
  result_id uuid;
  clean_name text := NULLIF(TRIM(p_name), '');
BEGIN
  IF clean_name IS NULL THEN
    RAISE EXCEPTION 'Bitte einen Namen eingeben.';
  END IF;

  SELECT * INTO s FROM public.quiz_sessions WHERE join_code = p_join_code AND status <> 'ended';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ungültiger oder abgelaufener Code.';
  END IF;
  IF s.status <> 'lobby' THEN
    RAISE EXCEPTION 'Dieses Quiz läuft bereits — Beitritt nicht mehr möglich.';
  END IF;

  SELECT * INTO q FROM public.quizzes WHERE id = s.quiz_id;

  SELECT id INTO existing_id FROM public.quiz_players
  WHERE session_id = s.id AND client_token = p_client_token;

  IF existing_id IS NULL THEN
    IF q.max_players IS NOT NULL THEN
      SELECT count(*) INTO player_count FROM public.quiz_players WHERE session_id = s.id;
      IF player_count >= q.max_players THEN
        RAISE EXCEPTION 'Dieses Quiz ist bereits voll.';
      END IF;
    END IF;

    INSERT INTO public.quiz_players (session_id, client_token, name)
    VALUES (s.id, p_client_token, clean_name)
    RETURNING id INTO result_id;
  ELSE
    UPDATE public.quiz_players SET name = clean_name WHERE id = existing_id
    RETURNING id INTO result_id;
  END IF;

  RETURN QUERY SELECT result_id, s.id, q.title;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_quiz_session(text, text, uuid) TO anon, authenticated;

-- Aktuelle Frage für Mitspieler-Geräte — liefert bewusst KEIN is_correct.
CREATE OR REPLACE FUNCTION public.get_quiz_current_question(p_session_id uuid, p_client_token uuid)
RETURNS TABLE(
  question_id uuid,
  question_text text,
  image_path text,
  answer_mode text,
  time_limit_sec int,
  question_started_at timestamptz,
  options jsonb,
  already_answered boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  s public.quiz_sessions%ROWTYPE;
  qq public.quiz_questions%ROWTYPE;
  p_id uuid;
BEGIN
  SELECT * INTO s FROM public.quiz_sessions WHERE id = p_session_id;
  IF NOT FOUND OR s.current_question_index < 0 THEN
    RETURN;
  END IF;

  SELECT * INTO qq FROM public.quiz_questions
  WHERE quiz_id = s.quiz_id ORDER BY sort_order OFFSET s.current_question_index LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT id INTO p_id FROM public.quiz_players WHERE session_id = p_session_id AND client_token = p_client_token;

  RETURN QUERY SELECT
    qq.id,
    qq.question_text,
    qq.image_path,
    qq.answer_mode,
    qq.time_limit_sec,
    s.question_started_at,
    (
      SELECT jsonb_agg(jsonb_build_object('id', o.id, 'sort_order', o.sort_order, 'option_text', o.option_text) ORDER BY o.sort_order)
      FROM public.quiz_question_options o WHERE o.question_id = qq.id
    ),
    (p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.quiz_answers a WHERE a.question_id = qq.id AND a.player_id = p_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_current_question(uuid, uuid) TO anon, authenticated;

-- Antwort abgeben — berechnet Korrektheit & Punkte serverseitig (Client kann nicht schummeln).
CREATE OR REPLACE FUNCTION public.submit_quiz_answer(p_session_id uuid, p_client_token uuid, p_option_ids uuid[])
RETURNS TABLE(is_correct boolean, points_awarded int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.quiz_sessions%ROWTYPE;
  q public.quizzes%ROWTYPE;
  qq public.quiz_questions%ROWTYPE;
  ply public.quiz_players%ROWTYPE;
  correct_ids uuid[];
  submitted_ids uuid[];
  correct boolean;
  elapsed_sec numeric;
  remaining_fraction numeric;
  pts int := 0;
BEGIN
  SELECT * INTO s FROM public.quiz_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'question' OR s.current_question_index < 0 THEN
    RAISE EXCEPTION 'Diese Frage ist nicht mehr aktiv.';
  END IF;

  SELECT * INTO ply FROM public.quiz_players WHERE session_id = p_session_id AND client_token = p_client_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spieler nicht gefunden — bitte erneut beitreten.';
  END IF;

  SELECT * INTO qq FROM public.quiz_questions
  WHERE quiz_id = s.quiz_id ORDER BY sort_order OFFSET s.current_question_index LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Frage nicht gefunden.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.quiz_answers WHERE question_id = qq.id AND player_id = ply.id) THEN
    RAISE EXCEPTION 'Antwort wurde bereits abgegeben.';
  END IF;

  SELECT array_agg(id ORDER BY id) INTO correct_ids
  FROM public.quiz_question_options WHERE question_id = qq.id AND is_correct;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO submitted_ids FROM unnest(p_option_ids) x;

  correct := (correct_ids IS NOT NULL AND submitted_ids IS NOT NULL AND correct_ids = submitted_ids);

  SELECT * INTO q FROM public.quizzes WHERE id = s.quiz_id;

  IF correct THEN
    IF q.points_mode = 'fixed' THEN
      pts := q.points_per_question;
    ELSIF q.points_mode = 'speed' THEN
      elapsed_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - COALESCE(s.question_started_at, now()))));
      remaining_fraction := GREATEST(0, LEAST(1, (qq.time_limit_sec - elapsed_sec) / qq.time_limit_sec));
      pts := round(q.points_per_question * (0.5 + 0.5 * remaining_fraction));
    ELSE
      pts := 0;
    END IF;
  END IF;

  INSERT INTO public.quiz_answers (session_id, question_id, player_id, option_ids, is_correct, points_awarded)
  VALUES (p_session_id, qq.id, ply.id, COALESCE(p_option_ids, '{}'), correct, pts);

  UPDATE public.quiz_players SET score = score + pts WHERE id = ply.id;

  RETURN QUERY SELECT correct, pts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, uuid, uuid[]) TO anon, authenticated;

-- Antwort-Verteilung pro Option für die Host-Auswertung (aggregiert, keine Spieler-Identität).
CREATE OR REPLACE FUNCTION public.get_quiz_answer_stats(p_session_id uuid, p_question_id uuid)
RETURNS TABLE(option_id uuid, sort_order int, option_text text, is_correct boolean, answer_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.sort_order, o.option_text, o.is_correct,
    (SELECT count(*) FROM public.quiz_answers a
      WHERE a.question_id = p_question_id AND a.session_id = p_session_id AND o.id = ANY(a.option_ids))
  FROM public.quiz_question_options o
  WHERE o.question_id = p_question_id
    AND public.is_quiz_session_host(p_session_id)
  ORDER BY o.sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_answer_stats(uuid, uuid) TO authenticated;

-- ============================================================================
-- Storage
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('quiz-images', 'quiz-images', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS quiz_images_public_read ON storage.objects;
CREATE POLICY quiz_images_public_read
  ON storage.objects FOR SELECT
  USING (bucket_id = 'quiz-images');

DROP POLICY IF EXISTS quiz_images_owner_write ON storage.objects;
CREATE POLICY quiz_images_owner_write
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'quiz-images'
    AND auth.uid() IS NOT NULL
    AND public.is_quiz_owner((split_part(name, '/', 1))::uuid)
  )
  WITH CHECK (
    bucket_id = 'quiz-images'
    AND auth.uid() IS NOT NULL
    AND public.is_quiz_owner((split_part(name, '/', 1))::uuid)
  );

-- ============================================================================
-- Realtime
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_players;
