import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { parseAppleHealthZip } from '../utils/appleHealthParser'
import { importAppleHealthData } from '../utils/appleHealthImporter'
import { getAthleteId } from '../utils/athleteId'
import './ImportHealthData.css'

const ATHLETE_ID = getAthleteId()

const STEPS = [
  {
    n: '1',
    icon: '📱',
    text: 'Open the Health app on your iPhone',
  },
  {
    n: '2',
    icon: '👤',
    text: 'Tap your profile picture in the top right',
  },
  {
    n: '3',
    icon: '📤',
    text: 'Scroll down and tap "Export All Health Data"',
  },
  {
    n: '4',
    icon: '✅',
    text: 'Tap "Export" on the confirmation dialog — this may take a minute',
  },
  {
    n: '5',
    icon: '📂',
    text: 'When the Share sheet appears, select "Save to Files" and note where you saved it, then upload it below',
  },
]

function formatDateRange(range) {
  if (!range) return ''
  const parts = range.split(' – ')
  const fmt = (s) => {
    if (!s) return ''
    const d = new Date(s + 'T12:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  return parts.length === 2 ? `${fmt(parts[0])} – ${fmt(parts[1])}` : fmt(parts[0])
}

export default function ImportHealthData({ onSkip, onComplete, inline = false }) {
  const navigate = useNavigate()
  const fileRef  = useRef()

  const [phase, setPhase]         = useState('idle')   // idle | parsing | importing | done | error
  const [progress, setProgress]   = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [result, setResult]       = useState(null)
  const [errorMsg, setErrorMsg]   = useState('')

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.endsWith('.zip')) {
      setErrorMsg('Please select a .zip file (your Apple Health export).')
      return
    }
    setErrorMsg('')
    runImport(file)
  }

  async function runImport(file) {
    setPhase('parsing')
    setProgress(5)
    setProgressLabel('Reading your Apple Health export…')

    try {
      const parsed = await parseAppleHealthZip(file, {
        onProgress: ({ pct }) => {
          setProgress(Math.max(5, Math.round(pct * 0.5)))
          setProgressLabel('Parsing HRV, sleep, and workout data…')
        },
      })

      setPhase('importing')
      setProgress(50)
      setProgressLabel('Importing to your profile…')

      const summary = await importAppleHealthData(ATHLETE_ID, parsed, {
        onProgress: ({ phase: p, pct, detail }) => {
          setProgress(pct)
          if (p === 'importing') setProgressLabel(`Importing check-in data… ${detail ?? ''}`)
          else if (p === 'workouts') setProgressLabel(`Importing workouts… ${detail ?? ''}`)
          else if (p === 'baseline') setProgressLabel('Rebuilding your baseline…')
          else if (p === 'done') setProgressLabel('Done!')
        },
      })

      setResult(summary)
      setPhase('done')
      if (onComplete) onComplete(summary)
    } catch (err) {
      console.error('Apple Health import error:', err)
      setErrorMsg(err.message ?? 'Something went wrong parsing the file. Make sure you selected an Apple Health export ZIP.')
      setPhase('error')
    }
  }

  function handleDone() {
    if (inline) {
      if (onComplete) onComplete(result)
    } else {
      navigate('/dashboard')
    }
  }

  if (phase === 'done' && result) {
    const { stats, dateRange, daysOfHrv, daysOfSleep, recentHrvDrop } = result
    return (
      <div className={`import-health ${inline ? 'import-health--inline' : ''}`}>
        <div className="import-health__done-icon">✅</div>
        <h2 className="import-health__done-title">Apple Health data imported</h2>

        <div className="import-health__summary-cards">
          {daysOfHrv > 0 && (
            <div className="import-health__summary-card">
              <div className="import-health__summary-num">{daysOfHrv}</div>
              <div className="import-health__summary-label">days of HRV data</div>
              {dateRange && <div className="import-health__summary-range">{formatDateRange(dateRange)}</div>}
            </div>
          )}
          {daysOfSleep > 0 && (
            <div className="import-health__summary-card">
              <div className="import-health__summary-num">{daysOfSleep}</div>
              <div className="import-health__summary-label">days of sleep data</div>
            </div>
          )}
          {stats.workoutsImported > 0 && (
            <div className="import-health__summary-card">
              <div className="import-health__summary-num">{stats.workoutsImported}</div>
              <div className="import-health__summary-label">workouts imported</div>
            </div>
          )}
        </div>

        <div className="import-health__stat-row">
          <span className="import-health__stat-label">New days added</span>
          <span className="import-health__stat-value">{stats.daysImported}</span>
        </div>
        <div className="import-health__stat-row">
          <span className="import-health__stat-label">Existing days filled in</span>
          <span className="import-health__stat-value">{stats.daysMerged}</span>
        </div>
        {stats.daysSkipped > 0 && (
          <div className="import-health__stat-row">
            <span className="import-health__stat-label">Already complete (skipped)</span>
            <span className="import-health__stat-value">{stats.daysSkipped}</span>
          </div>
        )}

        <p className="import-health__unlock">
          Your recommendations are now personalised to your actual physiology — not a 7-day estimate.
        </p>

        {recentHrvDrop && (
          <div className="import-health__notice import-health__notice--amber">
            <span>⚠️</span>
            <p>We noticed a significant HRV dip in your recent history. Today's check-in will help us understand your current recovery status.</p>
          </div>
        )}

        <button className="import-health__cta" onClick={handleDone}>
          {inline ? 'Continue' : 'Go to Dashboard'}
        </button>
      </div>
    )
  }

  if (phase === 'parsing' || phase === 'importing') {
    return (
      <div className={`import-health ${inline ? 'import-health--inline' : ''}`}>
        <div className="import-health__progress-wrap">
          <div className="import-health__progress-label">{progressLabel}</div>
          <div className="import-health__progress-track">
            <div className="import-health__progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <div className="import-health__progress-pct">{progress}%</div>
          <p className="import-health__progress-note">
            This may take a minute — Apple Health exports can be large.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`import-health ${inline ? 'import-health--inline' : ''}`}>
      {!inline && (
        <div className="import-health__header">
          <h1 className="import-health__title">Import Apple Health Data</h1>
          <p className="import-health__subtitle">
            Skip the 7-day wait. Import your history and get a personalised baseline from day one.
          </p>
        </div>
      )}

      {inline && (
        <div className="import-health__inline-header">
          <h2 className="import-health__inline-title">Import Apple Health data</h2>
          <p className="import-health__inline-sub">
            Skip the 7-day wait — your Apple Watch history builds your baseline instantly.
          </p>
        </div>
      )}

      <div className="import-health__steps">
        <p className="import-health__steps-title">How to export from the Health app:</p>
        {STEPS.map((s) => (
          <div key={s.n} className="import-health__step">
            <span className="import-health__step-icon">{s.icon}</span>
            <p className="import-health__step-text">{s.text}</p>
          </div>
        ))}
      </div>

      <div className="import-health__upload-area" onClick={() => fileRef.current?.click()}>
        <span className="import-health__upload-icon">📁</span>
        <p className="import-health__upload-label">Tap to select your export.zip</p>
        <p className="import-health__upload-hint">Accepts .zip files only</p>
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          className="import-health__file-input"
          onChange={handleFileChange}
        />
      </div>

      {errorMsg && (
        <p className="import-health__error">{errorMsg}</p>
      )}

      {phase === 'error' && (
        <button className="import-health__retry" onClick={() => { setPhase('idle'); setErrorMsg('') }}>
          Try again
        </button>
      )}

      {onSkip && (
        <button className="import-health__skip" onClick={onSkip}>
          Skip for now — I'll check in manually
        </button>
      )}

      <div className="import-health__notice import-health__notice--blue">
        <span>🔒</span>
        <p>Your health data stays on your device and is only synced to your private Kineo profile. We never share it.</p>
      </div>
    </div>
  )
}
