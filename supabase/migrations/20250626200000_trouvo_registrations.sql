-- Organizer contact + registration management for Trouvo

ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_phone text;

DROP POLICY IF EXISTS "Organizers update registrations" ON event_registrations;
CREATE POLICY "Organizers update registrations"
  ON event_registrations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_registrations.event_id
        AND events.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Organizers delete registrations" ON event_registrations;
CREATE POLICY "Organizers delete registrations"
  ON event_registrations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_registrations.event_id
        AND events.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Organizers manage registration answers" ON event_registration_answers;
CREATE POLICY "Organizers manage registration answers"
  ON event_registration_answers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM event_registrations r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = event_registration_answers.registration_id
        AND e.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Organizers manage bring claims" ON event_bring_claims;
CREATE POLICY "Organizers manage bring claims"
  ON event_bring_claims FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM event_registrations r
      JOIN events e ON e.id = r.event_id
      WHERE r.id = event_bring_claims.registration_id
        AND e.organizer_id = auth.uid()
    )
  );
