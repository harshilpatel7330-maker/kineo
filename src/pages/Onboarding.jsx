import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Onboarding.css'

const PATHWAYS = [
  {
    id: 'runner',
    emoji: '🏃',
    label: 'Runner',
    sub: '5K · 10K · Half · Marathon · General running',
  },
  {
    id: 'recreational',
    emoji: '💪',
    label: 'Recreational Athlete',
    sub: 'Lifting · Group fitness · Pickup sports · General performance',
  },
]

const GOALS = [
  { id: 'race-prep', icon: '🎯', label: 'Race Preparation', sub: 'Training for a specific race distance and date', runnerOnly: true },
  { id: 'consistency', icon: '🔄', label: 'Training Consistency', sub: 'Build a reliable weekly training habit' },
  { id: 'injury-prevention', icon: '🛡️', label: 'Injury Prevention', sub: 'Manage load increases safely' },
  { id: 'performance', icon: '⚡', label: 'Improve Performance', sub: 'Get stronger, faster, more efficient' },
  { id: 'return', icon: '📈', label: 'Return to Training', sub: 'Coming back from injury or a break' },
]

const WEARABLES = [
  { id: 'apple-watch', emoji: '⌚', label: 'Apple Watch' },
  { id: 'garmin', emoji: '🟠', label: 'Garmin' },
  { id: 'whoop', emoji: '🖤', label: 'WHOOP' },
  { id: 'oura', emoji: '💍', label: 'Oura Ring' },
  { id: 'fitbit', emoji: '💙', label: 'Fitbit' },
  { id: 'none', emoji: '📱', label: 'No wearable' },
]

const STEPS = ['pathway', 'goals', 'wearable', 'baseline']

