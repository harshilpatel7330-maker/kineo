import { useState } from 'react'
import './GoalSetup.css'

const GOAL_TYPES = [
  { id: 'race',     emoji: '🏁', label: 'A race or event',           sub: 'Training for a specific race distance and date' },
  { id: 'strength', emoji: '🏋️', label: 'A strength goal',          sub: 'Lift a target weight, compete, or build specific strength' },
  { id: 'fitness',  emoji: '🔄', label: 'Consistent training habit', sub: 'Hit a target number of training days per week' },
]

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function GoalSetup({ onSave, onSkip, initialValues = {} }) {
  const [goalType,      setGoalType]      = useState(initialValues.goalType ?? null)
  const [subStep,       setSubStep]       = useState(initialValues.goalType ? 'details' : 'select')
  const [goalName,      setGoalName]      = useState(initialValues.goalName ?? '')
  const [goalDate,      setGoalDate]      = useState(initialValues.goalDate ?? '')
  const [goalWeeklyVol, setGoalWeeklyVol] = useState(
    initialValues.goalWeeklyVolume != null ? String(initialValues.goalWeeklyVolume) : ''
  )
  const [trainingDays, setTrainingDays] = useState(
    initialValues.goalType === 'fitness' && initialValues.goalWeeklyVolume != null
      ? initialValues.goalWeeklyVolume
      : null
  )

  const canSave = (() => {
    if (!goalType) return false
    if (goalType === 'race') return goalName.trim() !== '' && goalDate !== ''
    if (goalType === 'strength') return goalName.trim() !== ''
    if (goalType === 'fitness') return trainingDays != null
    return false
  })()

  function handleSave() {
    if (!canSave) return
    onSave({
      goalType,
      goalName: goalType === 'fitness'
        ? `Train ${trainingDays}x per week`
        : goalName.trim() || null,
      goalDate: goalDate || null,
      goalWeeklyVolume: goalType === 'fitness'
        ? trainingDays
        : goalWeeklyVol !== '' ? parseInt(goalWeeklyVol, 10) : null,
    })
  }

  if (subStep === 'select') {
    return (
      <div className="goal-setup">
        <h2 className="goal-setup__title">What are you training toward?</h2>
        <p className="goal-setup__sub">This helps personalise your daily recommendations</p>
        <div className="goal-setup__options">
          {GOAL_TYPES.map(t => (
            <button
              key={t.id}
              className={`goal-setup__option ${goalType === t.id ? 'selected' : ''}`}
              onClick={() => { setGoalType(t.id); setSubStep('details') }}
            >
              <span className="goal-setup__option-emoji">{t.emoji}</span>
              <span className="goal-setup__option-text">
                <span className="goal-setup__option-label">{t.label}</span>
                <span className="goal-setup__option-sub">{t.sub}</span>
              </span>
            </button>
          ))}
        </div>
        {onSkip && (
          <button className="goal-setup__skip" onClick={onSkip}>
            Skip for now
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="goal-setup">
      <button className="goal-setup__back" onClick={() => setSubStep('select')}>← Back</button>

      {goalType === 'race' && (
        <>
          <h2 className="goal-setup__title">Tell us about your race</h2>
          <div className="goal-setup__field">
            <label className="goal-setup__label">What&apos;s the race?</label>
            <input
              type="text"
              className="goal-setup__input"
              placeholder="e.g. Half Marathon, 10K"
              value={goalName}
              onChange={e => setGoalName(e.target.value)}
            />
          </div>
          <div className="goal-setup__field">
            <label className="goal-setup__label">When is it?</label>
            <input
              type="date"
              className="goal-setup__input"
              value={goalDate}
              min={todayISO()}
              onChange={e => setGoalDate(e.target.value)}
            />
          </div>
          <div className="goal-setup__field">
            <label className="goal-setup__label">
              Current weekly mileage (km) <span className="goal-setup__optional">optional</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              className="goal-setup__input"
              placeholder="e.g. 30"
              value={goalWeeklyVol}
              onChange={e => setGoalWeeklyVol(e.target.value)}
            />
          </div>
        </>
      )}

      {goalType === 'strength' && (
        <>
          <h2 className="goal-setup__title">Tell us about your goal</h2>
          <div className="goal-setup__field">
            <label className="goal-setup__label">What&apos;s the goal?</label>
            <input
              type="text"
              className="goal-setup__input"
              placeholder="e.g. Squat 140kg, compete in powerlifting"
              value={goalName}
              onChange={e => setGoalName(e.target.value)}
            />
          </div>
          <div className="goal-setup__field">
            <label className="goal-setup__label">
              Target date <span className="goal-setup__optional">optional</span>
            </label>
            <input
              type="date"
              className="goal-setup__input"
              value={goalDate}
              min={todayISO()}
              onChange={e => setGoalDate(e.target.value)}
            />
          </div>
          <div className="goal-setup__field">
            <label className="goal-setup__label">
              Current weekly sessions <span className="goal-setup__optional">optional</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              className="goal-setup__input"
              placeholder="e.g. 4"
              value={goalWeeklyVol}
              onChange={e => setGoalWeeklyVol(e.target.value)}
            />
          </div>
        </>
      )}

      {goalType === 'fitness' && (
        <>
          <h2 className="goal-setup__title">How many days per week?</h2>
          <p className="goal-setup__sub">Set a weekly training frequency target</p>
          <div className="goal-setup__days-row">
            {[1, 2, 3, 4, 5, 6, 7].map(n => (
              <button
                key={n}
                className={`goal-setup__day-btn ${trainingDays === n ? 'selected' : ''}`}
                onClick={() => setTrainingDays(n)}
              >
                {n}
              </button>
            ))}
          </div>
          {trainingDays != null && (
            <p className="goal-setup__days-hint">
              {trainingDays} day{trainingDays !== 1 ? 's' : ''} per week
            </p>
          )}
        </>
      )}

      <button className="goal-setup__save" disabled={!canSave} onClick={handleSave}>
        Save Goal
      </button>
      {onSkip && (
        <button className="goal-setup__skip" onClick={onSkip}>
          Skip for now
        </button>
      )}
    </div>
  )
}
