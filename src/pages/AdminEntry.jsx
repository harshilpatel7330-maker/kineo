import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { updateBaseline, updateRecoveryMetrics } from '../utils/baselineCalculator'
import { computeAndPersistLoadMetrics } from '../utils/loadCalculator'
import { mapToSignals } from '../utils/signalMapper'
import { evaluate } from '../athleteiq-engine'

const STORAGE_KEY = 'kineo_admin_known_testers'

const WORKOUT_TYPES = [
  { value: 'none',           label: 'Rest / None' },
  { value: 'run',            label: 'Run' },
  { value: 'bike',           label: 'Bike' },
  { value: 'swim',           label: 'Swim' },
  { value: 'strength',       label: 'Strength' },
  { value: 'cross-training', label: 'Cross-training' },
]

const RPE_LABEL = [
  '', 'Very Easy', 'Easy', 'Light', 'Moderate',
  'Somewhat Hard', 'Hard', 'Hard', 'Very Hard', 'Very Hard', 'Max Effort',
]

const DECISION_COLOR = {
  PUSH:     '#4ade80',
  MAINTAIN: '#60a5fa',
  MODIFY:   '#fbbf24',
  RECOVER:  '#f87171',
}

function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function todayLocal() { return localDateStr(new Date()) }

function intensityFromRpe(rpe) {
  if (rpe <= 4) return 'easy'
  if (rpe <= 7) return 'moderate'
  return 'hard'
}

function pctToRpeLabel(pct) {
  if (pct < 60) return '~3'
  if (pct < 70) return '~4–5'
  if (pct < 80) return '~6–7'
  if (pct < 90) return '~8'
  return '~9–10'
}

