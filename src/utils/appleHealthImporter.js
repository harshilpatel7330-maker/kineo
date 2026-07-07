import { supabase } from '../supabaseClient'
import { computeAndPersistLoadMetrics } from './loadCalculator'
import { backfillRecoveryMetrics, updateBaseline } from './baselineCalculator'

const BATCH_SIZE = 30   // days per insert batch

// Stats accumulator
function makeStats() {
  return { daysImported: 0, daysMerged: 0, daysSkipped: 0, workoutsImported: 0, workoutsSkipped: 0 }
}

// Returns the ISO date string for N days ago from today
function nDaysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Sleep between batch writes to avoid Supabase rate limits
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

export async function importAppleHealthData(athleteId, parsed, { onProgress } = {}) {
  const { hrv, rhr, sleep: sleepData, respRate, workouts } = parsed
  const stats = makeStats()

  // ── 0. Ensure athlete row exists (prevents FK failures on recovery_metrics) ─
  const { data: existingAthlete } = await supabase
    .from('athletes')
    .select('id')
    .eq('id', athleteId)
    .maybeSingle()

  if (!existingAthlete) {
    await supabase.from('athletes').insert({
      id:    athleteId,
      email: athleteId + '@kineo.local',
    })
  }

  // ── 1. Fetch existing checkins ────────────────────────────────────────────
  const { data: existingCheckins } = await supabase
    .from('checkins')
    .select('date, hrv_ms, resting_hr_bpm')
    .eq('athlete_id', athleteId)

  const existingByDate = {}
  for (const row of (existingCheckins ?? [])) {
    existingByDate[row.date] = row
  }

  // ── 2. Build list of all dates to process ────────────────────────────────
  const allDates = new Set([
    ...Object.keys(hrv),
    ...Object.keys(rhr),
    ...Object.keys(sleepData),
    ...Object.keys(respRate),
  ])
  const sortedDates = [...allDates].sort()

  // ── 3. Process checkins in batches ────────────────────────────────────────
  const batches = []
  for (let i = 0; i < sortedDates.length; i += BATCH_SIZE) {
    batches.push(sortedDates.slice(i, i + BATCH_SIZE))
  }

  const totalBatches = batches.length
  for (let bi = 0; bi < batches.length; bi++) {
    const batch = batches[bi]

    const toInsert = []
    const toUpdate = []

    for (const date of batch) {
      const existing = existingByDate[date]
      const hasCompleteWearable = existing?.hrv_ms != null && existing?.resting_hr_bpm != null

      if (!existing) {
        // New row — insert with imported data
        toInsert.push({
          athlete_id:     athleteId,
          date,
          hrv_ms:         hrv[date] ?? null,
          resting_hr_bpm: rhr[date] ?? null,
          sleep_hours:    sleepData[date] ?? null,
          has_pain:       false,
          source:         'apple_health',
        })
        stats.daysImported++
      } else if (hasCompleteWearable) {
        // Already has complete wearable data — skip (manual data wins)
        stats.daysSkipped++
      } else {
        // Partial row (has manual check-in but no wearable) — fill in HRV/RHR
        const updates = {}
        if (existing.hrv_ms == null && hrv[date] != null)         updates.hrv_ms = hrv[date]
        if (existing.resting_hr_bpm == null && rhr[date] != null) updates.resting_hr_bpm = rhr[date]
        if (sleepData[date] != null)                              updates.sleep_hours = sleepData[date]
        if (Object.keys(updates).length > 0) {
          toUpdate.push({ date, updates })
          stats.daysMerged++
        } else {
          stats.daysSkipped++
        }
      }
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('checkins').upsert(toInsert, { onConflict: 'athlete_id,date' })
      if (error) console.error('Checkin batch insert error:', error)
    }

    for (const { date, updates } of toUpdate) {
      const { error } = await supabase.from('checkins')
        .update(updates).eq('athlete_id', athleteId).eq('date', date)
      if (error) console.error('Checkin update error:', error)
    }

    // Insert respiratory rate into recovery_metrics
    const respInserts = batch
      .filter(d => respRate[d] != null)
      .map(d => ({
        athlete_id:       athleteId,
        date:             d,
        respiratory_rate: respRate[d],
        hrv_ms:           hrv[d] ?? null,
        resting_hr_bpm:   rhr[d] ?? null,
        source:           'apple_health',
      }))

    if (respInserts.length > 0) {
      // Use upsert to avoid conflicts with any existing rows
      await supabase.from('recovery_metrics').upsert(respInserts, {
        onConflict: 'athlete_id,date',
        ignoreDuplicates: false,
      })
    }

    const pct = 50 + Math.round(((bi + 1) / totalBatches) * 35)
    if (onProgress) onProgress({ phase: 'importing', pct, detail: `${bi + 1}/${totalBatches} batches` })

    if (bi < batches.length - 1) await sleep(200)
  }

  // ── 4. Import workouts ────────────────────────────────────────────────────
  if (workouts.length > 0) {
    const { data: existingWorkouts } = await supabase
      .from('training_sessions')
      .select('date, workout_type')
      .eq('athlete_id', athleteId)
      .eq('source', 'apple_health')

    const existingWorkoutKeys = new Set(
      (existingWorkouts ?? []).map(w => `${w.date}:${w.workout_type}`)
    )

    const workoutBatches = []
    for (let i = 0; i < workouts.length; i += BATCH_SIZE) {
      workoutBatches.push(workouts.slice(i, i + BATCH_SIZE))
    }

    for (let bi = 0; bi < workoutBatches.length; bi++) {
      const batch = workoutBatches[bi]
      const toInsert = batch.filter(w => !existingWorkoutKeys.has(`${w.date}:${w.workout_type}`))

      if (toInsert.length > 0) {
        const inserts = toInsert.map(w => ({
          athlete_id:      athleteId,
          date:            w.date,
          workout_type:    w.workout_type,
          duration_min:    w.duration_min,
          rpe:             w.rpe,
          rpe_source:      w.rpe_source ?? null,
          intensity_label: w.intensity_label,
          source:          w.source,
        }))

        const { data: inserted, error } = await supabase
          .from('training_sessions')
          .upsert(inserts, { onConflict: 'athlete_id,date,workout_type' })
          .select('id, date')

        if (error) {
          console.error('Workout batch insert error:', error)
        } else if (inserted) {
          stats.workoutsImported += inserted.length
          // Compute load metrics for each inserted session
          for (const row of inserted) {
            await computeAndPersistLoadMetrics(athleteId, row.id, row.date)
          }
        }
      }
      stats.workoutsSkipped += batch.length - toInsert.length

      const pct = 85 + Math.round(((bi + 1) / workoutBatches.length) * 10)
      if (onProgress) onProgress({ phase: 'workouts', pct, detail: `${bi + 1}/${workoutBatches.length} workout batches` })

      if (bi < workoutBatches.length - 1) await sleep(200)
    }
  }

  // ── 5. Recompute baseline from all imported data ───────────────────────────
  if (onProgress) onProgress({ phase: 'baseline', pct: 95 })
  await updateBaseline(athleteId)

  // ── 6. Backfill recovery_metrics vs-baseline values ───────────────────────
  if (onProgress) onProgress({ phase: 'backfill', pct: 97 })
  await backfillRecoveryMetrics(athleteId)
  if (onProgress) onProgress({ phase: 'done', pct: 100 })

  // ── 6. Build summary ──────────────────────────────────────────────────────
  const datesWithHrv = Object.keys(hrv)
  const dateRange = datesWithHrv.length >= 2
    ? `${datesWithHrv[0]} – ${datesWithHrv[datesWithHrv.length - 1]}`
    : datesWithHrv[0] ?? null

  const recentHrvDrop = detectHrvDip(hrv)

  return {
    stats,
    dateRange,
    daysOfHrv:     datesWithHrv.length,
    daysOfSleep:   Object.keys(sleepData).length,
    recentHrvDrop,
  }
}

// Detect a significant HRV dip in the last 14 days of imported data.
// Returns true if the most recent 3-day avg is 65%+ below the prior 11-day avg.
function detectHrvDip(hrv) {
  const dates = Object.keys(hrv).sort().slice(-14)
  if (dates.length < 7) return false

  const recent = dates.slice(-3).map(d => hrv[d])
  const prior  = dates.slice(0, -3).map(d => hrv[d])
  if (!recent.length || !prior.length) return false

  const avgRecent = recent.reduce((s, v) => s + v, 0) / recent.length
  const avgPrior  = prior.reduce((s, v)  => s + v, 0) / prior.length
  if (avgPrior === 0) return false

  const dropPct = ((avgPrior - avgRecent) / avgPrior) * 100
  return dropPct >= 30
}
