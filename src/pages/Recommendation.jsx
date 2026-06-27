import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { translateReasons } from '../utils/reasonTranslator'
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

function readinessTier(readiness) {
  if (readiness > 70) return 'green'
  if (readiness > 40) return 'amber'
  return 'red'
}

function DataQuality({ dataSource }) {
  if (dataSource === 'wearable') {
    return (
      <div className="recommendation__data-quality">
        <span className="recommendation__data-pill recommendation__data-pill--wearable">
          ⌚ Wearable data included
        </span>
      </div>
    )
  }
  if (dataSource === 'wearable_no_baseline') {
    return (
      <div className="recommendation__data-quality">
        <span className="recommendation__data-pill recommendation__data-pill--wearable">
          ⌚ Wearable data — building baseline
        </span>
      </div>
    )
  }
  return (
    <div className="recommendation__data-quality">
      <span className="recommendation__data-pill recommendation__data-pill--self">
        📱 Based on self-report
      </span>
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
      <div className="recommendation recommendation--empty">
        <p className="recommendation__empty-text">No check-in found</p>
        <button onClick={() => navigate('/checkin')} className="recommendation__btn recommendation__btn--primary">
          Check In Now
        </button>
      </div>
    )
  }

  const { result, checkin, signals } = data
  const decision = DECISION_MAP[result.decision] ?? DECISION_MAP.MAINTAIN
  const readiness = calcReadiness(checkin)
  const tier = readiness !== null ? readinessTier(readiness) : null
  const dataSource = signals?.dataSource ?? 'self_report'

  return (
    <div className="recommendation">
      <div className="recommendation__header">
        <p className="recommendation__eyebrow">Today's Recommendation</p>
        <p className="recommendation__date">{formatDate()}</p>
      </div>

      {/* Cumulative load warning */}
      {result.warnings?.length > 0 && (
        <div className="recommendation__card">
          <h3 className="recommendation__card-title">⚠️ Worth noting</h3>
          <p className="recommendation__action">{result.warnings[0]}</p>
        </div>
      )}

      {/* Decision card */}
      <div className="recommendation__decision" style={{ background: decision.color }}>
        <div className="recommendation__decision-emoji">{decision.emoji}</div>
        <h2 className="recommendation__decision-label">{decision.label}</h2>
        <span className="recommendation__confidence">{result.confidence} CONFIDENCE</span>
        <DataQuality dataSource={dataSource} />
      </div>

      {/* Planned Workout */}
      <div className="recommendation__card">
        <p className="recommendation__plan-eyebrow">TODAY'S PLAN</p>
        {(result.decision === 'MODIFY' || result.decision === 'RECOVER') ? (
          <>
            <p className="recommendation__plan-text recommendation__plan-text--crossed">
              Your regular training session
            </p>
            <div className="recommendation__instead">
              <p className="recommendation__instead-label">RECOMMENDED INSTEAD</p>
              <p className="recommendation__instead-action">{result.action}</p>
            </div>
          </>
        ) : (
          <p className="recommendation__plan-text">Your regular training session</p>
        )}
      </div>

      {/* Why today */}
      {result.reasons?.length > 0 && (
        <div className="recommendation__card">
          <h3 className="recommendation__card-title">Why today?</h3>
          <ul className="recommendation__list">
            {translateReasons(result.reasons).map((r, i) => (
              <li key={i}>
                {r.plain}
                {r.plain !== r.technical && (
                  <details className="rec__reason-detail">
                    <summary>See the data</summary>
                    <p>{r.technical}</p>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action */}
      <div className="recommendation__card">
        <h3 className="recommendation__card-title">What to do</h3>
        <p className="recommendation__action">{result.action}</p>
        {result.watchFor && (
          <div className="recommendation__watch">
            <span className="recommendation__watch-label">Watch for</span>
            <p className="recommendation__watch-text">{result.watchFor}</p>
          </div>
        )}
      </div>

      {/* Readiness score */}
      {readiness !== null && (
        <div className={`recommendation__readiness recommendation__readiness--${tier}`}>
          <div className="recommendation__readiness-value">{readiness}%</div>
          <div className="recommendation__readiness-label">Readiness Score</div>
        </div>
      )}

      {/* Buttons */}
      <div className="recommendation__actions">
        <button className="recommendation__btn recommendation__btn--outline" onClick={() => navigate('/checkin')}>
          Check in again
        </button>
        <button className="recommendation__btn recommendation__btn--primary" onClick={() => navigate('/dashboard')}>
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}