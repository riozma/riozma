-- Quiz: Mehrfach-Richtig (jede als richtig markierte Option zählt), Modus-Erklärung vor neuen Fragearten,
-- Autorname bei Spielerfragen, stabile Reihenfolge bei gleichem sort_order.

ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS explain_modes boolean NOT NULL DEFAULT false;

ALTER TABLE public.quiz_sessions DROP CONSTRAINT IF EXISTS quiz_sessions_status_check;
ALTER TABLE public.quiz_sessions ADD CONSTRAINT quiz_sessions_status_check
  CHECK (status IN ('lobby', 'explain', 'collect', 'question', 'reveal', 'leaderboard', 'ended'));

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
    new_def := replace(def, 'ORDER BY sort_order OFFSET', 'ORDER BY sort_order, created_at OFFSET');
    IF r.proname = 'submit_quiz_answer' THEN
      new_def := replace(new_def,
        'correct := (correct_ids IS NOT NULL AND submitted_ids IS NOT NULL AND correct_ids = submitted_ids);',
        'correct := (correct_ids IS NOT NULL AND submitted_ids IS NOT NULL AND submitted_ids <@ correct_ids);');
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
  question_id uuid, question_text text, image_path text, answer_mode text, question_type text,
  time_limit_sec int, question_started_at timestamptz, answer_started_at timestamptz,
  no_projector_mode boolean, options jsonb, already_answered boolean, is_own_question boolean,
  author_name text
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE
  s public.quiz_sessions%ROWTYPE;
  qz public.quizzes%ROWTYPE;
  qq public.quiz_questions%ROWTYPE;
  p_id uuid;
  v_options jsonb;
  v_already boolean;
  v_author text;
BEGIN
  SELECT * INTO s FROM public.quiz_sessions WHERE id = p_session_id;
  IF NOT FOUND OR s.current_question_index < 0 THEN RETURN; END IF;
  SELECT * INTO qz FROM public.quizzes WHERE id = s.quiz_id;
  SELECT * INTO qq FROM public.quiz_questions
  WHERE quiz_id = s.quiz_id AND (public.quiz_questions.session_id IS NULL OR public.quiz_questions.session_id = s.id)
  ORDER BY sort_order, created_at OFFSET s.current_question_index LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT qp.id INTO p_id FROM public.quiz_players qp WHERE qp.session_id = p_session_id AND qp.client_token = p_client_token;
  SELECT qp.name INTO v_author FROM public.quiz_players qp WHERE qp.id = qq.author_player_id;

  IF qq.question_type = 'vote_player' THEN
    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'sort_order', o.rn - 1, 'option_text', o.name)) INTO v_options
    FROM (SELECT qp.id, qp.name, row_number() OVER (ORDER BY qp.joined_at) AS rn
          FROM public.quiz_players qp WHERE qp.session_id = p_session_id) o;
    v_already := p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.quiz_player_votes v WHERE v.question_id = qq.id AND v.voter_player_id = p_id);
  ELSIF qq.question_type = 'open_text' THEN
    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'sort_order', o.rn - 1, 'option_text', o.answer_text)) INTO v_options
    FROM (SELECT a.id, a.answer_text, row_number() OVER (ORDER BY random()) AS rn
          FROM public.quiz_open_text_answers a WHERE a.question_id = qq.id AND (p_id IS NULL OR a.player_id <> p_id)) o;
    v_already := p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.quiz_open_text_votes v WHERE v.question_id = qq.id AND v.voter_player_id = p_id);
  ELSE
    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'sort_order', o.sort_order, 'option_text', o.option_text) ORDER BY o.sort_order) INTO v_options
    FROM public.quiz_question_options o WHERE o.question_id = qq.id;
    v_already := p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.quiz_answers a WHERE a.question_id = qq.id AND a.player_id = p_id);
  END IF;

  RETURN QUERY SELECT qq.id, qq.question_text, qq.image_path, qq.answer_mode, qq.question_type,
    qq.time_limit_sec, s.question_started_at, s.answer_started_at, qz.no_projector_mode,
    v_options, v_already,
    (p_id IS NOT NULL AND qq.author_player_id IS NOT NULL AND qq.author_player_id = p_id),
    v_author;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_current_question(uuid, uuid) TO anon, authenticated;
