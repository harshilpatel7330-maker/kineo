ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS rpe_source text;
