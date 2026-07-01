import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { evaluate } from '../athleteiq-engine'
import { supabase } from '../supabaseClient'
import { mapToSignals } from '../utils/signalMapper'
import { fetchCumulativeLoad, updateBaseline, updateRecoveryMetrics } from '../utils/baselineCalculator'
import './CheckIn.css'

import { getAthleteId } from '../utils/athleteId'
const ATHLETE_ID = getAthleteId()

const SLIDERS = [
  { key: 'sleep',    label: 'Sleep Quality', emojis: ['😴','😕','😐','🙂','😁'], leftLabel: 'Very poor',  rightLabel: 'Great',      gradient: 'pos' },
  { key: 'stress',   label: 'Stress Level',  emojis: ['😌','🙂','😐','😟','😩'], leftLabel: 'Calm',       rightLabel: 'Overwhelmed', gradient: 'neg' },
  { key: 'fatigue',  label: 'Fatigue',       emojis: ['⚡','🙂','😐','😓','🥴'], leftLabel: 'Fresh legs', rightLabel: 'Exhausted',   gradient: 'neg' },
  { key: 'soreness', label: 'Soreness',      emojis: ['💪','🙂','😐','😣','🤕'], leftLabel: 'None',       rightLabel: 'Very sore',   gradient: 'neg' },
]

const SESSIONS = [0, 1, 2, 3, 4, 5]
const LOAD_OPTIONS = [
  { value: 'less', label: 'Less than usual' },
  { value: 'same', label: 'About the same' },
  { value: 'more', label: 'More than usual' },
]

const TRAINING_TYPES = [
  { value: 'running', label: 'Running', emoji: '🏃' },
  { value: 'lifting', label: 'Lifting', emoji: '🏋️' },
  { value: 'sport', label: 'Sport/Team', emoji: '⚽' },
  { value: 'recovery', label: 'Recovery', emoji: '🧘' },
]

const PAIN_LOCATIONS = [
  { value: 'shin',        label: 'Shin' },
  { value: 'knee-front',  label: 'Front of knee' },
  { value: 'knee-outer',  label: 'Outer knee' },
  { value: 'heel',        label: 'Heel / bottom of foot' },
  { value: 'achilles',    label: 'Achilles / back of ankle' },
  { value: 'hip-outer',   label: 'Outer hip' },
  { value: 'lower-back',  label: 'Lower back' },
  { value: 'shoulder',    label: 'Shoulder' },
  { value: 'elbow',       label: 'Elbow / forearm' },
  { value: 'other',       label: 'Other / not sure' },
]

const PAIN_EMOJIS = ['😊','🙂','😐','😐','😟','😟','😣','😣','😖','😖','🤕']

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
}

function getWearableHint(wearable) {
  switch (wearable) {
    case 'apple-watch':
      return 'Find in Health app → Heart → Resting Heart Rate'
    case 'whoop':
      return 'Find in Recovery screen'
    case 'oura':
      return 'Find in Today tab → Readiness'
    case 'garmin':
      return 'Find in Garmin Connect → Health Stats'
    default:
      return "Find in your phone's Health app"
  }
}

