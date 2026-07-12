import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PROTOCOLS } from '../utils/injuryProtocols'
import { setAthleteMode } from '../utils/athleteMode'
import './Onboarding.css'

// ── Injury selection data ────────────────────────────────────────────────────

const INJURY_ORDER = [
  'shin-splints', 'it-band', 'plantar-fasciitis', 'patellar-tendinopathy',
  'achilles-tendinopathy', 'stress-fracture-risk', 'rotator-cuff',
  'lower-back-strain', 'elbow-tendinopathy',
]

const INJURY_META = {
  'shin-splints':          { name: 'Shin Splints',                   site: 'Shin / lower leg' },
  'it-band':               { name: 'IT Band Syndrome',               site: 'Outer knee' },
  'plantar-fasciitis':     { name: 'Plantar Fasciitis',              site: 'Heel / bottom of foot' },
  'patellar-tendinopathy': { name: 'Patellar Tendinopathy',          site: 'Below the kneecap' },
  'achilles-tendinopathy': { name: 'Achilles Tendinopathy',          site: 'Back of ankle' },
  'stress-fracture-risk':  { name: 'Stress Reaction / Fracture Risk', site: 'Shin or heel bone' },
  'rotator-cuff':          { name: 'Rotator Cuff Strain',            site: 'Shoulder' },
  'lower-back-strain':     { name: 'Lower Back Strain',              site: 'Lower back' },
  'elbow-tendinopathy':    { name: 'Elbow Tendinopathy',             site: 'Elbow / forearm' },
}

// ── Pathway / goals data (prevention path) ──────────────────────────────────

const PATHWAYS = [
  { id: 'runner',       emoji: '🏃', label: 'Runner',               sub: '5K · 10K · Half · Marathon · General running' },
  { id: 'recreational', emoji: '💪', label: 'Recreational Athlete', sub: 'Lifting · Group fitness · Pickup sports · General performance' },
]

const GOALS = [
  { id: 'race-prep',         icon: '🎯', label: 'Race Preparation',      sub: 'Training for a specific race distance and date', runnerOnly: true },
  { id: 'consistency',       icon: '🔄', label: 'Training Consistency',  sub: 'Build a reliable weekly training habit' },
  { id: 'injury-prevention', icon: '🛡️', label: 'Injury Prevention',    sub: 'Manage load increases safely' },
  { id: 'performance',       icon: '⚡', label: 'Improve Performance',   sub: 'Get stronger, faster, more efficient' },
  { id: 'return',            icon: '📈', label: 'Return to Training',    sub: 'Coming back from injury or a break' },
]

// ── Step sequence ────────────────────────────────────────────────────────────

