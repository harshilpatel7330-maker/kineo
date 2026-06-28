import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { getAthleteId } from '../utils/athleteId'
import { computeAndPersistLoadMetrics } from '../utils/loadCalculator'

// ─── Seed constants ───────────────────────────────────────────────────────────

const CHECKIN_SEED = [
  { daysAgo: 8, sleep_quality: 4, stress: 2, fatigue: 2, soreness: 2, resting_hr_bpm: 58, hrv_ms: 63, sleep_hours: 7.5 },
  { daysAgo: 7, sleep_quality: 4, stress: 2, fatigue: 3, soreness: 2, resting_hr_bpm: 57, hrv_ms: 66, sleep_hours: 7.2 },
  { daysAgo: 6, sleep_quality: 3, stress: 3, fatigue: 3, soreness: 3, resting_hr_bpm: 59, hrv_ms: 61, sleep_hours: 7.0 },
  { daysAgo: 5, sleep_quality: 4, stress: 2, fatigue: 2, soreness: 3, resting_hr_bpm: 58, hrv_ms: 64, sleep_hours: 7.4 },
  { daysAgo: 4, sleep_quality: 4, stress: 2, fatigue: 2, soreness: 2, resting_hr_bpm: 57, hrv_ms: 68, sleep_hours: 7.6 },
  { daysAgo: 3, sleep_quality: 4, stress: 2, fatigue: 2, soreness: 2, resting_hr_bpm: 56, hrv_ms: 70, sleep_hours: 7.5 },
  { daysAgo: 2, sleep_quality: 5, stress: 1, fatigue: 2, soreness: 2, resting_hr_bpm: 55, hrv_ms: 72, sleep_hours: 8.0 },
  { daysAgo: 1, sleep_quality: 4, stress: 2, fatigue: 2, soreness: 2, resting_hr_bpm: 56, hrv_ms: 69, sleep_hours: 7.7 },
]

