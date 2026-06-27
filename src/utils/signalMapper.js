import { supabase } from '../supabaseClient'

export async function mapToSignals(athleteId, {
  sleep, stress, fatigue, soreness,
  painScore, painTrend, painAltersMovement,
  restingHrBpm, hrvMs, sleepHours,
}) {
  // Query all three tables concurrently — null data means no rows yet, not an error
  const [trainingResult, recoveryResult, baselineResult] = await Promise.all([
    supabase
      .from('training_sessions')
      .select('rpe, intensity_label, back_to_back_hard, acwr, mileage_change_pct, hard_sessions_this_week')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('recovery_metrics')
      .select('hrv_vs_baseline_pct, rhr_vs_baseline_bpm, sleep_nights_below_six')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('baselines')
      .select('days_of_data')
      .eq('athlete_id', athleteId)
      .order('calculated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const session     = trainingResult.data    // null when no sessions logged yet
  const recovery    = recoveryResult.data    // null when no recovery_metrics yet
  const baselineRow = baselineResult.data    // null when no baselines yet

  // ── Training load signals (persisted by loadCalculator at session-log time) ──
  const acwr                 = session?.acwr ?? null
  const mileageChangePct     = session?.mileage_change_pct ?? null
  const hardSessionsThisWeek = session?.hard_sessions_this_week ?? null
  const backToBackHard       = session?.back_to_back_hard ?? false
  const sessionRpe           = session?.rpe ?? null
  const rpeHighOnEasyDay     = session != null &&
    session.intensity_label === 'easy' && (session.rpe ?? 0) >= 7

  // ── Recovery signals (persisted by updateRecoveryMetrics after each check-in) ──
  const hrvVsBaselinePct  = recovery?.hrv_vs_baseline_pct ?? null
  const rhrVsBaselineBpm  = recovery?.rhr_vs_baseline_bpm ?? null
  const sleepNightsBelowSix = recovery?.sleep_nights_below_six ?? null  // null not 0

  // ── Baseline status (persisted by updateBaseline after each check-in) ────────
  const hasBaseline = (baselineRow?.days_of_data ?? 0) >= 7

  // ── Local: form-derived signals ───────────────────────────────────────────────
  const morningFatigue =
    fatigue === 5 ? 10 : fatigue === 4 ? 8 :
    fatigue === 3 ? 5  : fatigue === 2 ? 3 : 1

  const dataSource =
    (hrvMs != null || restingHrBpm != null) && hasBaseline
      ? 'wearable'
      : (hrvMs != null || restingHrBpm != null)
      ? 'wearable_no_baseline'
      : 'self_report'

  return {
    acwr,
    mileageChangePct,
    hardSessionsThisWeek,
    backToBackHard,
    sessionRpe,
    rpeHighOnEasyDay,
    hrvVsBaselinePct,
    rhrVsBaselineBpm,
    sleepNightsBelowSix,
    hasBaseline,
    morningFatigue,
    painScore:          painScore ?? 0,
    painTrend:          painTrend ?? 'stable',
    painAltersMovement: painAltersMovement ?? false,
    dataSource,
    rawHrvMs:           hrvMs,
    rawRhrBpm:          restingHrBpm,
    rawSleepHours:      sleepHours,
  }
}
