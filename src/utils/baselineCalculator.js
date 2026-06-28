import { supabase } from '../supabaseClient'

function dateOffsetISO(baseDate, offsetDays) {
  const d = new Date(baseDate)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

export async function calculateBaseline(athleteId) {
  const { data } = await supabase
    .from('checkins')
    .select('resting_hr_bpm, hrv_ms, sleep_hours, created_at')
    .eq('athlete_id', athleteId)
    .not('resting_hr_bpm', 'is', null)
    .order('created_at', { ascending: false })
    .limit(7)

  if (!data || data.length < 7) {
    return {
      hasWearableBaseline: false,
      daysOfData: data?.length ?? 0
    }
  }

  const rhrData = data.filter(d => d.resting_hr_bpm)
  const avgRhr = rhrData.reduce((sum, d) => sum + d.resting_hr_bpm, 0) / rhrData.length

  const hrvData = data.filter(d => d.hrv_ms)
  const avgHrv = hrvData.length > 0
    ? hrvData.reduce((sum, d) => sum + d.hrv_ms, 0) / hrvData.length
    : null

  const sleepData = data.filter(d => d.sleep_hours)
  const avgSleep = sleepData.length > 0
    ? sleepData.reduce((sum, d) => sum + d.sleep_hours, 0) / sleepData.length
    : null

  return {
    hasWearableBaseline: true,
    daysOfData: data.length,
    avgRhr: Math.round(avgRhr * 10) / 10,
    avgHrv: avgHrv ? Math.round(avgHrv * 10) / 10 : null,
    avgSleep: avgSleep ? Math.round(avgSleep * 10) / 10 : null,
  }
}

export async function updateBaseline(athleteId) {
  const baseline = await calculateBaseline(athleteId)

  if (!baseline.hasWearableBaseline) return baseline

  // Count distinct dates that have at least one wearable reading
  const { data: wearableDays } = await supabase
    .from('checkins')
    .select('date')
    .eq('athlete_id', athleteId)
    .or('resting_hr_bpm.not.is.null,hrv_ms.not.is.null')

  const daysOfData = new Set((wearableDays ?? []).map(d => d.date)).size

  if (daysOfData === 0) return baseline

  const { error } = await supabase.from('baselines').insert({
    athlete_id:      athleteId,
    avg_resting_hr:  baseline.avgRhr ?? null,
    avg_hrv_ms:      baseline.avgHrv ?? null,
    avg_sleep_hours: baseline.avgSleep ?? null,
    days_of_data:    daysOfData,
  })

  if (error) console.error('Failed to insert baseline row:', error)

  return { ...baseline, daysOfData }
}

// Pure function so the averaging logic is testable without a DB connection.
export function computeHrvVsBaselinePct(todayHrv, priorReadings) {
  if (todayHrv == null || !priorReadings.length) return null
  const avg = priorReadings.reduce((s, v) => s + v, 0) / priorReadings.length
  return Math.round(((todayHrv - avg) / avg) * 1000) / 10
}

export async function updateRecoveryMetrics(athleteId, { hrv_ms, resting_hr_bpm, fatigue }) {
  const today = new Date().toISOString().split('T')[0]

  // Query checkins strictly before today so today's own reading is excluded
  // from the baseline used to assess today. Self-inclusive averaging biases
  // the comparison especially when < 7 days of data exist.
  const { data: priorCheckins } = await supabase
    .from('checkins')
    .select('resting_hr_bpm, hrv_ms')
    .eq('athlete_id', athleteId)
    .lt('date', today)
    .or('resting_hr_bpm.not.is.null,hrv_ms.not.is.null')
    .order('date', { ascending: false })
    .limit(7)

  const priorHrv = (priorCheckins ?? []).filter(c => c.hrv_ms != null).map(c => c.hrv_ms)
  const priorRhr = (priorCheckins ?? []).filter(c => c.resting_hr_bpm != null).map(c => c.resting_hr_bpm)

  const avgPriorRhr = priorRhr.length > 0
    ? priorRhr.reduce((s, v) => s + v, 0) / priorRhr.length
    : null

  const hrv_vs_baseline_pct = computeHrvVsBaselinePct(hrv_ms, priorHrv)

  const rhr_vs_baseline_bpm = resting_hr_bpm != null && avgPriorRhr != null
    ? Math.round((resting_hr_bpm - avgPriorRhr) * 10) / 10
    : null

  // Count nights below 6 hrs in the last 7 days where sleep_hours was actually entered
  const sevenDaysAgo = dateOffsetISO(today, -6)
  const { data: recentCheckins } = await supabase
    .from('checkins')
    .select('sleep_hours')
    .eq('athlete_id', athleteId)
    .gte('date', sevenDaysAgo)
    .lte('date', today)

  const sleep_nights_below_six = (recentCheckins ?? [])
    .filter(c => c.sleep_hours != null && c.sleep_hours < 6).length

  const payload = {
    athlete_id:           athleteId,
    date:                 today,
    hrv_ms:               hrv_ms ?? null,
    resting_hr_bpm:       resting_hr_bpm ?? null,
    hrv_vs_baseline_pct,
    rhr_vs_baseline_bpm,
    fatigue_score:        fatigue ?? null,
    sleep_nights_below_six,
    source:               'manual',
  }

  // Upsert: update today's row if it exists, otherwise insert
  const { data: existing } = await supabase
    .from('recovery_metrics')
    .select('id')
    .eq('athlete_id', athleteId)
    .eq('date', today)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('recovery_metrics').update(payload).eq('id', existing.id)
    if (error) console.error('Failed to update recovery_metrics:', error)
  } else {
    const { error } = await supabase
      .from('recovery_metrics').insert(payload)
    if (error) console.error('Failed to insert recovery_metrics:', error)
  }
}

export async function fetchCumulativeLoad(athleteId) {
  const { data } = await supabase
    .from('checkins')
    .select('fatigue, soreness, sleep_quality, created_at, sleep_hours')
    .eq('athlete_id', athleteId)
    .order('created_at', { ascending: false })
    .limit(28)

  if (!data || data.length < 7) return { hasPattern: false }

  const week1 = data.slice(0, 7)
  const week2 = data.slice(7, 14)
  const week3 = data.slice(14, 21)

  const avgFatigue = (week) =>
    week.reduce((sum, d) => sum + (d.fatigue ?? 3), 0) / week.length

  const w1 = avgFatigue(week1)
  const w2 = avgFatigue(week2)
  const w3 = avgFatigue(week3)

  const consecutiveHighWeeks = [w1, w2, w3].filter(w => w >= 3.5).length

  return {
    hasPattern: consecutiveHighWeeks >= 3,
    consecutiveHighWeeks,
    weeklyFatigue: { week1: w1, week2: w2, week3: w3 }
  }
}