// Decisions derived from the actual seeded values, not hardcoded uniformly.
// sleep_quality=3+stress=3+fatigue=3+soreness=3 → MAINTAIN, otherwise PUSH when all ≤2/≥4.
// Day -1 is MAINTAIN: day after a Hard/rpe-8 session — ease back.
const REC_SEED = [
  { daysAgo: 8, decision: 'PUSH',     confidence: 'HIGH',   reason: 'All signals green — good day to train hard.' },
  { daysAgo: 7, decision: 'MAINTAIN', confidence: 'MEDIUM', reason: 'Slightly elevated fatigue — stick to plan, no extra load.' },
  { daysAgo: 6, decision: 'MAINTAIN', confidence: 'MEDIUM', reason: 'Sleep and stress below par — execute planned session conservatively.' },
  { daysAgo: 5, decision: 'MAINTAIN', confidence: 'MEDIUM', reason: 'Residual soreness — keep effort controlled.' },
  { daysAgo: 4, decision: 'PUSH',     confidence: 'HIGH',   reason: 'All signals green — good day to train hard.' },
  { daysAgo: 3, decision: 'PUSH',     confidence: 'HIGH',   reason: 'All signals green — good day to train hard.' },
  { daysAgo: 2, decision: 'PUSH',     confidence: 'HIGH',   reason: 'Outstanding sleep and low stress — ideal training day.' },
  { daysAgo: 1, decision: 'MAINTAIN', confidence: 'MEDIUM', reason: 'Day after hard session — ease back in before next load block.' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateStr(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().split('T')[0]
}

// UTC noon so the calendar date is unambiguous regardless of timezone.
function isoNoon(daysAgo) {
  return `${dateStr(daysAgo)}T12:00:00.000Z`
}

function buildSessionRows() {
  const rows = []
  // Block 1 — days -28 to -15 (14 sessions): Easy, fills chronic window
  for (let ago = 28; ago >= 15; ago--) {
    rows.push({ daysAgo: ago, workout_type: 'run', intensity_label: 'easy',     duration_min: 40, rpe: 5, distance_km: 5 })
  }
  // Block 2 — days -14 to -2 (13 sessions): Moderate build
  for (let ago = 14; ago >= 2; ago--) {
    rows.push({ daysAgo: ago, workout_type: 'run', intensity_label: 'moderate', duration_min: 45, rpe: 6, distance_km: 6 })
  }
  // Yesterday — Hard (triggers back_to_back_hard when user logs Hard today)
  rows.push({ daysAgo: 1, workout_type: 'run', intensity_label: 'hard', duration_min: 50, rpe: 8, distance_km: 8 })
  return rows
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SeedData() {
  const [log, setLog]       = useState([])
  const [running, setRunning] = useState(false)
  const [done, setDone]     = useState(false)

  function append(msg) {
    setLog(prev => [...prev, msg])
  }

  async function runSeed() {
    const athleteId = getAthleteId()
    setRunning(true)
    setLog([`Athlete ID: ${athleteId}`, 'Starting seed…\n'])

    // 1. Ensure athlete row exists
    const { error: aeErr } = await supabase
      .from('athletes')
      .upsert({ id: athleteId, email: `${athleteId}@kineo.local` }, { onConflict: 'id' })
    if (aeErr) { append(`ERROR athlete upsert: ${aeErr.message}`); setRunning(false); return }
    append('✓ Athlete row ensured')

    // 2. Insert 8 checkins
    append('\nInserting 8 checkins…')
    for (const row of CHECKIN_SEED) {
      const { error } = await supabase.from('checkins').insert({
        athlete_id:     athleteId,
        date:           dateStr(row.daysAgo),
        created_at:     isoNoon(row.daysAgo),
        sleep_quality:  row.sleep_quality,
        stress:         row.stress,
        fatigue:        row.fatigue,
        soreness:       row.soreness,
        has_pain:       false,
        resting_hr_bpm: row.resting_hr_bpm,
        hrv_ms:         row.hrv_ms,
        sleep_hours:    row.sleep_hours,
      })
      append(error
        ? `  WARN ${dateStr(row.daysAgo)}: ${error.message}`
        : `  ✓ ${dateStr(row.daysAgo)}  HRV=${row.hrv_ms} ms  RHR=${row.resting_hr_bpm} bpm`
      )
    }

    // 3. Insert 8 recommendation_outputs (chart / history preview)
    append('\nInserting 8 recommendation_outputs…')
    for (let i = 0; i < CHECKIN_SEED.length; i++) {
      const c = CHECKIN_SEED[i]
      const r = REC_SEED[i]
      const { error } = await supabase.from('recommendation_outputs').insert({
        athlete_id:   athleteId,
        created_at:   isoNoon(c.daysAgo),
        decision:     r.decision,
        confidence:   r.confidence,
        reasons:      [r.reason],
        action:       'Proceed as planned.',
        watch_for:    'Continue logging daily.',
        // signals_used.checkin shape must match what Dashboard.jsx and History.jsx read:
        // { sleep, stress, fatigue, soreness } — note sleep_quality → sleep
        signals_used: {
          checkin: {
            sleep:    c.sleep_quality,
            stress:   c.stress,
            fatigue:  c.fatigue,
            soreness: c.soreness,
          },
        },
        rules_fired: [],
      })
      append(error
        ? `  WARN ${dateStr(c.daysAgo)}: ${error.message}`
        : `  ✓ ${dateStr(c.daysAgo)}  ${r.decision}`
      )
    }

    // 4. Insert 28 training sessions (bulk)
    append('\nInserting 28 training sessions…')
    const SESSION_ROWS = buildSessionRows()
    const sessionInserts = SESSION_ROWS.map(s => ({
      athlete_id:      athleteId,
      date:            dateStr(s.daysAgo),
      workout_type:    s.workout_type,
      intensity_label: s.intensity_label,
      duration_min:    s.duration_min,
      rpe:             s.rpe,
      distance_km:     s.distance_km,
      source:          'seed',
    }))

    const { data: inserted, error: sessErr } = await supabase
      .from('training_sessions')
      .insert(sessionInserts)
      .select()

    if (sessErr) {
      append(`ERROR sessions: ${sessErr.message}`)
      setRunning(false)
      return
    }
    append(`  ✓ ${inserted.length} sessions inserted (${dateStr(28)} → ${dateStr(1)})`)

    // 5. Compute load metrics for every session, oldest → newest
    append('\nComputing load metrics (oldest → newest)…')
    const sorted = [...inserted].sort((a, b) => a.date.localeCompare(b.date))
    for (const s of sorted) {
      await computeAndPersistLoadMetrics(athleteId, s.id, s.date)
      append(`  ✓ ${s.date}`)
    }

    // 6. Confirmation queries
    append('\n━━━ CONFIRMATION ━━━')

    const { data: latest } = await supabase
      .from('training_sessions')
      .select('date, intensity_label, rpe, acwr, mileage_change_pct, hard_sessions_this_week, back_to_back_hard')
      .eq('athlete_id', athleteId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latest) {
      append('\nMost recent training session:')
      append(`  date:               ${latest.date}`)
      append(`  intensity / rpe:    ${latest.intensity_label} / ${latest.rpe}`)
      append(`  acwr:               ${latest.acwr ?? 'null'}`)
      append(`  mileage_change_pct: ${latest.mileage_change_pct ?? 'null'}%`)
      append(`  hard_sessions_week: ${latest.hard_sessions_this_week ?? 'null'}`)
      append(`  back_to_back_hard:  ${latest.back_to_back_hard ?? 'null'}`)
    }

    const { data: recRows } = await supabase
      .from('recommendation_outputs')
      .select('created_at, decision, signals_used')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: true })

    append(`\nrecommendation_outputs — ${recRows?.length ?? 0} rows:`)
    append('  date         decision  sleep stress fatigue soreness')
    for (const row of (recRows ?? [])) {
      const d = row.created_at?.split('T')[0] ?? '?'
      const c = row.signals_used?.checkin
      if (c) {
        append(
          `  ${d}  ${row.decision.padEnd(9)} sl=${c.sleep} st=${c.stress} fa=${c.fatigue} so=${c.soreness}`
        )
      } else {
        append(`  ${d}  ${row.decision}  (no checkin key in signals_used)`)
      }
    }

    const { count: checkinCount } = await supabase
      .from('checkins')
      .select('id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)

    append(`\ncheckins total:              ${checkinCount} rows`)
    append('baselines:                   will populate after first real check-in')
    append('recovery_metrics:            will populate after first real check-in')
    append('\n✓ Seeding complete.')

    setDone(true)
    setRunning(false)
  }

  return (
    <div style={{ padding: '24px 20px', fontFamily: 'monospace', maxWidth: 720, margin: '0 auto' }}>
      <h2 style={{ margin: '0 0 4px', fontFamily: 'inherit' }}>Seed Test Data</h2>
      <p style={{ color: '#888', fontSize: 13, margin: '0 0 20px' }}>
        Dev-only — remove the /seed route from App.jsx before shipping.
      </p>

      <div style={{
        background: '#111', border: '1px solid #222', borderRadius: 8,
        padding: 16, marginBottom: 20, fontSize: 13, lineHeight: 2,
      }}>
        <div><strong>Checkins (8):</strong>&nbsp; {dateStr(8)} → {dateStr(1)}, HRV + RHR on every row</div>
        <div><strong>Rec outputs (8):</strong>&nbsp; same dates, varied PUSH/MAINTAIN for chart preview</div>
        <div>
          <strong>Sessions (28):</strong>&nbsp; {dateStr(28)} → {dateStr(1)}<br />
          &nbsp;&nbsp;Easy × 14 ({dateStr(28)} → {dateStr(15)})<br />
          &nbsp;&nbsp;Moderate × 13 ({dateStr(14)} → {dateStr(2)})<br />
          &nbsp;&nbsp;Hard × 1 (yesterday {dateStr(1)}, rpe 8)
        </div>
        <div><strong>Expected ACWR yesterday:</strong>&nbsp; ≈ 1.20 (healthy range)</div>
        <div style={{ color: '#f59e0b', marginTop: 4 }}>
          Note: 6 of 8 rec outputs fall within the dashboard 7-day window. The two oldest (days −8/−7) are outside it — that's correct.
        </div>
      </div>

      {!done && (
        <button
          onClick={runSeed}
          disabled={running}
          style={{
            background: running ? '#333' : '#2563eb',
            color: running ? '#888' : '#fff',
            border: 'none', borderRadius: 8,
            padding: '12px 28px', fontSize: 14, fontFamily: 'monospace',
            cursor: running ? 'default' : 'pointer',
            marginBottom: 16,
          }}
        >
          {running ? 'Seeding…' : 'Run Seed'}
        </button>
      )}

      {log.length > 0 && (
        <pre style={{
          background: '#0a0a0a', border: '1px solid #1f1f1f',
          borderRadius: 8, padding: 16, fontSize: 12,
          lineHeight: 1.75, overflowX: 'auto', whiteSpace: 'pre-wrap',
          maxHeight: 640, overflowY: 'auto', margin: 0,
        }}>
          {log.join('\n')}
        </pre>
      )}
    </div>
  )
}
