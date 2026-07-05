import { supabase } from '../supabaseClient'
import { computedPainTrend } from './painTrendCalculator'

// Pure evaluation — no Supabase dependency, fully testable.
// rtsRows: { pain_score, morning_stiffness }[] ordered descending by date, limit 7
// painLogs: { pain_score, date }[] ordered descending by date
export function evaluateGraduationCriteria(rtsRows, painLogs) {
  if (!rtsRows || rtsRows.length < 7) {
    return {
      graduated: false,
      reason: `Only ${rtsRows?.length ?? 0} days logged — need 7 consecutive check-in days`,
    }
  }

  const allPainLow = rtsRows.every(r => r.pain_score <= 1)
  if (!allPainLow) {
    const worst = Math.max(...rtsRows.map(r => r.pain_score))
    return {
      graduated: false,
      reason: `Pain score reached ${worst} in last 7 days — must be ≤1 every day`,
    }
  }

  const allStiffnessLow = rtsRows.every(r => r.morning_stiffness <= 2)
  if (!allStiffnessLow) {
    const worst = Math.max(...rtsRows.map(r => r.morning_stiffness))
    return {
      graduated: false,
      reason: `Morning stiffness reached ${worst} in last 7 days — must be ≤2 every day`,
    }
  }

  const trend = computedPainTrend(painLogs ?? [])
  if (trend === 'worsening') {
    return {
      graduated: false,
      reason: 'Pain trend is currently worsening — continue recovery protocol',
    }
  }

  return { graduated: true, reason: 'All graduation criteria met' }
}

// I/O wrapper — queries Supabase and delegates to the pure function.
export async function checkGraduationCriteria(athleteId) {
  const [rtsResult, painResult] = await Promise.all([
    supabase
      .from('rts_checkins')
      .select('pain_score, morning_stiffness, date')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: false })
      .limit(7),
    supabase
      .from('pain_logs')
      .select('pain_score, date')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: false })
      .limit(14),
  ])

  return evaluateGraduationCriteria(rtsResult.data, painResult.data)
}
