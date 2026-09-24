-- Quiz: drei neue Fragetypen — "Wer würde eher" (Spieler wählen), Freitext mit
-- Publikumsabstimmung, und Mehrheitsfrage (Korrektheit erst nachträglich per Mehrheit).

-- ============================================================================
-- Schema
-- ============================================================================

ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'standard'
    CHECK (question_type IN ('standard', 'majority', 'vote_player', 'open_text'));

ALTER TABLE public.quiz_sessions DROP CONSTRAINT IF EXISTS quiz_sessions_status_check;
ALTER TABLE public.quiz_sessions ADD CONSTRAINT quiz_sessions_status_check
  CHECK (status IN ('lobby', 'collect', 'question', 'reveal', 'leaderboard', 'ended'));

CREATE TABLE IF NOT EXISTS public.quiz_player_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  voter_player_id uuid NOT NULL REFERENCES public.quiz_players(id) ON DELETE CASCADE,
  voted_player_id uuid NOT NULL REFERENCES public.quiz_players(id) ON DELETE CASCADE,
  points_awarded int NOT NULL DEFAULT 0,
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, voter_player_id)
);

CREATE INDEX IF NOT EXISTS quiz_player_votes_session_idx ON public.quiz_player_votes (session_id, question_id);

CREATE TABLE IF NOT EXISTS public.quiz_open_text_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.quiz_players(id) ON DELETE CASCADE,
  answer_text text NOT NULL DEFAULT '',
  votes_received int NOT NULL DEFAULT 0,
  points_awarded int NOT NULL DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, player_id)
);

CREATE INDEX IF NOT EXISTS quiz_open_text_answers_session_idx ON public.quiz_open_text_answers (session_id, question_id);

CREATE TABLE IF NOT EXISTS public.quiz_open_text_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  voter_player_id uuid NOT NULL REFERENCES public.quiz_players(id) ON DELETE CASCADE,
  voted_answer_id uuid NOT NULL REFERENCES public.quiz_open_text_answers(id) ON DELETE CASCADE,
  voted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, voter_player_id)
);

CREATE INDEX IF NOT EXISTS quiz_open_text_votes_session_idx ON public.quiz_open_text_votes (session_id, question_id);

-- ============================================================================
-- RLS — gleiche Logik wie quiz_answers: Rohdaten nur für den Host sichtbar
-- (sonst könnten Mitspieler vor der Auswertung erkennen, wer vorne liegt /
-- wer was geschrieben hat). Mitspieler bekommen alles ausschliesslich über RPCs.
-- ============================================================================

ALTER TABLE public.quiz_player_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_open_text_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_open_text_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_player_votes_select ON public.quiz_player_votes;
CREATE POLICY quiz_player_votes_select ON public.quiz_player_votes
  FOR SELECT USING (public.is_quiz_session_host(session_id));

DROP POLICY IF EXISTS quiz_open_text_answers_select ON public.quiz_open_text_answers;
CREATE POLICY quiz_open_text_answers_select ON public.quiz_open_text_answers
  FOR SELECT USING (public.is_quiz_session_host(session_id));

DROP POLICY IF EXISTS quiz_open_text_votes_select ON public.quiz_open_text_votes;
CREATE POLICY quiz_open_text_votes_select ON public.quiz_open_text_votes
  FOR SELECT USING (public.is_quiz_session_host(session_id));

-- ============================================================================
-- get_quiz_current_question — um die drei neuen Typen erweitert. Für
-- "Wer würde eher" sind die Optionen die aktuell beigetretenen Mitspieler
-- (ohne sich selbst); für Freitext-Abstimmung die eingereichten Texte
-- (ohne die eigene). Für "Mehrheitsfrage" unverändert wie bei Standard.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_quiz_current_question(uuid, uuid);

