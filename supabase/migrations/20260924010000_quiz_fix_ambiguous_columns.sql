-- Fix: RETURNS TABLE(...) declares its output columns as PL/pgSQL variables in scope,
-- which collided with bare column references of the same name inside the function body
-- ("column reference session_id/is_correct is ambiguous"). Qualify all such references.

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

  SELECT qp.id INTO existing_id FROM public.quiz_players qp
  WHERE qp.session_id = s.id AND qp.client_token = p_client_token;

  IF existing_id IS NULL THEN
    IF q.max_players IS NOT NULL THEN
      SELECT count(*) INTO player_count FROM public.quiz_players qp WHERE qp.session_id = s.id;
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

  SELECT array_agg(o.id ORDER BY o.id) INTO correct_ids
  FROM public.quiz_question_options o WHERE o.question_id = qq.id AND o.is_correct;
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
