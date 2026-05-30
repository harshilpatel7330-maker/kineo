import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Onboarding.css'

const SPORTS = [
  { id: 'runner', label: 'Runner', emoji: '🏃' },
  { id: 'american-football', label: 'American Football', emoji: '🏈' },
  { id: 'team-sport', label: 'Team Sport', emoji: '⚽' },
  { id: 'other', label: 'Other Sport', emoji: '🏅' },
]

const WEARABLES = [
  { id: 'apple-watch', label: 'Apple Watch', emoji: '⌚' },
  { id: 'garmin', label: 'Garmin', emoji: '🟠' },
  { id: 'whoop', label: 'WHOOP', emoji: '🖤' },
  { id: 'oura', label: 'Oura Ring', emoji: '💍' },
  { id: 'fitbit', label: 'Fitbit', emoji: '💙' },
  { id: 'none', label: 'No wearable', emoji: '📱' },
]

const BASELINE_POINTS = [
  'First 7 days establish your personal baseline',
  'Recommendations improve as Kineo learns your patterns',
  'Check in daily for the most accurate guidance',
]

function SelectCard({ emoji, label, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`onboarding-card${selected ? ' onboarding-card--selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className="onboarding-card__emoji" aria-hidden="true">
        {emoji}
      </span>
      <span className="onboarding-card__label">{label}</span>
    </button>
  )
}

export default function Onboarding() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [sport, setSport] = useState(null)
  const [wearable, setWearable] = useState(null)

  function handleGetStarted() {
    localStorage.setItem('kineo_profile', JSON.stringify({ sport, wearable }))
    localStorage.setItem('kineo_setup_done', 'true')
    navigate('/dashboard')
  }

  return (
    <div className="onboarding">
      <div className="onboarding__progress" aria-label={`Step ${step} of 3`}>
        {[1, 2, 3].map((n) => (
          <div
            key={n}
            className={`onboarding__progress-dot${n <= step ? ' onboarding__progress-dot--active' : ''}${n < step ? ' onboarding__progress-dot--complete' : ''}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="onboarding__step">
          <header className="onboarding__header">
            <h1 className="onboarding__title">What sport do you play?</h1>
            <p className="onboarding__subtitle">Kineo will personalise your experience</p>
          </header>

          <div className="onboarding__grid onboarding__grid--2">
            {SPORTS.map(({ id, label, emoji }) => (
              <SelectCard
                key={id}
                emoji={emoji}
                label={label}
                selected={sport === id}
                onSelect={() => setSport(id)}
              />
            ))}
          </div>

          {sport && (
            <button type="button" className="onboarding__btn" onClick={() => setStep(2)}>
              Continue
            </button>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="onboarding__step">
          <header className="onboarding__header">
            <h1 className="onboarding__title">Do you use a wearable?</h1>
            <p className="onboarding__subtitle">Connect your device for automatic tracking</p>
          </header>

          <div className="onboarding__grid onboarding__grid--2">
            {WEARABLES.map(({ id, label, emoji }) => (
              <SelectCard
                key={id}
                emoji={emoji}
                label={label}
                selected={wearable === id}
                onSelect={() => setWearable(id)}
              />
            ))}
          </div>

          <div className="onboarding__wearable-banner">
            <span className="onboarding__wearable-banner-icon" aria-hidden="true">⌚</span>
            <div>
              <p className="onboarding__wearable-banner-title">Wearables unlock automatic tracking</p>
              <p className="onboarding__wearable-banner-body">
                When you connect Apple Watch or Garmin, Kineo reads your HRV, resting heart rate,
                and sleep automatically — giving you more accurate recommendations without any
                manual input.
              </p>
            </div>
          </div>

          <p className="onboarding__note">Don&apos;t worry — Kineo works great without one</p>

          {wearable && (
            <button type="button" className="onboarding__btn" onClick={() => setStep(3)}>
              Continue
            </button>
          )}
        </div>
      )}

      {step === 3 && (
        <div className="onboarding__step onboarding__step--baseline">
          <header className="onboarding__header">
            <h1 className="onboarding__title">Building your baseline</h1>
            <p className="onboarding__subtitle">Kineo learns what&apos;s normal for YOU</p>
          </header>

          <ul className="onboarding__bullets">
            {BASELINE_POINTS.map((point) => (
              <li key={point} className="onboarding__bullet">
                <span className="onboarding__bullet-icon" aria-hidden="true">
                  ✓
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <button type="button" className="onboarding__btn onboarding__btn--large" onClick={handleGetStarted}>
            Get Started
          </button>
        </div>
      )}
    </div>
  )
}
