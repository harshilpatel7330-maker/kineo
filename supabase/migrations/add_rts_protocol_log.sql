-- Add protocol log columns to rts_checkins
-- Populated by LogProtocol.jsx after the athlete completes (or attempts) their rehab protocol

ALTER TABLE rts_checkins ADD COLUMN IF NOT EXISTS protocol_session_done boolean;
ALTER TABLE rts_checkins ADD COLUMN IF NOT EXISTS protocol_duration_min integer;
ALTER TABLE rts_checkins ADD COLUMN IF NOT EXISTS protocol_pain_during integer;
ALTER TABLE rts_checkins ADD COLUMN IF NOT EXISTS protocol_pain_after integer;
ALTER TABLE rts_checkins ADD COLUMN IF NOT EXISTS protocol_notes text;
ALTER TABLE rts_checkins ADD COLUMN IF NOT EXISTS protocol_logged_at timestamp without time zone;