CREATE FUNCTION public.get_quiz_current_question(p_session_id uuid, p_client_token uuid)
RETURNS TABLE(
  question_id uuid,
  question_text text,
  image_path text,
  answer_mode text,
  question_type text,
  time_limit_sec int,
  question_started_at timestamptz,
  answer_started_at timestamptz,
  no_projector_mode boolean,
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
  qz public.quizzes%ROWTYPE;
  qq public.quiz_questions%ROWTYPE;
  p_id uuid;
  v_options jsonb;
  v_already boolean;
BEGIN
  SELECT * INTO s FROM public.quiz_sessions WHERE id = p_session_id;
  IF NOT FOUND OR s.current_question_index < 0 THEN
    RETURN;
  END IF;

  SELECT * INTO qz FROM public.quizzes WHERE id = s.quiz_id;

  SELECT * INTO qq FROM public.quiz_questions
  WHERE quiz_id = s.quiz_id ORDER BY sort_order OFFSET s.current_question_index LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT qp.id INTO p_id FROM public.quiz_players qp WHERE qp.session_id = p_session_id AND qp.client_token = p_client_token;

  IF qq.question_type = 'vote_player' THEN
    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'sort_order', o.rn - 1, 'option_text', o.name))
    INTO v_options
    FROM (
      SELECT qp.id, qp.name, row_number() OVER (ORDER BY qp.joined_at) AS rn
      FROM public.quiz_players qp
      WHERE qp.session_id = p_session_id AND (p_id IS NULL OR qp.id <> p_id)
    ) o;
    v_already := p_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.quiz_player_votes v WHERE v.question_id = qq.id AND v.voter_player_id = p_id
    );
  ELSIF qq.question_type = 'open_text' THEN
    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'sort_order', o.rn - 1, 'option_text', o.answer_text))
    INTO v_options
    FROM (
      SELECT a.id, a.answer_text, row_number() OVER (ORDER BY random()) AS rn
      FROM public.quiz_open_text_answers a
      WHERE a.question_id = qq.id AND (p_id IS NULL OR a.player_id <> p_id)
    ) o;
    v_already := p_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.quiz_open_text_votes v WHERE v.question_id = qq.id AND v.voter_player_id = p_id
    );
  ELSE
    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'sort_order', o.sort_order, 'option_text', o.option_text) ORDER BY o.sort_order)
    INTO v_options
    FROM public.quiz_question_options o WHERE o.question_id = qq.id;
    v_already := p_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.quiz_answers a WHERE a.question_id = qq.id AND a.player_id = p_id
    );
  END IF;

  RETURN QUERY SELECT
    qq.id, qq.question_text, qq.image_path, qq.answer_mode, qq.question_type,
    qq.time_limit_sec, s.question_started_at, s.answer_started_at, qz.no_projector_mode,
    v_options, v_already;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_current_question(uuid, uuid) TO anon, authenticated;

-- ============================================================================
-- submit_quiz_answer — bei Mehrheitsfragen ist die Korrektheit erst nach der
-- Abstimmung bekannt, daher wird hier nicht mehr gewertet (points_awarded=0,
-- is_correct=false), sondern erst per finalize_majority_scoring() beim Reveal.
-- ============================================================================

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
  IF s.answer_started_at IS NULL THEN
    RAISE EXCEPTION 'Die Antwortmöglichkeiten sind noch nicht offen.';
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
  IF qq.question_type NOT IN ('standard', 'majority') THEN
    RAISE EXCEPTION 'Falscher Fragetyp für diese Aktion.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.quiz_answers WHERE question_id = qq.id AND player_id = ply.id) THEN
    RAISE EXCEPTION 'Antwort wurde bereits abgegeben.';
  END IF;

  IF qq.question_type = 'majority' THEN
    correct := false;
    pts := 0;
  ELSE
    SELECT array_agg(o.id ORDER BY o.id) INTO correct_ids
    FROM public.quiz_question_options o WHERE o.question_id = qq.id AND o.is_correct;
    SELECT array_agg(DISTINCT x ORDER BY x) INTO submitted_ids FROM unnest(p_option_ids) x;

    correct := (correct_ids IS NOT NULL AND submitted_ids IS NOT NULL AND correct_ids = submitted_ids);

    SELECT * INTO q FROM public.quizzes WHERE id = s.quiz_id;

    IF correct THEN
      IF q.points_mode = 'fixed' THEN
        pts := q.points_per_question;
      ELSIF q.points_mode = 'speed' THEN
        elapsed_sec := GREATEST(0, EXTRACT(EPOCH FROM (now() - s.answer_started_at)));
        remaining_fraction := GREATEST(0, LEAST(1, (qq.time_limit_sec - elapsed_sec) / qq.time_limit_sec));
        pts := round(q.points_per_question * (0.5 + 0.5 * remaining_fraction));
      ELSE
        pts := 0;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.quiz_answers (session_id, question_id, player_id, option_ids, is_correct, points_awarded)
  VALUES (p_session_id, qq.id, ply.id, COALESCE(p_option_ids, '{}'), correct, pts);

  UPDATE public.quiz_players SET score = score + pts WHERE id = ply.id;

  RETURN QUERY SELECT correct, pts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, uuid, uuid[]) TO anon, authenticated;

