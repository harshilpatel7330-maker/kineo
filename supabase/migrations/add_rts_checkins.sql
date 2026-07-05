CREATE TABLE IF NOT EXISTS rts_checkins (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          uuid REFERENCES athletes(id),
  date                date NOT NULL DEFAULT CURRENT_DATE,
  morning_stiffness   integer,
  pain_score          integer,
  protocol_adherence  text,
  created_at          timestamp without time zone DEFAULT now()
);
