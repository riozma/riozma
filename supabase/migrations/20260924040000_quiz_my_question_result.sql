-- Quiz: einheitliche Rückmeldung ("richtig/Punkte") für den Spieler nach dem Reveal,
-- auch für Fragetypen deren Wertung erst nachträglich beim Reveal berechnet wird
-- (Mehrheitsfrage, "Wer würde eher", Freitext) statt sofort bei der Abgabe.

CREATE OR REPLACE FUNCTION public.get_my_question_result(p_session_id uuid, p_client_token uuid, p_question_id uuid)
RETURNS TABLE(answered boolean, is_correct boolean, points_awarded int)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  ply_id uuid;
  qtype text;
BEGIN
  SELECT qp.id INTO ply_id FROM public.quiz_players qp WHERE qp.session_id = p_session_id AND qp.client_token = p_client_token;
  SELECT qq.question_type INTO qtype FROM public.quiz_questions qq WHERE qq.id = p_question_id;

  IF ply_id IS NULL THEN
    RETURN QUERY SELECT false, false, 0;
    RETURN;
  END IF;

  IF qtype = 'vote_player' THEN
    RETURN QUERY
      SELECT (v.id IS NOT NULL), COALESCE(v.points_awarded, 0) > 0, COALESCE(v.points_awarded, 0)
      FROM (SELECT 1) x
      LEFT JOIN public.quiz_player_votes v ON v.question_id = p_question_id AND v.voter_player_id = ply_id;
  ELSIF qtype = 'open_text' THEN
    RETURN QUERY
      SELECT (a.id IS NOT NULL), COALESCE(a.votes_received, 0) > 0, COALESCE(a.points_awarded, 0)
      FROM (SELECT 1) x
      LEFT JOIN public.quiz_open_text_answers a ON a.question_id = p_question_id AND a.player_id = ply_id;
  ELSE
    RETURN QUERY
      SELECT (ans.id IS NOT NULL), COALESCE(ans.is_correct, false), COALESCE(ans.points_awarded, 0)
      FROM (SELECT 1) x
      LEFT JOIN public.quiz_answers ans ON ans.question_id = p_question_id AND ans.player_id = ply_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_question_result(uuid, uuid, uuid) TO anon, authenticated;