-- ============================================================================
-- get_quiz_answer_stats — bei Mehrheitsfragen wird "richtig" dynamisch anhand
-- der meisten Stimmen bestimmt statt aus der gespeicherten is_correct-Spalte.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_quiz_answer_stats(p_session_id uuid, p_question_id uuid)
RETURNS TABLE(option_id uuid, sort_order int, option_text text, is_correct boolean, answer_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT o.id, o.sort_order, o.option_text, o.is_correct AS stored_correct,
      (SELECT count(*) FROM public.quiz_answers a
        WHERE a.question_id = p_question_id AND a.session_id = p_session_id AND o.id = ANY(a.option_ids)) AS cnt
    FROM public.quiz_question_options o
    WHERE o.question_id = p_question_id
  )
  SELECT
    c.id, c.sort_order, c.option_text,
    CASE
      WHEN (SELECT qq.question_type FROM public.quiz_questions qq WHERE qq.id = p_question_id) = 'majority'
        THEN c.cnt > 0 AND c.cnt = (SELECT max(cnt) FROM counts)
      ELSE c.stored_correct
    END,
    c.cnt
  FROM counts c
  WHERE public.is_quiz_session_host(p_session_id)
  ORDER BY c.sort_order;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_answer_stats(uuid, uuid) TO authenticated;