function pctToRpeValue(pct) {
  if (pct < 60) return 3
  if (pct < 70) return 4
  if (pct < 80) return 6
  if (pct < 90) return 8
  return 9
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = {
  page:   { padding: '24px 20px 48px', fontFamily: 'monospace', maxWidth: 700, margin: '0 auto', color: '#e0e0e0', background: '#0f0f0f', minHeight: '100svh', boxSizing: 'border-box' },
  card:   { marginBottom: 20, padding: '16px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 },
  label:  { display: 'block', fontSize: 11, fontWeight: 700, color: '#777', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 },
  input:  { width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: '#111', border: '1px solid #333', borderRadius: 6, color: '#e0e0e0', fontFamily: 'monospace', fontSize: 13, outline: 'none' },
  row2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  row3:   { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 },
  h3:     { margin: '0 0 14px', fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em' },
  btn:    { padding: '9px 18px', border: 'none', borderRadius: 6, fontFamily: 'monospace', fontSize: 13, cursor: 'pointer' },
  hint:   { fontSize: 11, color: '#555', marginTop: 5, lineHeight: 1.5 },
  pre:    { background: '#0a0a0a', border: '1px solid #1f1f1f', borderRadius: 6, padding: 14, fontSize: 11, lineHeight: 1.75, overflowX: 'auto', whiteSpace: 'pre-wrap', maxHeight: 320, overflowY: 'auto', margin: 0 },
  tag:    { display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700 },
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminEntry() {
  // Tester + date
  const [athleteId,     setAthleteId]     = useState('')
  const [date,          setDate]           = useState(todayLocal())
  const [knownTesters,  setKnownTesters]   = useState([])
  const [showTesters,   setShowTesters]    = useState(false)

  // Recovery
  const [hrv,           setHrv]            = useState('')
  const [rhr,           setRhr]            = useState('')
  const [sleepHrs,      setSleepHrs]       = useState('')
  const [painLocation,  setPainLocation]   = useState('')

  // Workout
  const [workoutType,   setWorkoutType]    = useState('none')
  const [distanceKm,    setDistanceKm]     = useState('')
  const [durationMin,   setDurationMin]    = useState('')
  const [avgHr,         setAvgHr]          = useState('')
  const [maxHr,         setMaxHr]          = useState('')
  const [rpe,           setRpe]            = useState(5)
  const [intensity,     setIntensity]      = useState('moderate')
  const [intensityOverride, setIntensityOverride] = useState(false)

  // Output
  const [loading,       setLoading]        = useState(false)
  const [result,        setResult]         = useState(null)
  const [history,       setHistory]        = useState([])
  const [histLoading,   setHistLoading]    = useState(false)
  const [accuracyFlag,  setAccuracyFlag]   = useState(null)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) setKnownTesters(JSON.parse(stored))
    } catch {}
  }, [])

  // Auto-set intensity from RPE unless manually overridden
  useEffect(() => {
    if (!intensityOverride) setIntensity(intensityFromRpe(rpe))
  }, [rpe, intensityOverride])

  // Reload history whenever the athlete ID looks like a UUID (≥ 8 chars)
  useEffect(() => {
    if (athleteId.length >= 8) fetchHistory(athleteId.trim())
    else setHistory([])
  }, [athleteId])

  const hasWorkout = workoutType !== 'none'
  const pctHrMax   = avgHr && maxHr
    ? (parseFloat(avgHr) / parseFloat(maxHr)) * 100
    : null
  const isToday    = date === todayLocal()

  async function fetchHistory(id) {
    setHistLoading(true)
    const { data } = await supabase
      .from('recommendation_outputs')
      .select('id, created_at, decision, confidence, rules_fired')
      .eq('athlete_id', id)
      .order('created_at', { ascending: false })
      .limit(10)
    setHistory(data ?? [])
    setHistLoading(false)
  }

  function rememberTester(id) {
    setKnownTesters(prev => {
      const next = [...new Set([id, ...prev])].slice(0, 20)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }

  async function handleSubmit() {
    const id = athleteId.trim()
    if (!id) { alert('Enter an athlete ID'); return }

    setLoading(true)
    setResult(null)
    setAccuracyFlag(null)

    const log = []
    let signals      = null
    let engineResult = null
    let recId        = null

    try {
      // Ensure athlete row exists
      const { error: aeErr } = await supabase
        .from('athletes')
        .upsert({ id, email: `${id}@kineo.local` }, { onConflict: 'id' })
      log.push(aeErr ? `WARN athlete upsert: ${aeErr.message}` : '✓ Athlete row ensured')

      // Step 1 — checkins
      const { error: ciErr } = await supabase.from('checkins').insert({
        athlete_id:     id,
        date,
        sleep_quality:  3,
        stress:         3,
        fatigue:        3,
        soreness:       3,
        has_pain:       false,
        resting_hr_bpm: rhr      ? parseInt(rhr, 10)    : null,
        hrv_ms:         hrv      ? parseFloat(hrv)       : null,
        sleep_hours:    sleepHrs ? parseFloat(sleepHrs)  : null,
      })
      log.push(ciErr
        ? `WARN checkin: ${ciErr.message}`
        : `✓ Checkin inserted  date=${date}  HRV=${hrv || '—'}  RHR=${rhr || '—'}  sleep=${sleepHrs || '—'}`)

      // Step 2 — pain_logs
      const { error: plErr } = await supabase.from('pain_logs').insert({
        athlete_id:           id,
        date,
        pain_score:           0,
        trend:                'stable',
        pain_alters_movement: false,
        location:             painLocation || null,
      })
      log.push(plErr ? `WARN pain_log: ${plErr.message}` : '✓ Pain log inserted (score=0, stable)')

      // Step 3 — updateRecoveryMetrics (internally uses local clock date)
      await updateRecoveryMetrics(id, {
        hrv_ms:         hrv ? parseFloat(hrv)    : null,
        resting_hr_bpm: rhr ? parseInt(rhr, 10)  : null,
        fatigue:        3,
      })
      log.push(`✓ Recovery metrics updated${!isToday ? '  ⚠ written to today\'s clock date, not ' + date : ''}`)

      // Step 4 — updateBaseline
      await updateBaseline(id)
      log.push('✓ Baseline recomputed')

      // Step 5 — training session (optional)
      if (hasWorkout) {
        const showDist = ['run', 'bike', 'swim'].includes(workoutType)
        const { data: sessRow, error: sessErr } = await supabase
          .from('training_sessions')
          .insert({
            athlete_id:      id,
            date,
            workout_type:    workoutType,
            distance_km:     showDist && distanceKm ? parseFloat(distanceKm) : null,
            duration_min:    durationMin ? parseInt(durationMin, 10) : null,
            rpe,
            intensity_label: intensity,
            source:          'admin',
          })
          .select('id')
          .single()

        if (sessErr) {
          log.push(`WARN session insert: ${sessErr.message}`)
        } else {
          log.push(`✓ Training session inserted  type=${workoutType}  RPE=${rpe}  intensity=${intensity}`)
          await computeAndPersistLoadMetrics(id, sessRow.id, date)
          log.push('✓ Load metrics computed  (ACWR / mileage_change_pct / hard_sessions / back_to_back)')
        }
      }

      // Step 6 — mapToSignals
      signals = await mapToSignals(id, {
        sleep:              3,
        stress:             3,
        fatigue:            3,
        soreness:           3,
        painScore:          0,
        painTrend:          'stable',
        painAltersMovement: false,
        restingHrBpm:       rhr      ? parseInt(rhr, 10)   : null,
        hrvMs:              hrv      ? parseFloat(hrv)      : null,
        sleepHours:         sleepHrs ? parseFloat(sleepHrs) : null,
      })
      log.push('✓ Signals mapped')

      // Step 7 — evaluate
      engineResult = evaluate(signals)
      log.push(`✓ Engine → ${engineResult.decision} (${engineResult.confidence} confidence)`)

      // Step 8 — save recommendation_outputs
      const { data: recRow, error: recErr } = await supabase
        .from('recommendation_outputs')
        .insert({
          athlete_id:   id,
          decision:     engineResult.decision,
          confidence:   engineResult.confidence,
          reasons:      engineResult.reasons,
          action:       engineResult.action,
          watch_for:    engineResult.watchFor,
          signals_used: { ...signals, checkin: { sleep: 3, stress: 3, fatigue: 3, soreness: 3 } },
          rules_fired:  engineResult.rulesFired,
        })
        .select('id')
        .maybeSingle()

      if (recErr) {
        log.push(`WARN rec output: ${recErr.message}`)
      } else {
        recId = recRow?.id ?? null
        log.push('✓ Recommendation saved')
      }

      rememberTester(id)
      fetchHistory(id)

    } catch (err) {
      log.push(`ERROR: ${err.message}`)
      console.error('[admin]', err)
    } finally {
      setResult({ log, signals, engineResult, recId })
      setLoading(false)
    }
  }

  async function handleAccuracy(flag) {
    setAccuracyFlag(flag)
    console.log('[admin] accuracy flag:', flag ? 'ACCURATE' : 'OFF', '| rec_id:', result?.recId)
    if (result?.recId) {
      const { error } = await supabase
        .from('recommendation_outputs')
        .update({ admin_accuracy_flag: flag })
        .eq('id', result.recId)
      if (error) console.log('[admin] admin_accuracy_flag update failed (column may not exist yet):', error.message)
    }
  }

  return (
    <div style={S.page}>

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 18, color: '#e0e0e0' }}>
          Admin — Data Entry
        </h1>
        <p style={{ margin: 0, fontSize: 11, color: '#444' }}>
          Dev-only · stripped from production bundle · for entering tester spreadsheet data
        </p>
      </div>

      {/* ── Tester ─────────────────────────────────────────── */}
      <div style={S.card}>
        <p style={S.h3}>Tester</p>

        <div style={{ marginBottom: 12 }}>
          <label style={S.label}>Athlete ID (UUID)</label>
          <input
            style={S.input}
            value={athleteId}
            onChange={e => setAthleteId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          />
        </div>

        {knownTesters.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button
              style={{ ...S.btn, padding: '5px 12px', background: '#222', color: '#888', fontSize: 11 }}
              onClick={() => setShowTesters(t => !t)}
            >
              {showTesters ? '▲ Hide' : '▼ Known testers'} ({knownTesters.length})
            </button>
            {showTesters && (
              <div style={{ marginTop: 6, background: '#111', border: '1px solid #2a2a2a', borderRadius: 6, maxHeight: 180, overflowY: 'auto' }}>
                {knownTesters.map(tid => (
                  <button
                    key={tid}
                    onClick={() => { setAthleteId(tid); setShowTesters(false) }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', background: 'transparent', border: 'none', borderBottom: '1px solid #1f1f1f', color: '#bbb', fontFamily: 'monospace', fontSize: 11, cursor: 'pointer' }}
                  >
                    {tid}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <label style={S.label}>Date</label>
          <input
            type="date"
            style={{ ...S.input, width: 200 }}
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          {!isToday && (
            <p style={{ ...S.hint, color: '#f59e0b', marginTop: 6 }}>
              ⚠ Checkins / pain_logs / training_sessions will use {date}. Recovery metrics are always written to today's local clock date — a known limitation of updateRecoveryMetrics.
            </p>
          )}
        </div>
      </div>

      {/* ── Recovery Metrics ───────────────────────────────── */}
      <div style={S.card}>
        <p style={S.h3}>Recovery Metrics (Apple Watch morning readings)</p>
        <div style={S.row3}>
          <div>
            <label style={S.label}>HRV (ms)</label>
            <input type="number" style={S.input} value={hrv} onChange={e => setHrv(e.target.value)} placeholder="e.g. 52" />
          </div>
          <div>
            <label style={S.label}>Resting HR (bpm)</label>
            <input type="number" style={S.input} value={rhr} onChange={e => setRhr(e.target.value)} placeholder="e.g. 58" />
          </div>
          <div>
            <label style={S.label}>Sleep (hrs)</label>
            <input type="number" step="0.1" style={S.input} value={sleepHrs} onChange={e => setSleepHrs(e.target.value)} placeholder="e.g. 7.3" />
          </div>
        </div>
        <p style={S.hint}>
          Subjective fields (fatigue / soreness / stress / sleep_quality) are all set to 3 (neutral) — not collected from testers in this phase.
        </p>
      </div>

      {/* ── Pain (optional) ───────────────────────────────── */}
      <div style={S.card}>
        <p style={S.h3}>Pain (optional)</p>
        <div>
          <label style={S.label}>Location</label>
          <select
            style={{ ...S.input, width: 280 }}
            value={painLocation}
            onChange={e => setPainLocation(e.target.value)}
          >
            <option value="">Select location…</option>
            <option value="shin">Shin</option>
            <option value="knee-front">Front of knee</option>
            <option value="knee-outer">Outer knee</option>
            <option value="heel">Heel / bottom of foot</option>
            <option value="achilles">Achilles / back of ankle</option>
            <option value="hip-outer">Outer hip</option>
            <option value="lower-back">Lower back</option>
            <option value="shoulder">Shoulder</option>
            <option value="elbow">Elbow / forearm</option>
            <option value="other">Other / not sure</option>
          </select>
          <p style={S.hint}>Pain score is hardcoded to 0 in admin entries — location is stored for reference.</p>
        </div>
      </div>

      {/* ── Workout ────────────────────────────────────────── */}
      <div style={S.card}>
        <p style={S.h3}>Workout (optional)</p>

        <div style={{ marginBottom: 14 }}>
          <label style={S.label}>Type</label>
          <select
            style={{ ...S.input, width: 220 }}
            value={workoutType}
            onChange={e => setWorkoutType(e.target.value)}
          >
            {WORKOUT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {hasWorkout && (
          <>
            <div style={{ ...S.row3, marginBottom: 14 }}>
              {['run', 'bike', 'swim'].includes(workoutType) && (
                <div>
                  <label style={S.label}>Distance (km)</label>
                  <input type="number" step="0.1" style={S.input} value={distanceKm} onChange={e => setDistanceKm(e.target.value)} placeholder="e.g. 8.2" />
                </div>
              )}
              <div>
                <label style={S.label}>Duration (min)</label>
                <input type="number" style={S.input} value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="e.g. 45" />
              </div>
              <div>
                <label style={S.label}>Avg HR (bpm)</label>
                <input type="number" style={S.input} value={avgHr} onChange={e => setAvgHr(e.target.value)} placeholder="e.g. 152" />
              </div>
            </div>

            {/* %HRmax → RPE helper */}
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Max HR (bpm) — for %HRmax → RPE estimate</label>
              <input
                type="number"
                style={{ ...S.input, width: 160 }}
                value={maxHr}
                onChange={e => setMaxHr(e.target.value)}
                placeholder="e.g. 190"
              />
              {pctHrMax != null && (
                <div style={{ marginTop: 8, padding: '10px 12px', background: '#111', border: '1px solid #252525', borderRadius: 6, fontSize: 12 }}>
                  <span style={{ color: '#888' }}>Avg HR {avgHr} = </span>
                  <strong style={{ color: '#e0e0e0' }}>{Math.round(pctHrMax)}% of max HR</strong>
                  <span style={{ color: '#888' }}> → estimated RPE </span>
                  <strong style={{ color: '#f59e0b' }}>{pctToRpeLabel(pctHrMax)}</strong>
                  <span style={{ color: '#444', marginLeft: 10, fontSize: 11 }}>
                    (&lt;60%→3 · 60–70%→4–5 · 70–80%→6–7 · 80–90%→8 · &gt;90%→9–10)
                  </span>
                  <button
                    style={{ ...S.btn, marginLeft: 10, padding: '3px 9px', background: '#1d3557', color: '#90c5f8', fontSize: 11 }}
                    onClick={() => { setRpe(pctToRpeValue(pctHrMax)); setIntensityOverride(false) }}
                  >
                    Apply →
                  </button>
                </div>
              )}
            </div>

            {/* RPE slider */}
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>RPE: {rpe} — {RPE_LABEL[rpe]}</label>
              <input
                type="range" min={1} max={10} value={rpe}
                onChange={e => { setRpe(parseInt(e.target.value, 10)); setIntensityOverride(false) }}
                style={{ width: '100%', accentColor: '#6c63ff' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#444' }}>
                <span>1 – Easy</span><span>10 – Max</span>
              </div>
            </div>

            {/* Intensity */}
            <div>
              <label style={S.label}>
                Intensity
                {intensityOverride
                  ? ' (manual override)'
                  : ` (auto from RPE ${rpe})`}
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                {['easy', 'moderate', 'hard'].map(opt => (
                  <button
                    key={opt}
                    style={{
                      ...S.btn,
                      flex: 1,
                      background: intensity === opt ? '#6c63ff' : '#222',
                      color:      intensity === opt ? '#fff'    : '#777',
                    }}
                    onClick={() => { setIntensity(opt); setIntensityOverride(true) }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {intensityOverride && (
                <button
                  style={{ ...S.btn, marginTop: 6, padding: '3px 10px', background: 'transparent', color: '#444', fontSize: 11, border: '1px solid #2a2a2a' }}
                  onClick={() => { setIntensityOverride(false); setIntensity(intensityFromRpe(rpe)) }}
                >
                  ↺ Reset to auto
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Submit ─────────────────────────────────────────── */}
      <button
        style={{ ...S.btn, width: '100%', marginBottom: 24, padding: '13px', fontSize: 14, background: loading ? '#222' : '#1d4ed8', color: loading ? '#555' : '#fff' }}
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'Running pipeline…' : 'Submit'}
      </button>

      {/* ── Result ─────────────────────────────────────────── */}
      {result && (
        <div style={S.card}>
          <p style={S.h3}>Pipeline Log</p>
          <pre style={S.pre}>{result.log.join('\n')}</pre>

          {result.engineResult && (() => {
            const er = result.engineResult
            return (
              <>
                <p style={{ ...S.h3, marginTop: 20 }}>Engine Output</p>

                {/* Decision block */}
                <div style={{ marginBottom: 14, padding: '14px 16px', background: '#111', borderRadius: 8 }}>
                  <div style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 20, fontWeight: 800, color: DECISION_COLOR[er.decision] ?? '#e0e0e0' }}>
                      {er.decision}
                    </span>
                    <span style={{ marginLeft: 10, fontSize: 12, color: '#666' }}>
                      {er.confidence} confidence
                    </span>
                  </div>
                  <p style={{ margin: '0 0 6px', fontSize: 13, color: '#bbb', lineHeight: 1.5 }}>{er.action}</p>
                  {er.watchFor && (
                    <p style={{ margin: 0, fontSize: 11, color: '#666', lineHeight: 1.5 }}>
                      Watch for: {er.watchFor}
                    </p>
                  )}
                </div>

                {/* Rules fired */}
                {er.rulesFired?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ ...S.label, marginBottom: 8 }}>Rules Fired ({er.rulesFired.length})</p>
                    {er.rulesFired.map(r => (
                      <div key={r.id} style={{ padding: '8px 12px', background: '#111', borderRadius: 6, marginBottom: 6, fontSize: 12, lineHeight: 1.5 }}>
                        <span style={{ color: '#818cf8', fontWeight: 700 }}>{r.id}</span>
                        {'  '}
                        <span style={{ color: '#555' }}>{r.priority}</span>
                        {'  '}
                        <span style={{ ...S.tag, background: '#1a1000', color: DECISION_COLOR[r.decision] ?? '#e0e0e0' }}>
                          {r.decision}
                        </span>
                        <div style={{ color: '#999', marginTop: 4 }}>{r.reason}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Warnings */}
                {er.warnings?.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <p style={{ ...S.label, marginBottom: 8 }}>Warnings ({er.warnings.length})</p>
                    {er.warnings.map((w, i) => (
                      <div key={i} style={{ padding: '7px 10px', background: '#1a1000', border: '1px solid #2e2000', borderRadius: 6, fontSize: 11, color: '#f59e0b', marginBottom: 4, lineHeight: 1.5 }}>
                        {w}
                      </div>
                    ))}
                  </div>
                )}

                {/* Raw signals */}
                <div style={{ marginBottom: 14 }}>
                  <p style={{ ...S.label, marginBottom: 8 }}>Raw signals passed to evaluate()</p>
                  <pre style={{ ...S.pre, maxHeight: 280 }}>
                    {JSON.stringify(result.signals, null, 2)}
                  </pre>
                </div>

                {/* Accuracy flag */}
                <div style={{ padding: '12px 14px', background: '#111', borderRadius: 8 }}>
                  <p style={{ ...S.label, marginBottom: 10 }}>Did this feel right?</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      style={{ ...S.btn, flex: 1, background: accuracyFlag === true ? '#14532d' : '#1f1f1f', color: accuracyFlag === true ? '#4ade80' : '#666' }}
                      onClick={() => handleAccuracy(true)}
                    >
                      ✓ Accurate
                    </button>
                    <button
                      style={{ ...S.btn, flex: 1, background: accuracyFlag === false ? '#450a0a' : '#1f1f1f', color: accuracyFlag === false ? '#f87171' : '#666' }}
                      onClick={() => handleAccuracy(false)}
                    >
                      ✗ Off
                    </button>
                  </div>
                  {accuracyFlag !== null && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, color: '#444' }}>
                      Flagged as "{accuracyFlag ? 'accurate' : 'off'}". Logged to console; Supabase update attempted (requires admin_accuracy_flag boolean column on recommendation_outputs).
                    </p>
                  )}
                </div>
              </>
            )
          })()}
        </div>
      )}

      {/* ── History ────────────────────────────────────────── */}
      {athleteId.length >= 8 && (
        <div style={S.card}>
          <p style={S.h3}>
            Last 10 entries — {athleteId.trim().slice(0, 8)}…
          </p>
          {histLoading ? (
            <p style={{ color: '#444', fontSize: 12 }}>Loading…</p>
          ) : history.length === 0 ? (
            <p style={{ color: '#444', fontSize: 12 }}>No recommendation outputs yet for this athlete.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Date', 'Decision', 'Confidence', 'Top Rule'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '4px 10px', color: '#555', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map(row => {
                  const topRule = row.rules_fired?.[0]
                  return (
                    <tr key={row.id} style={{ borderTop: '1px solid #1f1f1f' }}>
                      <td style={{ padding: '7px 10px', color: '#666' }}>
                        {row.created_at?.split('T')[0] ?? '—'}
                      </td>
                      <td style={{ padding: '7px 10px', fontWeight: 700, color: DECISION_COLOR[row.decision] ?? '#e0e0e0' }}>
                        {row.decision}
                      </td>
                      <td style={{ padding: '7px 10px', color: '#555' }}>{row.confidence}</td>
                      <td style={{ padding: '7px 10px', color: '#777', fontSize: 11 }}>
                        {topRule ? topRule.id : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

    </div>
  )
}
