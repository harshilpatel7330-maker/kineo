import { supabase } from '../supabaseClient'

import { getAthleteId } from '../utils/athleteId'
const ATHLETE_ID = getAthleteId()

export async function calculateBaseline() {
  const { data } = await supabase
    .from('checkins')
    .select('resting_hr_bpm, hrv_ms, sleep_hours, created_at')
    .eq('athlete_id', ATHLETE_ID)
    .not('resting_hr_bpm', 'is', null)
    .order('created_at', { ascending: false })
    .limit(7)

  if (!data || data.length < 3) {
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

export async function fetchCumulativeLoad() {
  const { data } = await supabase
    .from('checkins')
    .select('fatigue, soreness, sleep_quality, created_at, sleep_hours')
    .eq('athlete_id', ATHLETE_ID)
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