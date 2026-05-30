import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { mapRecommendation } from '../utils/recommendationMapper'
import './Recommendation.css'

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function calcReadiness({ sleep, stress, fatigue, soreness }) {
  const score = ((6 - fatigue) + (6 - soreness) + sleep + (6 - stress)) / 16 * 100
  return Math.round(score)
}

function readinessColor(score) {
  if (score > 70) return 'green'
  if (score >= 40) return 'amber'
  return 'red'
}

function loadLastResult() {
  try {
    const raw = localStorage.getItem('kineo_last_result')
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export default function Recommendation() {
  const navigate = useNavigate()
  const data = useMemo(() => loadLastResult(), [])

  if (!data?.result || !data?.checkin) {
    return (
      <div className="recommendation recommendation--empty">
        <p className="recommendation__empty-text">No check-in found</p>
        <Link to="/checkin" className="recommendation__btn recommendation__btn--primary">
          Start a Check In
        </Link>
      </div>
    )
  }

  const { result, checkin, signals } = data
  const mapped = mapRecommendation(result.decision)
  const readiness = calcReadiness(checkin)
  const readinessClass = readinessColor(readiness)
  const hasWearableData = signals?.hrvVsBaselinePct != null

  function handleWearableLink() {
    alert('Wearable sync coming soon!')
  }

  return (
    <div className="recommendation">
      <header className="recommendation__header">
        <p className="recommendation__eyebrow">Today&apos;s Recommendation</p>
        <p className="recommendation__date">{formatToday()}</p>
      </header>

      <div
        className="recommendation__decision"
        style={{ backgroundColor: mapped.bgColor }}
      >
        <span className="recommendation__decision-emoji" aria-hidden="true">
          {mapped.emoji}
        </span>
        <h1 className="recommendation__decision-label">{mapped.label}</h1>
        <span className="recommendation__confidence">{result.confidence}</span>
        {hasWearableData ? (
          <span className="recommendation__data-pill recommendation__data-pill--wearable">
            ⌚ Wearable data included
          </span>
        ) : (
          <div className="recommendation__data-quality">
            <span className="recommendation__data-pill recommendation__data-pill--self">
              📱 Based on self-report
            </span>
            <button
              type="button"
              className="recommendation__data-link"
              onClick={handleWearableLink}
            >
              Connect a wearable for more accurate recommendations
            </button>
          </div>
        )}
      </div>

      <section className="recommendation__card">
        <h2 className="recommendation__card-title">Why today?</h2>
        <ul className="recommendation__list">
          {result.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </section>

      <section className="recommendation__card">
        <h2 className="recommendation__card-title">What to do</h2>
        <p className="recommendation__action">{result.action}</p>
        <div className="recommendation__watch">
          <span className="recommendation__watch-label">Watch for</span>
          <p className="recommendation__watch-text">{result.watchFor}</p>
        </div>
      </section>

      <section className={`recommendation__readiness recommendation__readiness--${readinessClass}`}>
        <span className="recommendation__readiness-value">{readiness}%</span>
        <span className="recommendation__readiness-label">Readiness Score</span>
      </section>

      <div className="recommendation__actions">
        <button
          type="button"
          className="recommendation__btn recommendation__btn--outline"
          onClick={() => navigate('/checkin')}
        >
          Check in again
        </button>
        <button
          type="button"
          className="recommendation__btn recommendation__btn--primary"
          onClick={() => navigate('/dashboard')}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  )
}
