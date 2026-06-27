import { supabase } from './supabaseClient'
import { getAthleteId } from './utils/athleteId'

const ATHLETE_ID = getAthleteId()

const DAYS = [
  { daysAgo: 7, sleep: 4, stress: 2, fatigue: 2, soreness: 2, resting_hr_bpm: 56, hrv_ms: 62, sleep_hours: 7.5, decision: 'PUSH' },
  { daysAgo: 6, sleep: 4, stress: 2, fatigue: 2, soreness: 2, resting_hr_bpm: 55, hrv_ms: 64, sleep_hours: 7.8, decision: 'PUSH' },
  { daysAgo: 5, sleep: 3, stress: 3, fatigue: 3, soreness: 3, resting_hr_bpm: 57, hrv_ms: 60, sleep_hours: 7.0, decision: 'MAINTAIN' },
  { daysAgo: 4, sleep: 3, stress: 3, fatigue: 4, soreness: 3, resting_hr_bpm: 59, hrv_ms: 55, sleep_hours: 6.5, decision: 'MAINTAIN' },
  { daysAgo: 3, sleep: 2, stress: 4, fatigue: 4, soreness: 4, resting_hr_bpm: 61, hrv_ms: 50, sleep_hours: 6.0, decision: 'MODIFY' },
  { daysAgo: 2, sleep: 3, stress: 3, fatigue: 3, soreness: 3, resting_hr_bpm: 58, hrv_ms: 58, sleep_hours: 7.0, decision: 'MAINTAIN' },
  { daysAgo: 1, sleep: 4, stress: 2, fatigue: 2, soreness: 2, resting_hr_bpm: 56, hrv_ms: 63, sleep_hours: 7.6, decision: 'PUSH' },
]

async function seed() {
  const { error: athleteError } = await supabase
    .from('athletes')
    .upsert(
      { id: ATHLETE_ID, email: `test-${ATHLETE_ID}@kineo.local` },
      { onConflict: 'id' }
    )

  if (athleteError) {
    console.error('Failed to create athlete row:', athleteError)
    return
  }
  console.log('Athlete row ensured for', ATHLETE_ID)

  for (const day of DAYS) {
    const date = new Date()
    date.setDate(date.getDate() - day.daysAgo)

    const checkin = {
      sleep: day.sleep,
      stress: day.stress,
      fatigue: day.fatigue,
      soreness: day.soreness,
    }

    const { error } = await supabase.from('recommendation_outputs').insert({
      athlete_id: ATHLETE_ID,
      decision:   day.decision,
      confidence: 'MEDIUM',
      reasons:    ['Seeded test data for dashboard preview'],
      action:     'Proceed as planned.',
      watch_for:  'N/A — test data',
      signals_used: {
        checkin,
        restingHrBpm: day.resting_hr_bpm,
        hrvMs:        day.hrv_ms,
        sleepHours:   day.sleep_hours,
        dataSource:   'wearable',
      },
      rules_fired: [],
      created_at:  date.toISOString(),
    })

    if (error) {
      console.error(`Failed to insert day -${day.daysAgo}:`, error)
    } else {
      console.log(`Inserted recommendation for ${day.daysAgo} days ago`)
    }
  }
  console.log('Done seeding 7 days of test data.')
}

seed()
