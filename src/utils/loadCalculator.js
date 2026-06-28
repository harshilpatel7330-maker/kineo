import { supabase } from '../supabaseClient'

function dateOffsetISO(baseDate, offsetDays) {
  const d = new Date(baseDate)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

export async function computeAndPersistLoadMetrics(athleteId, sessionId, sessionDate) {
  const windowStart = dateOffsetISO(sessionDate, -27)  // 28-day window

  const { data: sessions, error } = await supabase
    .from('training_sessions')
    .select('date, duration_min, rpe, distance_km')
    .eq('athlete_id', athleteId)
    .gte('date', windowStart)
    .lte('date', sessionDate)
    .order('date', { ascending: false })

  if (error || !sessions) {
    console.error('Failed to fetch sessions for load calculation:', error)
    return null
  }

  // daily_load = sum of (duration_min * rpe) for all sessions on that date
  const dailyLoadMap = {}
  sessions.forEach(s => {
    const load = (s.duration_min ?? 0) * (s.rpe ?? 0)
    dailyLoadMap[s.date] = (dailyLoadMap[s.date] ?? 0) + load
  })

  // Acute load = avg daily_load over last 7 days (zero-fill gaps)
  let acuteSum = 0
  for (let i = 0; i < 7; i++) {
    acuteSum += dailyLoadMap[dateOffsetISO(sessionDate, -i)] ?? 0
  }
  const acuteLoad = acuteSum / 7

  // Chronic load = avg daily_load over last 28 days (zero-fill gaps)
  let chronicSum = 0
  for (let i = 0; i < 28; i++) {
    chronicSum += dailyLoadMap[dateOffsetISO(sessionDate, -i)] ?? 0
  }
  const chronicLoad = chronicSum / 28

  // ACWR: only if sessions span at least 7 days
  const uniqueDates = [...new Set(sessions.map(s => s.date))].sort()
  const spanDays = uniqueDates.length >= 2
    ? Math.round(
        (new Date(uniqueDates[uniqueDates.length - 1]) - new Date(uniqueDates[0])) /
        86400000
      ) + 1
    : 1
  const acwr = spanDays >= 7 && chronicLoad > 0
    ? Math.round((acuteLoad / chronicLoad) * 100) / 100
    : null

  // Mileage change %: last 7 days vs prior 7 days
  const recentStart = dateOffsetISO(sessionDate, -6)   // 7-day window: today-6 → today
  const priorEnd    = dateOffsetISO(sessionDate, -7)   // prior window: today-13 → today-7
  const priorStart  = dateOffsetISO(sessionDate, -13)

  const recentDistSessions = sessions.filter(
    s => s.date >= recentStart && s.date <= sessionDate && s.distance_km != null
  )
  const priorDistSessions = sessions.filter(
    s => s.date >= priorStart && s.date <= priorEnd && s.distance_km != null
  )
  const recentDist = recentDistSessions.reduce((sum, s) => sum + s.distance_km, 0)
  const priorDist  = priorDistSessions.reduce((sum, s) => sum + s.distance_km, 0)
  const mileageChangePct = priorDist > 0 && priorDistSessions.length > 0
    ? Math.round(((recentDist - priorDist) / priorDist) * 1000) / 10
    : null

  // Hard sessions this week: last 7 days with rpe >= 7
  const hardSessionsThisWeek = sessions.filter(
    s => s.date >= recentStart && s.date <= sessionDate && (s.rpe ?? 0) >= 7
  ).length

  // Back-to-back hard: today rpe >= 7 AND yesterday rpe >= 7
  const yesterday     = dateOffsetISO(sessionDate, -1)
  const todayHard     = sessions.some(s => s.date === sessionDate && (s.rpe ?? 0) >= 7)
  const yesterdayHard = sessions.some(s => s.date === yesterday   && (s.rpe ?? 0) >= 7)
  const backToBackHard = todayHard && yesterdayHard

  const { error: updateError } = await supabase
    .from('training_sessions')
    .update({
      acwr,
      mileage_change_pct:       mileageChangePct,
      hard_sessions_this_week:  hardSessionsThisWeek,
      back_to_back_hard:        backToBackHard,
    })
    .eq('id', sessionId)

  if (updateError) {
    console.error('Failed to persist derived load metrics:', updateError)
  }

  return { acwr, mileageChangePct, hardSessionsThisWeek, backToBackHard }
}

// Pure computation — no I/O. Takes already-joined sessions sorted descending
// by date, each shaped as { date, session_load, acwr, hrv_vs_baseline_pct }.
// Returns { daysHrvBelow, daysAvailable, loadFlatOrRising } or null when
// fewer than 3 sessions have a non-null hrv_vs_baseline_pct.
export function calculateHrvLoadMismatch(joinedSessions) {
  const withHrv = joinedSessions.filter(j => j.hrv_vs_baseline_pct != null)
  if (withHrv.length < 3) return null

  const daysHrvBelow = withHrv.filter(j => j.hrv_vs_baseline_pct < -5).length

  const mostRecentAcwr = joinedSessions[0]?.acwr
  let loadFlatOrRising = mostRecentAcwr != null && mostRecentAcwr >= 0.85

  if (!loadFlatOrRising) {
    const recentTwo  = joinedSessions.slice(0, 2)
    const priorThree = joinedSessions.slice(2, 5)
    if (recentTwo.length === 2 && priorThree.length >= 1) {
      const avgRecent = (recentTwo[0].session_load + recentTwo[1].session_load) / 2
      const avgPrior  = priorThree.reduce((s, d) => s + d.session_load, 0) / priorThree.length
      if (avgPrior > 0) {
        loadFlatOrRising = (avgRecent / avgPrior) >= 0.9
      }
    }
  }

  return { daysHrvBelow, daysAvailable: withHrv.length, loadFlatOrRising }
}

// Thin I/O wrapper — fetches sessions and recovery_metrics, joins in memory,
// then delegates all computation to calculateHrvLoadMismatch.
export async function computeHrvLoadMismatch(athleteId) {
  const { data: sessions } = await supabase
    .from('training_sessions')
    .select('date, duration_min, rpe, acwr')
    .eq('athlete_id', athleteId)
    .order('date', { ascending: false })
    .limit(5)

  if (!sessions || sessions.length < 3) return null

  const sessionDates = sessions.map(s => s.date)

  const { data: recovery } = await supabase
    .from('recovery_metrics')
    .select('date, hrv_vs_baseline_pct')
    .eq('athlete_id', athleteId)
    .in('date', sessionDates)

  const recoveryByDate = {}
  for (const r of (recovery ?? [])) {
    recoveryByDate[r.date] = r.hrv_vs_baseline_pct
  }

  const joined = sessions.map(s => ({
    date:                s.date,
    session_load:        (s.duration_min ?? 0) * (s.rpe ?? 0),
    acwr:                s.acwr,
    hrv_vs_baseline_pct: recoveryByDate[s.date] ?? null,
  }))

  return calculateHrvLoadMismatch(joined)
}
