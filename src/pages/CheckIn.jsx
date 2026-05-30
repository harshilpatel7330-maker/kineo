import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { evaluate } from '../athleteiq-engine'
import { supabase } from '../supabaseClient'
import { mapToSignals } from '../utils/signalMapper'
import './CheckIn.css'

const ATHLETE_ID = '00000000-0000-0000-0000-000000000001'

const SLIDERS = [
  {
    key: 'sleep',
    label: 'Sleep Quality',
    emojis: ['😴', '😕', '😐', '🙂', '😁'],
  },
  {
    key: 'stress',
    label: 'Stress Level',
    emojis: ['😌', '🙂', '😐', '😟', '😩'],
  },
  {
    key: 'fatigue',
    label: 'Fatigue',
    emojis: ['⚡', '🙂', '😐', '😓', '🥴'],
  },
  {
    key: 'soreness',
    label: 'Soreness',
    emojis: ['💪', '🙂', '😐', '😣', '🤕'],
  },
]

const SESSION_OPTIONS = [0, 1, 2, 3, 4, '5+']

const LOAD_OPTIONS = [
  { value: 'less', label: 'Less than usual' },
  { value: 'same', label: 'About the same' },
  { value: 'more', label: 'More than usual' },
]

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function SliderSection({ label, value, onChange, emojis }) {
  const pct = ((value - 1) / 4) * 100

  return (
    <div className="checkin-slider">
      <div className="checkin-slider__header">
        <span className="checkin-slider__label">{label}</span>
        <span className="checkin-slider__value" aria-hidden="true">
          {emojis[value - 1]}
        </span>
      </div>
      <input
        type="range"
        className="checkin-slider__input"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--slider-pct': `${pct}%` }}
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={value}
        aria-label={label}
      />
      <div className="checkin-slider__scale" aria-hidden="true">
        {emojis.map((emoji, i) => (
          <span
            key={emoji}
            className={`checkin-slider__scale-item${value === i + 1 ? ' checkin-slider__scale-item--active' : ''}`}
          >
            {emoji}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function CheckIn() {
  const navigate = useNavigate()
  const [values, setValues] = useState({ sleep: 3, stress: 3, fatigue: 3, soreness: 3 })
  const [sessionsThisWeek, setSessionsThisWeek] = useState(null)
  const [loadVsNormal, setLoadVsNormal] = useState('same')
  const [painExpanded, setPainExpanded] = useState(true)
  const [painScore, setPainScore] = useState(0)
  const [painTrend, setPainTrend] = useState('stable')
  const [painAltersMovement, setPainAltersMovement] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function setSlider(key, val) {
    setValues((prev) => ({ ...prev, [key]: val }))
  }

  function selectSessions(option) {
    setSessionsThisWeek(option === '5+' ? 5 : option)
  }

  async function handleSubmit() {
    if (sessionsThisWeek === null) return

    setSubmitting(true)

    const hasPain = painScore > 0
    const checkinData = {
      ...values,
      sessionsThisWeek,
      loadVsNormal,
    }

    const signals = mapToSignals({
      sleep: values.sleep,
      stress: values.stress,
      fatigue: values.fatigue,
      soreness: values.soreness,
      painScore,
      painTrend,
      painAltersMovement,
      sessionsThisWeek,
      loadVsNormal,
    })

    const result = evaluate(signals)

    const { error: checkinError } = await supabase.from('checkins').insert({
      athlete_id: ATHLETE_ID,
      sleep_quality: values.sleep,
      stress: values.stress,
      fatigue: values.fatigue,
      soreness: values.soreness,
      has_pain: hasPain,
    })

    if (checkinError) console.error('Failed to save check-in:', checkinError)

    const { error: recError } = await supabase.from('recommendation_outputs').insert({
      athlete_id: ATHLETE_ID,
      decision: result.decision,
      confidence: result.confidence,
      reasons: result.reasons,
      action: result.action,
      watch_for: result.watchFor,
      signals_used: { ...signals, checkin: checkinData },
    })

    if (recError) console.error('Failed to save recommendation:', recError)

    localStorage.setItem(
      'kineo_last_result',
      JSON.stringify({
        result,
        signals,
        checkin: checkinData,
        hasPain,
        date: new Date().toISOString().split('T')[0],
      }),
    )
    navigate('/recommendation')
  }

  const canSubmit = sessionsThisWeek !== null && !submitting

  return (
    <div className="checkin">
      <header className="checkin__header">
        <h1 className="checkin__title">How are you feeling?</h1>
        <p className="checkin__date">{formatToday()}</p>
        <p className="checkin__hint">Takes less than 30 seconds</p>
      </header>

      <div className="checkin__sliders">
        {SLIDERS.map(({ key, label, emojis }) => (
          <SliderSection
            key={key}
            label={label}
            value={values[key]}
            onChange={(val) => setSlider(key, val)}
            emojis={emojis}
          />
        ))}
      </div>

      <section className="checkin__load">
        <h2 className="checkin__load-heading">Training Load</h2>

        <div className="checkin__field">
          <span className="checkin__field-label">How many training sessions have you done this week?</span>
          <div className="checkin__session-row">
            {SESSION_OPTIONS.map((option) => {
              const selected =
                option === '5+'
                  ? sessionsThisWeek === 5
                  : sessionsThisWeek === option
              return (
                <button
                  key={option}
                  type="button"
                  className={`checkin__session-btn${selected ? ' checkin__session-btn--active' : ''}`}
                  onClick={() => selectSessions(option)}
                >
                  {option}
                </button>
              )
            })}
          </div>
        </div>

        <div className="checkin__field">
          <span className="checkin__field-label">How does this compare to your usual week?</span>
          <div className="checkin__load-row">
            {LOAD_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                className={`checkin__load-btn${loadVsNormal === value ? ' checkin__load-btn--active' : ''}`}
                onClick={() => setLoadVsNormal(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="checkin__pain">
        <button
          type="button"
          className="checkin__pain-toggle checkin__pain-toggle--amber"
          onClick={() => setPainExpanded((open) => !open)}
          aria-expanded={painExpanded}
        >
          <span>⚠️ Any pain or discomfort? (tap to report)</span>
          <span className={`checkin__pain-chevron${painExpanded ? ' checkin__pain-chevron--open' : ''}`}>
            ›
          </span>
        </button>

        {painExpanded && (
          <div className="checkin__pain-body">
            <label className="checkin__field">
              <span className="checkin__field-label">Pain score</span>
              <input
                type="number"
                className="checkin__number-input"
                min={0}
                max={10}
                value={painScore}
                onChange={(e) => setPainScore(Math.min(10, Math.max(0, Number(e.target.value) || 0)))}
              />
              <span className="checkin__field-hint">0 = none, 10 = worst</span>
            </label>

            <label className="checkin__field">
              <span className="checkin__field-label">Pain trend</span>
              <select
                className="checkin__select"
                value={painTrend}
                onChange={(e) => setPainTrend(e.target.value)}
              >
                <option value="improving">Improving</option>
                <option value="stable">Stable</option>
                <option value="worsening">Worsening</option>
              </select>
            </label>

            <div className="checkin__field">
              <span className="checkin__field-label">Does it change how you move?</span>
              <div className="checkin__toggle-group">
                <button
                  type="button"
                  className={`checkin__toggle-btn${painAltersMovement ? ' checkin__toggle-btn--active' : ''}`}
                  onClick={() => setPainAltersMovement(true)}
                >
                  Yes
                </button>
                <button
                  type="button"
                  className={`checkin__toggle-btn${!painAltersMovement ? ' checkin__toggle-btn--active' : ''}`}
                  onClick={() => setPainAltersMovement(false)}
                >
                  No
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        className="checkin__submit"
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {submitting ? 'Getting recommendation…' : 'Get My Recommendation'}
      </button>
    </div>
  )
}
