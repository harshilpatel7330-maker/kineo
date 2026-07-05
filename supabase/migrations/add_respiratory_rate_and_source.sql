-- Run in Supabase SQL editor before deploying the Apple Health import feature.

-- 1. Track the data source for check-ins (manual vs apple_health)
ALTER TABLE checkins
  ADD COLUMN IF NOT EXISTS source text;

-- 2. Respiratory rate from Apple Watch sleep tracking (breaths/min)
ALTER TABLE recovery_metrics
  ADD COLUMN IF NOT EXISTS respiratory_rate numeric;

-- 3. Rolling 28-day average respiratory rate in baseline
ALTER TABLE baselines
  ADD COLUMN IF NOT EXISTS avg_respiratory_rate numeric;