export default function Onboarding() {
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [pathway, setPathway] = useState(null)
  const [goals, setGoals] = useState([])
  const [wearable, setWearable] = useState(null)

  const step = STEPS[stepIndex]
  const progress = ((stepIndex + 1) / STEPS.length) * 100

  function toggleGoal(goalId) {
    setGoals((prev) =>
      prev.includes(goalId) ? prev.filter((g) => g !== goalId) : [...prev, goalId]
    )
  }

  function goNext() {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex(stepIndex + 1)
    }
  }

  function finish() {
    localStorage.setItem(
      'kineo_profile',
      JSON.stringify({ pathway, goals, wearable })
    )
    localStorage.setItem('kineo_setup_done', 'true')
    navigate('/dashboard')
  }

  const visibleGoals = GOALS.filter((g) => !g.runnerOnly || pathway === 'runner')

  return (
    <div className="onboarding">
      <div className="onboarding__progress">
        <div className="onboarding__progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {step === 'pathway' && (
        <div className="onboarding__step">
          <h1 className="onboarding__title">What kind of athlete are you?</h1>
          <p className="onboarding__subtitle">We'll personalise everything to your training context</p>

          <div className="onboarding__cards">
            {PATHWAYS.map((p) => (
              <button
                key={p.id}
                className={`onboarding__card onboarding__card--wide ${pathway === p.id ? 'selected' : ''}`}
                onClick={() => setPathway(p.id)}
              >
                <span className="onboarding__card-emoji">{p.emoji}</span>
                <span className="onboarding__card-text">
                  <span className="onboarding__card-label">{p.label}</span>
                  <span className="onboarding__card-sub">{p.sub}</span>
                </span>
              </button>
            ))}
          </div>

          <p className="onboarding__hint">You can change your pathway any time in Settings</p>

          <button className="onboarding__continue" disabled={!pathway} onClick={goNext}>
            Continue
          </button>
        </div>
      )}

      {step === 'goals' && (
        <div className="onboarding__step">
          <h1 className="onboarding__title">Your main goal</h1>
          <p className="onboarding__subtitle">Select all that apply — we'll prioritise insights accordingly</p>

          <div className="onboarding__cards">
            {visibleGoals.map((g) => (
              <button
                key={g.id}
                className={`onboarding__card onboarding__card--wide ${goals.includes(g.id) ? 'selected' : ''}`}
                onClick={() => toggleGoal(g.id)}
              >
                <span className="onboarding__card-icon">{g.icon}</span>
                <span className="onboarding__card-text">
                  <span className="onboarding__card-label">{g.label}</span>
                  <span className="onboarding__card-sub">{g.sub}</span>
                </span>
              </button>
            ))}
          </div>

          <button className="onboarding__continue" disabled={goals.length === 0} onClick={goNext}>
            Continue
          </button>
        </div>
      )}

      {step === 'wearable' && (
        <div className="onboarding__step">
          <h1 className="onboarding__title">Do you use a wearable?</h1>
          <p className="onboarding__subtitle">Connect your device for automatic tracking</p>

          <div className="onboarding__grid">
            {WEARABLES.map((w) => (
              <button
                key={w.id}
                className={`onboarding__card ${wearable === w.id ? 'selected' : ''}`}
                onClick={() => setWearable(w.id)}
              >
                <span className="onboarding__card-emoji onboarding__card-emoji--lg">{w.emoji}</span>
                <span className="onboarding__card-label">{w.label}</span>
              </button>
            ))}
          </div>

          <div className="onboarding__info-banner">
            <span className="onboarding__info-icon">⌚</span>
            <div>
              <p className="onboarding__info-title">Wearables unlock automatic tracking</p>
              <p className="onboarding__info-text">
                Connecting Apple Watch or Garmin lets Kineo read your HRV, resting heart rate,
                and sleep automatically — giving you more accurate recommendations without manual input.
              </p>
            </div>
          </div>

          <p className="onboarding__hint">Don't worry — Kineo works great without one</p>

          <button className="onboarding__continue" disabled={!wearable} onClick={goNext}>
            Continue
          </button>
        </div>
      )}

      {step === 'baseline' && (
        <div className="onboarding__step">
          <h1 className="onboarding__title">Building your baseline</h1>
          <p className="onboarding__subtitle">
            Kineo personalises every recommendation to <em>your</em> physiology — not generic population averages.
          </p>

          <div className="onboarding__baseline-card">
            <div className="onboarding__baseline-row">
              <span className="onboarding__baseline-icon">🔍</span>
              <div>
                <p className="onboarding__baseline-days">DAYS 1–7</p>
                <p className="onboarding__baseline-stage">Passive observation</p>
                <p className="onboarding__baseline-desc">
                  We collect your HRV, sleep, HR, and training load while you train normally
                </p>
              </div>
            </div>
            <div className="onboarding__baseline-row">
              <span className="onboarding__baseline-icon">⚙️</span>
              <div>
                <p className="onboarding__baseline-days">DAYS 7+</p>
                <p className="onboarding__baseline-stage">Baseline active</p>
                <p className="onboarding__baseline-desc">
                  Personal thresholds are calculated and readiness scoring activates
                </p>
              </div>
            </div>
            <div className="onboarding__baseline-row">
              <span className="onboarding__baseline-icon">⚡</span>
              <div>
                <p className="onboarding__baseline-days">ONGOING</p>
                <p className="onboarding__baseline-stage">Insights keep improving</p>
                <p className="onboarding__baseline-desc">
                  More daily check-ins mean sharper, more personalised guidance over time
                </p>
              </div>
            </div>
          </div>

          <div className="onboarding__notice">
            <span>📊</span>
            <p>
              <strong>Recommendations improve with each check-in.</strong> Until your baseline is
              established, we use safe, conservative defaults.
            </p>
          </div>

          <p className="onboarding__disclaimer">
            Training guidance only — not medical advice.<br />
            Pain or worsening symptoms should be evaluated by a medical professional.
          </p>

          <button className="onboarding__continue" onClick={finish}>
            Get Started
          </button>
        </div>
      )}
    </div>
  )
}