-- ============================================================================
-- finalize_majority_scoring — wird vom Host beim Reveal einer Mehrheitsfrage
-- aufgerufen: ermittelt die meistgewählte Option und vergibt Punkte an alle,
-- die sie gewählt haben. Idempotent (Differenz-Update), darf mehrfach laufen.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.finalize_majority_scoring(p_session_id uuid, p_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qz public.quizzes%ROWTYPE;
  winning_option uuid;
  winning_count bigint;
  pts int;
BEGIN
  IF NOT public.is_quiz_session_host(p_session_id) THEN
    RAISE EXCEPTION 'Kein Zugriff.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO qz FROM public.quizzes WHERE id = (SELECT quiz_id FROM public.quiz_sessions WHERE id = p_session_id);

  SELECT oid, count(*) INTO winning_option, winning_count
  FROM (
    SELECT unnest(a.option_ids) AS oid
    FROM public.quiz_answers a
    WHERE a.session_id = p_session_id AND a.question_id = p_question_id
  ) x
  GROUP BY oid
  ORDER BY count(*) DESC
  LIMIT 1;

  pts := CASE WHEN qz.points_mode = 'none' THEN 0 ELSE qz.points_per_question END;
  IF winning_option IS NULL OR winning_count = 0 THEN
    pts := 0;
  END IF;

  UPDATE public.quiz_players p
  SET score = score + (
    (CASE WHEN winning_option = ANY(a.option_ids) THEN pts ELSE 0 END) - a.points_awarded
  )
  FROM public.quiz_answers a
  WHERE a.session_id = p_session_id AND a.question_id = p_question_id AND a.player_id = p.id;

  UPDATE public.quiz_answers
  SET is_correct = (winning_option IS NOT NULL AND winning_option = ANY(option_ids)),
      points_awarded = CASE WHEN winning_option IS NOT NULL AND winning_option = ANY(option_ids) THEN pts ELSE 0 END
  WHERE session_id = p_session_id AND question_id = p_question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_majority_scoring(uuid, uuid) TO authenticated;

-- ============================================================================
-- RPCs: "Wer würde eher"
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_player_vote(p_session_id uuid, p_client_token uuid, p_voted_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.quiz_sessions%ROWTYPE;
  qq public.quiz_questions%ROWTYPE;
  ply public.quiz_players%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.quiz_sessions WHERE id = p_session_id;
  IF NOT FOUND OR s.status <> 'question' OR s.answer_started_at IS NULL THEN
    RAISE EXCEPTION 'Die Abstimmung ist nicht aktiv.';
  END IF;

  SELECT * INTO ply FROM public.quiz_players WHERE session_id = p_session_id AND client_token = p_client_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spieler nicht gefunden — bitte erneut beitreten.';
  END IF;

  IF p_voted_player_id = ply.id THEN
    RAISE EXCEPTION 'Du kannst nicht dich selbst wählen.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quiz_players WHERE id = p_voted_player_id AND session_id = p_session_id) THEN
    RAISE EXCEPTION 'Ungültige Auswahl.';
  END IF;

  SELECT * INTO qq FROM public.quiz_questions
  WHERE quiz_id = s.quiz_id ORDER BY sort_order OFFSET s.current_question_index LIMIT 1;
  IF NOT FOUND OR qq.question_type <> 'vote_player' THEN
    RAISE EXCEPTION 'Falscher Fragetyp für diese Aktion.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.quiz_player_votes WHERE question_id = qq.id AND voter_player_id = ply.id) THEN
    RAISE EXCEPTION 'Du hast bereits abgestimmt.';
  END IF;

  INSERT INTO public.quiz_player_votes (session_id, question_id, voter_player_id, voted_player_id)
  VALUES (p_session_id, qq.id, ply.id, p_voted_player_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_player_vote(uuid, uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalize_vote_player_scoring(p_session_id uuid, p_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qz public.quizzes%ROWTYPE;
  winning_player uuid;
  winning_count bigint;
  pts int;
BEGIN
  IF NOT public.is_quiz_session_host(p_session_id) THEN
    RAISE EXCEPTION 'Kein Zugriff.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO qz FROM public.quizzes WHERE id = (SELECT quiz_id FROM public.quiz_sessions WHERE id = p_session_id);

  SELECT v.voted_player_id, count(*) INTO winning_player, winning_count
  FROM public.quiz_player_votes v
  WHERE v.session_id = p_session_id AND v.question_id = p_question_id
  GROUP BY v.voted_player_id
  ORDER BY count(*) DESC
  LIMIT 1;

  pts := CASE WHEN qz.points_mode = 'none' THEN 0 ELSE qz.points_per_question END;
  IF winning_player IS NULL OR winning_count = 0 THEN
    pts := 0;
  END IF;

  UPDATE public.quiz_players p
  SET score = score + (
    (CASE WHEN v.voted_player_id = winning_player THEN pts ELSE 0 END) - v.points_awarded
  )
  FROM public.quiz_player_votes v
  WHERE v.session_id = p_session_id AND v.question_id = p_question_id AND v.voter_player_id = p.id;

  UPDATE public.quiz_player_votes
  SET points_awarded = CASE WHEN voted_player_id = winning_player THEN pts ELSE 0 END
  WHERE session_id = p_session_id AND question_id = p_question_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_vote_player_scoring(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_quiz_player_vote_stats(p_session_id uuid, p_question_id uuid)
RETURNS TABLE(player_id uuid, player_name text, vote_count bigint, is_winner boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH counts AS (
    SELECT qp.id, qp.name,
      (SELECT count(*) FROM public.quiz_player_votes v WHERE v.question_id = p_question_id AND v.voted_player_id = qp.id) AS cnt
    FROM public.quiz_players qp WHERE qp.session_id = p_session_id
  )
  SELECT c.id, c.name, c.cnt, c.cnt > 0 AND c.cnt = (SELECT max(cnt) FROM counts)
  FROM counts c
  WHERE public.is_quiz_session_host(p_session_id)
  ORDER BY c.cnt DESC, c.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_player_vote_stats(uuid, uuid) TO authenticated;

-- ============================================================================
-- RPCs: Freitext + Publikumswahl
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_open_text_answer(p_session_id uuid, p_client_token uuid, p_answer_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.quiz_sessions%ROWTYPE;
  qq public.quiz_questions%ROWTYPE;
  ply public.quiz_players%ROWTYPE;
  clean_text text := NULLIF(TRIM(p_answer_text), '');
BEGIN
  IF clean_text IS NULL THEN
    RAISE EXCEPTION 'Bitte eine Antwort eingeben.';
  END IF;

  SELECT * INTO s FROM public.quiz_sessions WHERE id = p_session_id;
  IF NOT FOUND OR s.status <> 'collect' THEN
    RAISE EXCEPTION 'Die Eingabephase ist nicht aktiv.';
  END IF;

  SELECT * INTO ply FROM public.quiz_players WHERE session_id = p_session_id AND client_token = p_client_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spieler nicht gefunden — bitte erneut beitreten.';
  END IF;

  SELECT * INTO qq FROM public.quiz_questions
  WHERE quiz_id = s.quiz_id ORDER BY sort_order OFFSET s.current_question_index LIMIT 1;
  IF NOT FOUND OR qq.question_type <> 'open_text' THEN
    RAISE EXCEPTION 'Falscher Fragetyp für diese Aktion.';
  END IF;

  INSERT INTO public.quiz_open_text_answers (session_id, question_id, player_id, answer_text)
  VALUES (p_session_id, qq.id, ply.id, LEFT(clean_text, 280))
  ON CONFLICT (question_id, player_id) DO UPDATE SET answer_text = EXCLUDED.answer_text, submitted_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_open_text_answer(uuid, uuid, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_open_text_vote(p_session_id uuid, p_client_token uuid, p_voted_answer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.quiz_sessions%ROWTYPE;
  qq public.quiz_questions%ROWTYPE;
  ply public.quiz_players%ROWTYPE;
  target public.quiz_open_text_answers%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.quiz_sessions WHERE id = p_session_id;
  IF NOT FOUND OR s.status <> 'question' OR s.answer_started_at IS NULL THEN
    RAISE EXCEPTION 'Die Abstimmung ist nicht aktiv.';
  END IF;

  SELECT * INTO ply FROM public.quiz_players WHERE session_id = p_session_id AND client_token = p_client_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spieler nicht gefunden — bitte erneut beitreten.';
  END IF;

  SELECT * INTO target FROM public.quiz_open_text_answers WHERE id = p_voted_answer_id AND session_id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ungültige Auswahl.';
  END IF;
  IF target.player_id = ply.id THEN
    RAISE EXCEPTION 'Du kannst nicht für deine eigene Antwort abstimmen.';
  END IF;

  SELECT * INTO qq FROM public.quiz_questions
  WHERE quiz_id = s.quiz_id ORDER BY sort_order OFFSET s.current_question_index LIMIT 1;
  IF NOT FOUND OR qq.question_type <> 'open_text' THEN
    RAISE EXCEPTION 'Falscher Fragetyp für diese Aktion.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.quiz_open_text_votes WHERE question_id = qq.id AND voter_player_id = ply.id) THEN
    RAISE EXCEPTION 'Du hast bereits abgestimmt.';
  END IF;

  INSERT INTO public.quiz_open_text_votes (session_id, question_id, voter_player_id, voted_answer_id)
  VALUES (p_session_id, qq.id, ply.id, p_voted_answer_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_open_text_vote(uuid, uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.finalize_open_text_scoring(p_session_id uuid, p_question_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  qz public.quizzes%ROWTYPE;
  total_votes bigint;
BEGIN
  IF NOT public.is_quiz_session_host(p_session_id) THEN
    RAISE EXCEPTION 'Kein Zugriff.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO qz FROM public.quizzes WHERE id = (SELECT quiz_id FROM public.quiz_sessions WHERE id = p_session_id);

  SELECT count(*) INTO total_votes FROM public.quiz_open_text_votes
  WHERE session_id = p_session_id AND question_id = p_question_id;

  IF total_votes = 0 OR qz.points_mode = 'none' THEN
    UPDATE public.quiz_players p
    SET score = score - a.points_awarded
    FROM public.quiz_open_text_answers a
    WHERE a.session_id = p_session_id AND a.question_id = p_question_id AND a.player_id = p.id;

    UPDATE public.quiz_open_text_answers
    SET points_awarded = 0, votes_received = 0
    WHERE session_id = p_session_id AND question_id = p_question_id;
    RETURN;
  END IF;

  WITH counts AS (
    SELECT voted_answer_id, count(*) AS c
    FROM public.quiz_open_text_votes
    WHERE session_id = p_session_id AND question_id = p_question_id
    GROUP BY voted_answer_id
  ),
  scored AS (
    SELECT a.id, a.player_id, a.points_awarded AS old_pts,
      round(qz.points_per_question * COALESCE(c.c, 0)::numeric / total_votes)::int AS new_pts
    FROM public.quiz_open_text_answers a
    LEFT JOIN counts c ON c.voted_answer_id = a.id
    WHERE a.session_id = p_session_id AND a.question_id = p_question_id
  )
  UPDATE public.quiz_players p
  SET score = score + (scored.new_pts - scored.old_pts)
  FROM scored
  WHERE scored.player_id = p.id;

  WITH counts AS (
    SELECT voted_answer_id, count(*) AS c
    FROM public.quiz_open_text_votes
    WHERE session_id = p_session_id AND question_id = p_question_id
    GROUP BY voted_answer_id
  )
  UPDATE public.quiz_open_text_answers a
  SET votes_received = c.c,
      points_awarded = round(qz.points_per_question * c.c::numeric / total_votes)::int
  FROM counts c
  WHERE a.id = c.voted_answer_id AND a.session_id = p_session_id AND a.question_id = p_question_id;

  UPDATE public.quiz_open_text_answers a
  SET votes_received = 0, points_awarded = 0
  WHERE a.session_id = p_session_id AND a.question_id = p_question_id
    AND NOT EXISTS (
      SELECT 1 FROM public.quiz_open_text_votes v WHERE v.voted_answer_id = a.id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_open_text_scoring(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_quiz_open_text_stats(p_session_id uuid, p_question_id uuid)
RETURNS TABLE(answer_id uuid, player_name text, answer_text text, votes_received int, points_awarded int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, qp.name, a.answer_text, a.votes_received, a.points_awarded
  FROM public.quiz_open_text_answers a
  JOIN public.quiz_players qp ON qp.id = a.player_id
  WHERE a.session_id = p_session_id AND a.question_id = p_question_id
    AND public.is_quiz_session_host(p_session_id)
  ORDER BY a.votes_received DESC, qp.name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_open_text_stats(uuid, uuid) TO authenticated;

-- ============================================================================
-- Realtime für Live-Zähler in "Eingeben"-Phase (Host pollt Spieleranzahl vs.
-- Einreichungen); Tabellen bleiben sonst host-only lesbar wie quiz_answers.
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_open_text_answers;