function getSteps(mode) {
  if (!mode) return ['fork']
  if (mode === 'return-to-sport') return ['fork', 'injury-select', 'injury-date', 'rts-welcome']
  return ['fork', 'pathway', 'goals', 'baseline']
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysSince(dateStr) {
  if (!dateStr) return 1
  const onset = new Date(dateStr + 'T12:00:00')
  const now   = new Date()
  now.setHours(12, 0, 0, 0)
  return Math.max(1, Math.round((now - onset) / 86400000) + 1)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate()

  // Shared state
  const [stepIndex, setStepIndex] = useState(0)
  const [mode,      setMode]      = useState(null)   // 'return-to-sport' | 'prevention'

  // Return-to-sport state
  const [injuryId,       setInjuryId]       = useState(null)
  const [injuryOnsetDate, setInjuryOnsetDate] = useState(todayISO())

  // Prevention state
  const [pathway, setPathway] = useState(null)
  const [goals,   setGoals]   = useState([])

  const steps    = getSteps(mode)
  const step     = steps[stepIndex]
  const progress = ((stepIndex + 1) / steps.length) * 100

  function goNext() {
    if (stepIndex < steps.length - 1) setStepIndex(i => i + 1)
  }

  function toggleGoal(id) {
    setGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id])
  }

  function selectMode(selected) {
    setMode(selected)
    setStepIndex(1)   // advance past fork immediately on selection
  }

  function finishPrevention() {
    localStorage.setItem('kineo_profile', JSON.stringify({ pathway, goals }))
    setAthleteMode({ mode: 'prevention', injuryId: null, injuryOnsetDate: null, injuryName: null })
    localStorage.setItem('kineo_setup_done', 'true')
    navigate('/dashboard')
  }

  function finishRts() {
    const injuryName = injuryId === 'unclassified' ? "I'm not sure" : (INJURY_META[injuryId]?.name ?? null)
    localStorage.setItem('kineo_profile', JSON.stringify({ pathway: null, goals: ['return'] }))
    setAthleteMode({ mode: 'return-to-sport', injuryId, injuryOnsetDate, injuryName })
    localStorage.setItem('kineo_setup_done', 'true')
    navigate('/recovery')
  }

  const visibleGoals = GOALS.filter(g => !g.runnerOnly || pathway === 'runner')

  // For RTS welcome screen
  const injury        = injuryId ? INJURY_META[injuryId] ?? { name: "I'm not sure", site: null } : null
  const protocol      = injuryId ? PROTOCOLS[injuryId] : null
  const recoveryDay   = daysSince(injuryOnsetDate)

  return (
    <div className="onboarding">
      <div className="onboarding__progress">
        <div className="onboarding__progress-bar" style={{ width: `${progress}%` }} />
      </div>

      {/* ── Fork ── */}
      {step === 'fork' && (
        <div className="onboarding__step">
          <h1 className="onboarding__title">What brings you to Kineo?</h1>
          <p className="onboarding__subtitle">Choose the path that fits your situation right now</p>

          <div className="onboarding__fork-cards">
            <button
              className="onboarding__fork-card"
              onClick={() => selectMode('return-to-sport')}
            >
              <span className="onboarding__fork-card-emoji">🩹</span>
              <span className="onboarding__fork-card-label">I'm recovering from an injury</span>
              <span className="onboarding__fork-card-sub">
                Get a structured return-to-sport protocol and daily guidance for your specific injury
              </span>
            </button>

            <button
              className="onboarding__fork-card"
              onClick={() => selectMode('prevention')}
            >
              <span className="onboarding__fork-card-emoji">🏋️</span>
              <span className="onboarding__fork-card-label">I want to train smarter</span>
              <span className="onboarding__fork-card-sub">
                Track load, HRV, and recovery to stay injury-free and hit your performance goals
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── Injury selection (RTS) ── */}
      {step === 'injury-select' && (
        <div className="onboarding__step">
          <h1 className="onboarding__title">Which injury are you recovering from?</h1>
          <p className="onboarding__subtitle">Select the closest match — you can refine it later</p>

          <div className="onboarding__injury-list">
            {INJURY_ORDER.map(id => {
              const meta = INJURY_META[id]
              const proto = PROTOCOLS[id]
              const desc  = proto?.description?.split('.')[0] + '.'
              return (
                <button
                  key={id}
                  className={`onboarding__injury-card ${injuryId === id ? 'selected' : ''}`}
                  onClick={() => setInjuryId(id)}
                >
                  <div className="onboarding__injury-card-main">
                    <span className="onboarding__injury-card-name">{meta.name}</span>
                    <span className="onboarding__injury-card-site">{meta.site}</span>
                  </div>
                  <p className="onboarding__injury-card-desc">{desc}</p>
                </button>
              )
            })}
            <button
              className={`onboarding__injury-card onboarding__injury-card--unsure ${injuryId === 'unclassified' ? 'selected' : ''}`}
              onClick={() => setInjuryId('unclassified')}
            >
              <div className="onboarding__injury-card-main">
                <span className="onboarding__injury-card-name">I'm not sure</span>
              </div>
              <p className="onboarding__injury-card-desc">
                We'll monitor your pain patterns and suggest a protocol as more information comes in.
              </p>
            </button>
          </div>

          <button className="onboarding__continue" disabled={!injuryId} onClick={goNext}>
            Continue
          </button>
        </div>
      )}

      {/* ── Injury onset date (RTS) ── */}
      {step === 'injury-date' && (
        <div className="onboarding__step">
          <h1 className="onboarding__title">When did this start?</h1>
          <p className="onboarding__subtitle">
            This helps us show how far you've come and when you might be ready to train fully again.
          </p>

          <div className="onboarding__date-quicksels">
            <button
              className={`onboarding__date-quicksel ${injuryOnsetDate === todayISO() ? 'selected' : ''}`}
              onClick={() => setInjuryOnsetDate(todayISO())}
            >
              Today
            </button>
            <button
              className={`onboarding__date-quicksel ${injuryOnsetDate === daysAgoISO(5) ? 'selected' : ''}`}
              onClick={() => setInjuryOnsetDate(daysAgoISO(5))}
            >
              This week
            </button>
            <button
              className={`onboarding__date-quicksel ${injuryOnsetDate === daysAgoISO(14) ? 'selected' : ''}`}
              onClick={() => setInjuryOnsetDate(daysAgoISO(14))}
            >
              2+ weeks ago
            </button>
          </div>

          <div className="onboarding__date-field">
            <label className="onboarding__date-label">Or pick a specific date</label>
            <input
              type="date"
              className="onboarding__date-input"
              value={injuryOnsetDate}
              max={todayISO()}
              onChange={e => setInjuryOnsetDate(e.target.value)}
            />
          </div>

          <button className="onboarding__continue" onClick={goNext}>
            Continue
          </button>
        </div>
      )}

      {/* ── Prevention: pathway ── */}
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

      {/* ── Prevention: goals ── */}
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

      {/* ── Prevention: baseline explanation ── */}
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

          <button className="onboarding__continue" onClick={finishPrevention}>
            Get Started
          </button>
        </div>
      )}

      {/* ── Return-to-sport welcome ── */}
      {step === 'rts-welcome' && (
        <div className="onboarding__step">
          <div className="onboarding__rts-welcome">
            <div className="onboarding__rts-check">✅</div>
            <h1 className="onboarding__title">Your recovery protocol is ready</h1>

            <div className="onboarding__rts-injury-badge">
              <span className="onboarding__rts-injury-name">
                {injury?.name ?? 'Custom protocol'}
              </span>
            </div>

            <div className="onboarding__rts-day-badge">
              <span className="onboarding__rts-day-num">Day {recoveryDay}</span>
              <span className="onboarding__rts-day-label">of recovery</span>
            </div>

            {protocol && (
              <div className="onboarding__rts-action-card">
                <p className="onboarding__rts-action-label">TODAY'S FIRST ACTION</p>
                <p className="onboarding__rts-action-text">{protocol.immediateActions[0]}</p>
              </div>
            )}

            {protocol && (
              <p className="onboarding__rts-disclaimer">{protocol.disclaimer}</p>
            )}

            <button className="onboarding__continue" onClick={finishRts}>
              Start Recovery
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
