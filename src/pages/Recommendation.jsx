import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Recommendation.css'

const DECISION_MAP = {
  PUSH:     { label: 'Full Training',      color: '#22C55E', emoji: '💪' },
  MAINTAIN: { label: 'Moderate Training',  color: '#3B82F6', emoji: '🏃' },
  MODIFY:   { label: 'Deload Session',     color: '#F59E0B', emoji: '🔄' },
  RECOVER:  { label: 'Recovery Day',       color: '#EF4444', emoji: '😴' },
}

function formatDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })
}

function calcReadiness(checkin) {
  if (!checkin) return null
  const { sleep = 3, fatigue = 3, soreness = 3, stress = 3 } = checkin
  return Math.round(((6 - fatigue) + (6 - soreness) + sleep + (6 - stress)) / 16 * 100)
}

function DataSourcePill({ dataSource }) {
  if (dataSource === 'wearable') {
    return (
      <div className="rec__data-source green">
        <span>⌚ Wearable data included</span>
        <p>Your HRV and resting HR are being used for this recommendation</p>
      </div>
    )
  }
  if (dataSource === 'wearable_no_baseline') {
    return (
      <div className="rec__data-source amber">
        <span>⌚ Wearable data — building baseline</span>
        <p>Keep entering your stats daily — recommendations improve after 7 days of data</p>
      </div>
    )
  }
  return (
    <div className="rec__data-source grey">
      <span>📱 Based on self-report</span>
      <p>Add your resting HR and HRV tomorrow for more accurate recommendations</p>
      <details className="rec__how-to">
        <summary>How to find your stats</summary>
        <ul>
          <li>⌚ Apple Watch: Health app → Browse → Heart → Resting Heart Rate</li>
          <li>💍 Oura: Today tab → Readiness score</li>
          <li>⚫ WHOOP: Recovery screen → HRV</li>
          <li>📱 No wearable: Check your phone's Health app</li>
        </ul>
      </details>
    </div>
  )
}

export default function Recommendation() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    const stored = localStorage.getItem('kineo_last_result')
    if (stored) setData(JSON.parse(stored))
  }, [])

  if (!data) {
    return (
      <div className="rec rec--empty">
        <p>No check-in found</p>
        <button onClick={() => navigate('/checkin')} className="rec__btn-primary">
          Check In Now
        </button>
      </div>
    )
  }

  const { result, checkin, signals } = data
  const decision = DECISION_MAP[result.decision] ?? DECISION_MAP.MAINTAIN
  const readiness = calcReadiness(checkin)
  const readinessColor = readiness > 70 ? '#22C55E' : readiness > 40 ? '#F59E0B' : '#EF4444'
  const dataSource = signals?.dataSource ?? 'self_report'

  return (
    <div className="rec">
      <div className="rec__header">
        <p className="rec__header-label">Today's Recommendation</p>
        <p className="rec__date">{formatDate()}</p>
      </div>

      {/* Cumulative load warning */}
      {result.warnings?.length > 0 && (
        <div className="rec__warning-banner">
          ⚠️ {result.warnings[0]}
          <p className="rec__warning-note">
            Research shows this pattern significantly increases injury risk. 
            A deload week now prevents weeks of forced rest later.
          </p>
        </div>
      )}

      {/* Decision card */}
      <div className="rec__decision-card" style={{ background: decision.color }}>
        <div className="rec__decision-emoji">{decision.emoji}</div>
        <div className="rec__decision-label">{decision.label}</div>
        <div className="rec__confidence-badge">{result.confidence} confidence</div>
      </div>

      {/* Data source */}
      <DataSourcePill dataSource={dataSource} />

      {/* Why today */}
      {result.reasons?.length > 0 && (
        <div className="rec__card">
          <h3 className="rec__card-title">Why today?</h3>
          <ul className="rec__reasons">
            {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Action */}
      <div className="rec__card">
        <h3 className="rec__card-title">What to do</h3>
        <p className="rec__action">{result.action}</p>
        {result.watchFor && (
          <div className="rec__watch-for">
            <span className="rec__watch-label">WATCH FOR</span>
            <p>{result.watchFor}</p>
          </div>
        )}
      </div>

      {/* Readiness score */}
      {readiness !== null && (
        <div className="rec__readiness" style={{ borderColor: readinessColor }}>
          <div className="rec__readiness-score" style={{ color: readinessColor }}>
            {readiness}%
          </div>
          <div className="rec__readiness-label">Readiness Score</div>
        </div>
      )}

      {/* Buttons */}
      <button className="rec__btn-outline" onClick={() => navigate('/checkin')}>
        Check in again
      </button>
      <button className="rec__btn-primary" onClick={() => navigate('/dashboard')}>
        Go to Dashboard
      </button>
    </div>
  )
}