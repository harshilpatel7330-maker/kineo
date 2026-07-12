import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { evaluate } from '../athleteiq-engine'
import { supabase } from '../supabaseClient'
import { getAthleteMode, isReturnToSport } from '../utils/athleteMode'
import { mapToSignals } from '../utils/signalMapper'
import { fetchCumulativeLoad, updateBaseline, updateRecoveryMetrics } from '../utils/baselineCalculator'
import { computedPainTrend } from '../utils/painTrendCalculator'
import { checkGraduationCriteria } from '../utils/graduationChecker'
import { getAthleteId } from '../utils/athleteId'
import './CheckIn.css'
import './RTSCheckIn.css'

const ATHLETE_ID = getAthleteId()

const INJURY_LOCATION_MAP = {
  'shin-splints':          'shin',
  'it-band':               'knee-outer',
  'plantar-fasciitis':     'heel',
  'patellar-tendinopathy': 'knee-front',
  'achilles-tendinopathy': 'achilles',
  'stress-fracture-risk':  'shin',
  'rotator-cuff':          'shoulder',
  'lower-back-strain':     'lower-back',
  'elbow-tendinopathy':    'elbow',
  'unclassified':          'other',
}

const STIFFNESS_EMOJIS = ['💪', '😊', '🙂', '😐', '😐', '😟', '😟', '😣', '😣', '😖', '🤕']
const PAIN_EMOJIS      = ['😊', '🙂', '😐', '😐', '😟', '😟', '😣', '😣', '😖', '😖', '🤕']

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nDaysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RTSCheckIn() {
  const navigate = useNavigate()
  const { injuryId } = getAthleteMode()

  const [morningStiffness,  setMorningStiffness]  = useState(0)
  const [painScore,         setPainScore]         = useState(0)
  const [protocolAdherence, setProtocolAdherence] = useState(null)
  const [loading,           setLoading]           = useState(false)
  const [showHrvNudge,      setShowHrvNudge]      = useState(false)
  const [hrvMs,             setHrvMs]             = useState('')
  const [restingHrBpm,      setRestingHrBpm]      = useState('')
  const [hrvSkipped,        setHrvSkipped]        = useState(false)

  // Show HRV nudge only when last 3 RTS check-ins have no wearable data
  useEffect(() => {
    async function checkHrvHistory() {
      const { data: recentRts } = await supabase
        .from('rts_checkins')
        .select('date')
        .eq('athlete_id', ATHLETE_ID)
        .order('date', { ascending: false })
        .limit(3)

      if (!recentRts || recentRts.length === 0) {
        setShowHrvNudge(true)
        return
      }

      const dates = recentRts.map(r => r.date)
      const { data: checkins } = await supabase
        .from('checkins')
        .select('hrv_ms')
        .eq('athlete_id', ATHLETE_ID)
        .in('date', dates)

      const hasHrvData = (checkins ?? []).some(c => c.hrv_ms != null)
      setShowHrvNudge(!hasHrvData)
    }
    checkHrvHistory()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Gate: non-RTS users use the standard check-in
  if (!isReturnToSport()) return <Navigate to="/checkin" replace />

  const painLocation = INJURY_LOCATION_MAP[injuryId] ?? 'other'

  async function handleSubmit() {
    if (!protocolAdherence) return
    setLoading(true)
    try {
      const today = localToday()

      await supabase
        .from('athletes')
        .upsert({ id: ATHLETE_ID, email: `${ATHLETE_ID}@kineo.local` }, { onConflict: 'id' })

      const cumulativeLoad = await fetchCumulativeLoad(ATHLETE_ID)

      const enteredHrv = showHrvNudge && !hrvSkipped && hrvMs !== '' ? parseFloat(hrvMs) : null
      const enteredRhr = showHrvNudge && !hrvSkipped && restingHrBpm !== '' ? parseFloat(restingHrBpm) : null

      // 1. Upsert into checkins — reuse fatigue for morning stiffness, soreness for pain score
      const { error: checkinError } = await supabase
        .from('checkins')
        .upsert({
          athlete_id:     ATHLETE_ID,
          date:           today,
          sleep_quality:  null,
          stress:         null,
          fatigue:        morningStiffness,
          soreness:       painScore,
          has_pain:       painScore > 0,
          resting_hr_bpm: enteredRhr,
          hrv_ms:         enteredHrv,
          sleep_hours:    null,
          source:         'rts_checkin',
        }, { onConflict: 'athlete_id,date' })
      if (checkinError) console.error('checkins upsert:', checkinError)

      // 2. Compute trend from prior pain history, then write today's pain_logs row
      const { data: priorLogs } = await supabase
        .from('pain_logs')
        .select('pain_score, date')
        .eq('athlete_id', ATHLETE_ID)
        .gte('date', nDaysAgoISO(14))
        .order('date', { ascending: false })

      const computedTrend = computedPainTrend(priorLogs ?? []) ?? 'stable'

      const { error: painLogError } = await supabase
        .from('pain_logs')
        .insert({
          athlete_id:           ATHLETE_ID,
          date:                 today,
          pain_score:           painScore,
          trend:                computedTrend,
          pain_alters_movement: painScore >= 6,
          location:             painLocation,
        })
      if (painLogError) console.error('pain_logs insert:', painLogError)

      // 3. Upsert into rts_checkins — handles re-submission on same day
      const { error: rtsError } = await supabase
        .from('rts_checkins')
        .upsert({
          athlete_id:         ATHLETE_ID,
          date:               today,
          morning_stiffness:  morningStiffness,
          pain_score:         painScore,
          protocol_adherence: protocolAdherence,
        }, { onConflict: 'athlete_id,date' })
      if (rtsError) console.error('rts_checkins upsert:', rtsError)

      // 4. Update recovery metrics and baseline
      await updateRecoveryMetrics(ATHLETE_ID, {
        hrv_ms:         enteredHrv,
        resting_hr_bpm: enteredRhr,
        fatigue:        morningStiffness,
      })
      await updateBaseline(ATHLETE_ID)

      // 5. Run engine pipeline
      const signals = await mapToSignals(ATHLETE_ID, {
        sleep:              3,
        stress:             3,
        fatigue:            morningStiffness,
        soreness:           painScore,
        painScore,
        painTrend:          computedTrend,
        painAltersMovement: painScore >= 6,
        restingHrBpm:       enteredRhr,
        hrvMs:              enteredHrv,
        sleepHours:         null,
      })

      const goalContext = signals.goalType
        ? { goalType: signals.goalType, goalName: signals.goalName, goalDate: signals.goalDate, goalWeeklyVolume: signals.goalWeeklyVolume }
        : null
      const result = evaluate(signals, goalContext)

      if (cumulativeLoad.hasPattern) {
        result.warnings = result.warnings ?? []
        result.warnings.push(
          `Elevated fatigue for ${cumulativeLoad.consecutiveHighWeeks} consecutive weeks. Consider a lighter recovery day.`
        )
      }

      // 6. Save recommendation
      const checkinSnapshot = { sleep: 3, stress: 3, fatigue: morningStiffness, soreness: painScore }

      await supabase.from('recommendation_outputs').insert({
        athlete_id:   ATHLETE_ID,
        decision:     result.decision,
        confidence:   result.confidence,
        reasons:      result.reasons,
        action:       result.action,
        watch_for:    result.watchFor,
        signals_used: { ...signals, checkin: checkinSnapshot },
        rules_fired:  result.rulesFired,
      })

      // Store with YYYY-MM-DD date so Recovery.jsx isCheckInToday() matches correctly
      localStorage.setItem('kineo_last_result', JSON.stringify({
        result,
        signals,
        checkin: checkinSnapshot,
        date:    today,
      }))

      // 7. Check graduation before navigating
      const { graduated } = await checkGraduationCriteria(ATHLETE_ID)
      navigate(graduated ? '/graduated' : '/recovery', { state: { justCheckedIn: true } })

    } catch (err) {
      console.error('RTS check-in error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="check-in rts-checkin">
      <div className="check-in__header">
        <h1 className="check-in__title">Recovery Check-In</h1>
        <p className="check-in__subtitle">3 questions · takes 20 seconds</p>
      </div>

      {/* Q1 — Morning stiffness */}
      <div className="check-in__field">
        <div className="check-in__label-row">
          <span className="check-in__label">How's the injury site this morning?</span>
          <span className="check-in__emoji">{STIFFNESS_EMOJIS[morningStiffness]}</span>
        </div>
        <p className="rts-checkin__question-sub">Before you've moved around much</p>
        <input
          type="range"
          min={0}
          max={10}
          value={morningStiffness}
          onChange={e => setMorningStiffness(parseInt(e.target.value))}
          className="check-in__slider check-in__slider--neg"
        />
        <div className="check-in__track-labels">
          <span className="check-in__track-label">No stiffness (0)</span>
          <span className="check-in__track-label">Very stiff (10)</span>
        </div>
      </div>

      {/* Q2 — Pain score */}
      <div className="check-in__field">
        <div className="check-in__label-row">
          <span className="check-in__label">Pain score right now</span>
          <span className="check-in__emoji">{PAIN_EMOJIS[painScore]}</span>
        </div>
        <p className="rts-checkin__question-sub">At the injury site, at rest</p>
        <input
          type="range"
          min={0}
          max={10}
          value={painScore}
          onChange={e => setPainScore(parseInt(e.target.value))}
          className="check-in__slider check-in__slider--neg"
        />
        <div className="check-in__track-labels">
          <span className="check-in__track-label">No pain (0)</span>
          <span className="check-in__track-label">Severe (10)</span>
        </div>
      </div>

      {/* Q3 — Protocol adherence */}
      <div className="check-in__field">
        <span className="check-in__label">Did you do yesterday's protocol?</span>
        <div className="rts-checkin__adherence-btns">
          {[
            { value: 'full',    label: 'Yes, all of it' },
            { value: 'partial', label: 'Some of it' },
            { value: 'none',    label: 'No / rest day' },
          ].map(opt => (
            <button
              key={opt.value}
              className={`rts-checkin__adherence-btn ${protocolAdherence === opt.value ? 'selected' : ''}`}
              onClick={() => setProtocolAdherence(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Q4 — Optional HRV nudge (shown only when recent check-ins have no wearable data) */}
      {showHrvNudge && !hrvSkipped && (
        <div className="check-in__wearable-section">
          <div className="check-in__wearable-header">
            <span>Your Apple Watch HRV</span>
            <span className="check-in__optional-badge">optional</span>
          </div>
          <p className="check-in__wearable-subtitle">
            Helps track your recovery arc — find it in Health → Browse → Heart → Heart Rate Variability
          </p>
          <div className="check-in__wearable-inputs">
            <div className="check-in__wearable-input">
              <label>HRV (ms)</label>
              <div className="check-in__input-row">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 52"
                  value={hrvMs}
                  onChange={e => setHrvMs(e.target.value)}
                />
                <span className="check-in__unit">ms</span>
              </div>
            </div>
            <div className="check-in__wearable-input">
              <label>Resting heart rate (bpm)</label>
              <div className="check-in__input-row">
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder="e.g. 58"
                  value={restingHrBpm}
                  onChange={e => setRestingHrBpm(e.target.value)}
                />
                <span className="check-in__unit">bpm</span>
              </div>
            </div>
          </div>
          <p className="rts-checkin__hrv-hint">
            This updates your personal baseline and improves recovery arc tracking
          </p>
          <button className="rts-checkin__hrv-skip" onClick={() => setHrvSkipped(true)}>
            Skip for now
          </button>
        </div>
      )}

      <button
        className="check-in__submit"
        onClick={handleSubmit}
        disabled={loading || !protocolAdherence}
      >
        {loading ? 'Saving...' : 'Submit'}
      </button>
    </div>
  )
}
