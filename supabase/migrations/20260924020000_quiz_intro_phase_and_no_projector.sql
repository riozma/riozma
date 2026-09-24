-- Quiz: Frage-Intro-Phase (Frage erst lesen, dann erst Antworten auswählbar)
-- und "ohne Beamer spielen"-Modus (Fragen/Antworten auch auf dem Handy sichtbar).

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS no_projector_mode boolean NOT NULL DEFAULT false;

ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS answer_started_at timestamptz;

CREATE OR REPLACE FUNCTION public.get_quiz_current_question(p_session_id uuid, p_client_token uuid)
RETURNS TABLE(
  question_id uuid,
  question_text text,
  image_path text,
  answer_mode text,
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

  RETURN QUERY SELECT
    qq.id,
    qq.question_text,
    qq.image_path,
    qq.answer_mode,
    qq.time_limit_sec,
    s.question_started_at,
    s.answer_started_at,
    qz.no_projector_mode,
    (
      SELECT jsonb_agg(jsonb_build_object('id', o.id, 'sort_order', o.sort_order, 'option_text', o.option_text) ORDER BY o.sort_order)
      FROM public.quiz_question_options o WHERE o.question_id = qq.id
    ),
    (p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.quiz_answers a WHERE a.question_id = qq.id AND a.player_id = p_id));
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_current_question(uuid, uuid) TO anon, authenticated;

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

  IF EXISTS (SELECT 1 FROM public.quiz_answers WHERE question_id = qq.id AND player_id = ply.id) THEN
    RAISE EXCEPTION 'Antwort wurde bereits abgegeben.';
  END IF;

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

  INSERT INTO public.quiz_answers (session_id, question_id, player_id, option_ids, is_correct, points_awarded)
  VALUES (p_session_id, qq.id, ply.id, COALESCE(p_option_ids, '{}'), correct, pts);

  UPDATE public.quiz_players SET score = score + pts WHERE id = ply.id;

  RETURN QUERY SELECT correct, pts;
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_quiz_answer(uuid, uuid, uuid[]) TO anon, authenticated;
