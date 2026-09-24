-- Quiz: "Wer würde eher" soll doch alle Spieler inkl. sich selbst zur Auswahl anzeigen
-- (Selbstausschluss bleibt nur bei Freitext-Abstimmung bestehen).

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
    v_options, v_already;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_quiz_current_question(uuid, uuid) TO anon, authenticated;

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
