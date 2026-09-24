-- Quiz: Spieler können in der Lobby eigene Fragen erstellen (Anzahl pro Spieler einstellbar).
-- Solche Fragen gehören zur Session (nicht zum Quiz) und werden hinten angehängt.
-- Der Autor kann seine eigene Frage nicht beantworten.

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS player_questions_per_player int NOT NULL DEFAULT 0
    CHECK (player_questions_per_player >= 0);

ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.quiz_sessions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS author_player_id uuid REFERENCES public.quiz_players(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quiz_questions_session_idx ON public.quiz_questions (session_id);

-- Bestehende RPCs: Fragen-Auswahl auf Quiz-Fragen + Fragen dieser Session einschränken.
DO $$
DECLARE
  r record;
  def text;
  new_def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('submit_quiz_answer', 'submit_player_vote', 'submit_open_text_answer', 'submit_open_text_vote')
  LOOP
    def := pg_get_functiondef(r.oid);
    new_def := replace(
      def,
      'WHERE quiz_id = s.quiz_id ORDER BY sort_order OFFSET',
      'WHERE quiz_id = s.quiz_id AND (public.quiz_questions.session_id IS NULL OR public.quiz_questions.session_id = s.id) ORDER BY sort_order OFFSET'
    );
    IF r.proname = 'submit_quiz_answer' THEN
      new_def := replace(
        new_def,
        'IF EXISTS (SELECT 1 FROM public.quiz_answers WHERE question_id = qq.id AND player_id = ply.id) THEN',
        'IF qq.author_player_id IS NOT NULL AND qq.author_player_id = ply.id THEN RAISE EXCEPTION ''Das ist deine eigene Frage.''; END IF; IF EXISTS (SELECT 1 FROM public.quiz_answers WHERE question_id = qq.id AND player_id = ply.id) THEN'
      );
    END IF;
    IF new_def = def THEN
      RAISE EXCEPTION 'Replace failed for %', r.proname;
    END IF;
    EXECUTE new_def;
  END LOOP;
END $$;

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
  already_answered boolean,
  is_own_question boolean
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
  WHERE quiz_id = s.quiz_id AND (public.quiz_questions.session_id IS NULL OR public.quiz_questions.session_id = s.id)
  ORDER BY sort_order, created_at OFFSET s.current_question_index LIMIT 1;
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
      WHERE qp.session_id = p_session_id
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
    v_options, v_already,
    (p_id IS NOT NULL AND qq.author_player_id IS NOT NULL AND qq.author_player_id = p_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_current_question(uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_player_question_info(p_session_id uuid, p_client_token uuid)
RETURNS TABLE(allowed_count int, created_count int, lobby_open boolean)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  s public.quiz_sessions%ROWTYPE;
  qz public.quizzes%ROWTYPE;
  pid uuid;
BEGIN
  SELECT * INTO s FROM public.quiz_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, false;
    RETURN;
  END IF;
  SELECT * INTO qz FROM public.quizzes WHERE id = s.quiz_id;
  SELECT qp.id INTO pid FROM public.quiz_players qp WHERE qp.session_id = p_session_id AND qp.client_token = p_client_token;
  RETURN QUERY SELECT
    qz.player_questions_per_player,
    (SELECT count(*)::int FROM public.quiz_questions x WHERE x.session_id = p_session_id AND x.author_player_id = pid),
    (s.status = 'lobby');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_player_question_info(uuid, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_player_question(
  p_session_id uuid, p_client_token uuid, p_question_text text, p_options text[], p_correct_index int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.quiz_sessions%ROWTYPE;
  qz public.quizzes%ROWTYPE;
  ply public.quiz_players%ROWTYPE;
  clean_text text := NULLIF(TRIM(p_question_text), '');
  created int;
  new_id uuid;
  i int;
BEGIN
  SELECT * INTO s FROM public.quiz_sessions WHERE id = p_session_id;
  IF NOT FOUND OR s.status <> 'lobby' THEN
    RAISE EXCEPTION 'Fragen können nur in der Lobby erstellt werden.';
  END IF;
  SELECT * INTO qz FROM public.quizzes WHERE id = s.quiz_id;
  IF qz.player_questions_per_player <= 0 THEN
    RAISE EXCEPTION 'Eigene Fragen sind bei diesem Quiz nicht aktiviert.';
  END IF;
  SELECT * INTO ply FROM public.quiz_players WHERE session_id = p_session_id AND client_token = p_client_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Spieler nicht gefunden — bitte erneut beitreten.';
  END IF;
  SELECT count(*) INTO created FROM public.quiz_questions x WHERE x.session_id = p_session_id AND x.author_player_id = ply.id;
  IF created >= qz.player_questions_per_player THEN
    RAISE EXCEPTION 'Du hast bereits alle deine Fragen erstellt.';
  END IF;
  IF clean_text IS NULL THEN
    RAISE EXCEPTION 'Bitte einen Fragetext eingeben.';
  END IF;
  IF p_options IS NULL OR array_length(p_options, 1) <> 4 THEN
    RAISE EXCEPTION 'Bitte vier Antworten angeben.';
  END IF;
  FOR i IN 1..4 LOOP
    IF NULLIF(TRIM(p_options[i]), '') IS NULL THEN
      RAISE EXCEPTION 'Bitte alle Antwortfelder ausfüllen.';
    END IF;
  END LOOP;
  IF p_correct_index IS NULL OR p_correct_index < 0 OR p_correct_index > 3 THEN
    RAISE EXCEPTION 'Bitte die richtige Antwort wählen.';
  END IF;

  INSERT INTO public.quiz_questions (quiz_id, session_id, author_player_id, sort_order, question_text, answer_mode, question_type, time_limit_sec)
  VALUES (s.quiz_id, p_session_id, ply.id, 1000 + (SELECT count(*)::int FROM public.quiz_questions y WHERE y.session_id = p_session_id),
          LEFT(clean_text, 300), 'four', 'standard', 20)
  RETURNING id INTO new_id;

  FOR i IN 1..4 LOOP
    INSERT INTO public.quiz_question_options (question_id, sort_order, option_text, is_correct)
    VALUES (new_id, i - 1, LEFT(TRIM(p_options[i]), 120), (i - 1) = p_correct_index);
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_player_question(uuid, uuid, text, text[], int) TO anon, authenticated;