export default function CheckIn() {
  const navigate = useNavigate()
  const profile = JSON.parse(localStorage.getItem('kineo_profile') || '{}')

  const [sliders, setSliders] = useState({ sleep: 3, stress: 3, fatigue: 3, soreness: 3 })
  const [sessionsThisWeek, setSessionsThisWeek] = useState(null)
  const [loadVsNormal, setLoadVsNormal] = useState('same')
  const [trainingType, setTrainingType] = useState(null)
  const [hasPain, setHasPain] = useState(false)
  const [painScore, setPainScore] = useState(0)
  const [painLocation, setPainLocation] = useState('')
  const [painLocationError, setPainLocationError] = useState(false)
  const [painTrend, setPainTrend] = useState('stable')
  const [painAltersMovement, setPainAltersMovement] = useState(false)
  const [restingHrBpm, setRestingHrBpm] = useState('')
  const [hrvMs, setHrvMs] = useState('')
  const [sleepHours, setSleepHours] = useState('')
  const [showWhyHelp, setShowWhyHelp] = useState(false)
  const [loading, setLoading] = useState(false)

  const wearableHint = getWearableHint(profile.wearable)

  async function handleSubmit() {
    if (sessionsThisWeek === null) {
      alert('Please select how many sessions you did this week')
      return
    }
    if (hasPain && !painLocation) {
      setPainLocationError(true)
      return
    }
    setLoading(true)
    try {
      const { error: athleteError } = await supabase
        .from('athletes')
        .upsert(
          { id: ATHLETE_ID, email: `${ATHLETE_ID}@kineo.local` },
          { onConflict: 'id' }
        )
      if (athleteError) console.error('Failed to ensure athlete row:', athleteError)

      const cumulativeLoad = await fetchCumulativeLoad(ATHLETE_ID)

      // Insert checkin first so updateBaseline/updateRecoveryMetrics include
      // today's wearable readings before mapToSignals queries those tables.
      // Use local clock parts (not toISOString) so "today" matches the user's
      // date even near midnight in non-UTC timezones.
      const _d = new Date()
      const localToday = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`
      const { error: checkinError } = await supabase
        .from('checkins')
        .insert({
          athlete_id:     ATHLETE_ID,
          date:           localToday,
          sleep_quality:  sliders.sleep,
          stress:         sliders.stress,
          fatigue:        sliders.fatigue,
          soreness:       sliders.soreness,
          has_pain:       hasPain,
          resting_hr_bpm: restingHrBpm ? parseInt(restingHrBpm, 10) : null,
          hrv_ms:         hrvMs ? parseFloat(hrvMs) : null,
          sleep_hours:    sleepHours ? parseFloat(sleepHours) : null,
        })
      if (checkinError) console.error('Failed to save check-in:', checkinError)

      // Write a pain_logs row on every check-in (score=0 on pain-free days)
      // so computedPainTrend has a real history to compare against, not just
      // days the user explicitly reported pain.
      const { error: painLogError } = await supabase
        .from('pain_logs')
        .insert({
          athlete_id:          ATHLETE_ID,
          date:                localToday,
          pain_score:          hasPain ? painScore : 0,
          trend:               hasPain ? painTrend : 'stable',
          pain_alters_movement: hasPain ? painAltersMovement : false,
          location:            hasPain ? painLocation : null,
        })
      if (painLogError) console.error('Failed to save pain log:', painLogError)

      // Compare today's HRV/RHR against the pre-today baseline (excludes
      // today's own row, which was just inserted above).
      await updateRecoveryMetrics(ATHLETE_ID, {
        hrv_ms:         hrvMs ? parseFloat(hrvMs) : null,
        resting_hr_bpm: restingHrBpm ? parseInt(restingHrBpm, 10) : null,
        fatigue:        sliders.fatigue,
      })
      // Then fold today into the rolling baseline so tomorrow's comparison
      // is based on a window that includes today.
      await updateBaseline(ATHLETE_ID)

      const signals = await mapToSignals(ATHLETE_ID, {
        sleep: sliders.sleep,
        stress: sliders.stress,
        fatigue: sliders.fatigue,
        soreness: sliders.soreness,
        painScore: hasPain ? painScore : 0,
        painTrend: hasPain ? painTrend : 'stable',
        painAltersMovement: hasPain ? painAltersMovement : false,
        restingHrBpm: restingHrBpm ? parseFloat(restingHrBpm) : null,
        hrvMs: hrvMs ? parseFloat(hrvMs) : null,
        sleepHours: sleepHours ? parseFloat(sleepHours) : null,
      })

      const result = evaluate(signals)

      if (cumulativeLoad.hasPattern) {
        result.warnings = result.warnings ?? []
        result.warnings.push(
          `Your fatigue has been elevated for ${cumulativeLoad.consecutiveHighWeeks} consecutive weeks. This pattern is associated with increased injury risk. Consider a deload week.`
        )
      }

      // Save recommendation to Supabase
      const { error: recError } = await supabase
        .from('recommendation_outputs')
        .insert({
          athlete_id:   ATHLETE_ID,
          decision:     result.decision,
          confidence:   result.confidence,
          reasons:      result.reasons,
          action:       result.action,
          watch_for:    result.watchFor,
          signals_used: { ...signals, checkin: sliders },
          rules_fired:  result.rulesFired,
        })
      if (recError) console.error('Failed to save recommendation:', recError)

      localStorage.setItem('kineo_last_result', JSON.stringify({
        result,
        signals,
        checkin: {
          ...sliders,
          sessionsThisWeek,
          loadVsNormal,
          trainingType,
          restingHrBpm: restingHrBpm ? parseFloat(restingHrBpm) : null,
          hrvMs: hrvMs ? parseFloat(hrvMs) : null,
          sleepHours: sleepHours ? parseFloat(sleepHours) : null,
        },
        hasPain,
        cumulativeLoad,
        date: new Date().toISOString(),
      }))

      navigate('/recommendation')
    } catch (err) {
      console.error('Check-in error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="check-in">
      <div className="check-in__header">
        <h1 className="check-in__title">How are you feeling?</h1>
        <p className="check-in__date">{formatDate()}</p>
        <p className="check-in__subtitle">Takes less than 30 seconds</p>
      </div>

      {/* Sliders */}
      {SLIDERS.map(({ key, label, emojis, leftLabel, rightLabel, gradient }) => (
        <div key={key} className="check-in__field">
          <div className="check-in__label-row">
            <span className="check-in__label">{label}</span>
            <span className="check-in__emoji">{emojis[sliders[key] - 1]}</span>
          </div>
          <input
            type="range" min={1} max={5} value={sliders[key]}
            onChange={e => setSliders(s => ({ ...s, [key]: parseInt(e.target.value) }))}
            className={`check-in__slider check-in__slider--${gradient}`}
          />
          <div className="check-in__track-labels">
            <span className="check-in__track-label">{leftLabel}</span>
            <span className="check-in__track-label">{rightLabel}</span>
          </div>
        </div>
      ))}

      {/* Wearable stats — optional, after sliders, before training load */}
      <section className="check-in__wearable-card">
        <h2 className="check-in__wearable-title">📊 This morning&apos;s stats</h2>
        <p className="check-in__wearable-subtitle">
          Optional — add data from your wearable for more accurate recommendations
        </p>

        <div className="check-in__wearable-fields">
          <div className="check-in__wearable-field">
            <label className="check-in__wearable-label" htmlFor="resting-hr">
              Resting Heart Rate
            </label>
            <div className="check-in__input-row">
              <input
                id="resting-hr"
                type="number"
                placeholder="e.g. 58"
                value={restingHrBpm}
                onChange={(e) => setRestingHrBpm(e.target.value)}
              />
              <span className="check-in__unit">bpm</span>
            </div>
            <p className="check-in__wearable-helper">{wearableHint}</p>
          </div>

          <div className="check-in__wearable-field">
            <div className="check-in__wearable-label-row">
              <label className="check-in__wearable-label" htmlFor="hrv">
                Heart Rate Variability (HRV)
              </label>
              <span
                className="check-in__info-tip"
                title="HRV measures recovery quality. Higher is generally better for you personally."
              >
                ⓘ
              </span>
            </div>
            <div className="check-in__input-row">
              <input
                id="hrv"
                type="number"
                placeholder="e.g. 45"
                value={hrvMs}
                onChange={(e) => setHrvMs(e.target.value)}
              />
              <span className="check-in__unit">ms</span>
            </div>
            <p className="check-in__wearable-helper">{wearableHint}</p>
            <p className="check-in__wearable-tip">
              HRV measures recovery quality. Higher is generally better for you personally.
            </p>
          </div>

          <div className="check-in__wearable-field">
            <label className="check-in__wearable-label" htmlFor="sleep-hours">
              Hours of sleep
            </label>
            <div className="check-in__input-row">
              <input
                id="sleep-hours"
                type="number"
                placeholder="e.g. 7.5"
                step="0.5"
                min="0"
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
              />
              <span className="check-in__unit">hrs</span>
            </div>
            <p className="check-in__wearable-helper">More accurate than the sleep quality slider</p>
            <p className="check-in__wearable-note">
              This replaces your sleep slider for today&apos;s recommendation
            </p>
          </div>
        </div>

        <button
          type="button"
          className="check-in__why-toggle"
          onClick={() => setShowWhyHelp((open) => !open)}
          aria-expanded={showWhyHelp}
        >
          Why does this help?
          <span>{showWhyHelp ? '▲' : '▼'}</span>
        </button>
        {showWhyHelp && (
          <p className="check-in__why-body">
            Wearable data removes guesswork. Your resting heart rate and HRV are objective
            measures of how recovered your body actually is — your recommendations become
            significantly more accurate when you include them.
          </p>
        )}
      </section>

      {/* Training type */}
      <div className="check-in__field">
        <span className="check-in__label">What did you train today?</span>
        <div className="check-in__options">
          {TRAINING_TYPES.map(t => (
            <button key={t.value}
              className={`check-in__option-btn ${trainingType === t.value ? 'selected' : ''}`}
              onClick={() => setTrainingType(t.value)}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sessions this week */}
      <div className="check-in__field">
        <span className="check-in__label">Sessions this week</span>
        <div className="check-in__number-row">
          {SESSIONS.map(n => (
            <button key={n}
              className={`check-in__number-btn ${sessionsThisWeek === n ? 'selected' : ''}`}
              onClick={() => setSessionsThisWeek(n)}>
              {n === 5 ? '5+' : n}
            </button>
          ))}
        </div>
      </div>

      {/* Load vs normal */}
      <div className="check-in__field">
        <span className="check-in__label">Compared to your usual week?</span>
        <div className="check-in__options">
          {LOAD_OPTIONS.map(o => (
            <button key={o.value}
              className={`check-in__option-btn ${loadVsNormal === o.value ? 'selected' : ''}`}
              onClick={() => setLoadVsNormal(o.value)}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pain section */}
      <div className={`check-in__pain-section ${hasPain ? 'open' : ''}`}>
        <button className="check-in__pain-toggle"
          onClick={() => {
            if (hasPain) { setPainScore(0); setPainLocation('') }
            setPainLocationError(false)
            setHasPain(h => !h)
          }}>
          ⚠️ Any pain or discomfort? (tap to report)
          <span>{hasPain ? '▲' : '▼'}</span>
        </button>
        {hasPain && (
          <div className="check-in__pain-fields">
            <div className="check-in__field">
              <label className="check-in__label">Where does it hurt?</label>
              <select
                value={painLocation}
                onChange={e => { setPainLocation(e.target.value); setPainLocationError(false) }}
                className="check-in__select">
                <option value="">Select location…</option>
                {PAIN_LOCATIONS.map(loc => (
                  <option key={loc.value} value={loc.value}>{loc.label}</option>
                ))}
              </select>
              {painLocationError && (
                <p className="check-in__field-error">Please select a location</p>
              )}
            </div>
            <div className="check-in__field">
              <div className="check-in__label-row">
                <label className="check-in__label">Pain score</label>
                <span className="check-in__emoji">{PAIN_EMOJIS[painScore]}</span>
              </div>
              <input
                type="range" min={0} max={10} value={painScore}
                onChange={e => setPainScore(parseInt(e.target.value))}
                className="check-in__slider check-in__slider--neg"
              />
              <div className="check-in__track-labels">
                <span className="check-in__track-label">No pain (0)</span>
                <span className="check-in__track-label">Severe (10)</span>
              </div>
            </div>
            <div className="check-in__field">
              <label className="check-in__label">Trend</label>
              <select value={painTrend}
                onChange={e => setPainTrend(e.target.value)}
                className="check-in__select">
                <option value="improving">Improving</option>
                <option value="stable">Stable</option>
                <option value="worsening">Worsening</option>
              </select>
            </div>
            <div className="check-in__field">
              <label className="check-in__label">Does it change how you move?</label>
              <div className="check-in__toggle-row">
                <button className={`check-in__toggle-btn ${!painAltersMovement ? 'selected' : ''}`}
                  onClick={() => setPainAltersMovement(false)}>No</button>
                <button className={`check-in__toggle-btn ${painAltersMovement ? 'selected' : ''}`}
                  onClick={() => setPainAltersMovement(true)}>Yes</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <button className="check-in__submit" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Analysing...' : 'Get My Recommendation'}
      </button>
    </div>
  )
}