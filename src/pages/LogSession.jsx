import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { computeAndPersistLoadMetrics } from '../utils/loadCalculator'
import { getAthleteId } from '../utils/athleteId'
import './CheckIn.css'

const ATHLETE_ID = getAthleteId()

const WORKOUT_TYPES = [
  { value: 'run',           label: 'Run' },
  { value: 'bike',          label: 'Bike' },
  { value: 'swim',          label: 'Swim' },
  { value: 'strength',      label: 'Strength' },
  { value: 'cross-training',label: 'Cross-training' },
  { value: 'other',         label: 'Other' },
]

const DISTANCE_TYPES = new Set(['run', 'bike', 'swim'])

const INTENSITY_OPTIONS = [
  { value: 'easy',     label: 'Easy' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'hard',     label: 'Hard' },
]

// RPE 1–10 descriptors
const RPE_LABEL = [
  '', 'Very Easy', 'Easy', 'Light', 'Moderate',
  'Somewhat Hard', 'Hard', 'Hard', 'Very Hard', 'Very Hard', 'Max Effort',
]
const RPE_EMOJI = ['', '😌', '😌', '🙂', '🙂', '😐', '😓', '😓', '😤', '😤', '🤯']

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function LogSession() {
  const navigate = useNavigate()
  const [workoutType, setWorkoutType]     = useState('run')
  const [distanceKm, setDistanceKm]       = useState('')
  const [durationMin, setDurationMin]     = useState('')
  const [intensityLabel, setIntensityLabel] = useState(null)
  const [rpe, setRpe]                     = useState(5)
  const [loading, setLoading]             = useState(false)

  const showDistance = DISTANCE_TYPES.has(workoutType)

  async function handleSubmit() {
    if (!durationMin) {
      alert('Please enter a duration')
      return
    }
    if (!intensityLabel) {
      alert('Please select a planned intensity')
      return
    }
    setLoading(true)
    try {
      const today = todayLocal()

      const { data: row, error } = await supabase
        .from('training_sessions')
        .insert({
          athlete_id:     ATHLETE_ID,
          date:           today,
          workout_type:   workoutType,
          distance_km:    showDistance && distanceKm ? parseFloat(distanceKm) : null,
          duration_min:   parseInt(durationMin, 10),
          rpe,
          intensity_label: intensityLabel,
          source:         'manual',
        })
        .select('id')
        .single()

      if (error) {
        console.error('Failed to insert training session:', error)
        return
      }

      await computeAndPersistLoadMetrics(ATHLETE_ID, row.id, today)

      navigate('/dashboard')
    } catch (err) {
      console.error('Log session error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="check-in">
      <div className="check-in__header">
        <h1 className="check-in__title">Log a session</h1>
        <p className="check-in__subtitle">Record what you did so your load signals stay accurate</p>
      </div>

      {/* Workout type */}
      <div className="check-in__field">
        <label className="check-in__label" htmlFor="workout-type">Workout type</label>
        <select
          id="workout-type"
          className="check-in__select"
          value={workoutType}
          onChange={e => setWorkoutType(e.target.value)}
        >
          {WORKOUT_TYPES.map(w => (
            <option key={w.value} value={w.value}>{w.label}</option>
          ))}
        </select>
      </div>

      {/* Distance — only for Run / Bike / Swim */}
      {showDistance && (
        <div className="check-in__field">
          <label className="check-in__label">Distance</label>
          <div className="check-in__input-row">
            <input
              type="number"
              placeholder="e.g. 5.2"
              step="0.1"
              min="0"
              value={distanceKm}
              onChange={e => setDistanceKm(e.target.value)}
            />
            <span className="check-in__unit">km</span>
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="check-in__field">
        <label className="check-in__label">Duration</label>
        <div className="check-in__input-row">
          <input
            type="number"
            placeholder="e.g. 45"
            min="1"
            value={durationMin}
            onChange={e => setDurationMin(e.target.value)}
          />
          <span className="check-in__unit">min</span>
        </div>
      </div>

      {/* Planned intensity */}
      <div className="check-in__field">
        <span className="check-in__label">Planned intensity</span>
        <div className="check-in__options">
          {INTENSITY_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              className={`check-in__option-btn ${intensityLabel === o.value ? 'selected' : ''}`}
              onClick={() => setIntensityLabel(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Actual effort (RPE 1–10) */}
      <div className="check-in__field">
        <div className="check-in__label-row">
          <span className="check-in__label">Actual effort (RPE {rpe})</span>
          <span className="check-in__emoji">{RPE_EMOJI[rpe]}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={rpe}
          onChange={e => setRpe(parseInt(e.target.value, 10))}
          className="check-in__slider check-in__slider--neg"
        />
        <div className="check-in__track-labels">
          <span className="check-in__track-label">Easy (1)</span>
          <span className="check-in__track-label">Max (10)</span>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#888' }}>
          {RPE_LABEL[rpe]}
        </p>
      </div>

      <button
        type="button"
        className="check-in__submit"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading ? 'Saving…' : 'Log Session'}
      </button>
    </div>
  )
}
