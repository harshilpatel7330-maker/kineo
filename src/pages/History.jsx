import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { mapRecommendation } from '../utils/recommendationMapper'
import './History.css'

const ATHLETE_ID = '00000000-0000-0000-0000-000000000001'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function calcReadiness(checkin) {
  if (!checkin) return null
  const { sleep, stress, fatigue, soreness } = checkin
  const score = ((6 - fatigue) + (6 - soreness) + sleep + (6 - stress)) / 16 * 100
  return Math.round(score)
}

function HistoryCard({ row, expanded, onToggle }) {
  const mapped = mapRecommendation(row.decision)
  const readiness = calcReadiness(row.signals_used?.checkin)

  return (
    <article className="history-card">
      <button type="button" className="history-card__header" onClick={onToggle}>
        <span
          className="history-card__dot"
          style={{ backgroundColor: mapped.bgColor }}
          aria-hidden="true"
        />
        <div className="history-card__info">
          <span className="history-card__date">{formatDate(row.created_at)}</span>
          <span className="history-card__label">{mapped.label}</span>
          {readiness !== null && (
            <span className="history-card__readiness">Readiness: {readiness}%</span>
          )}
        </div>
        <span
          className={`history-card__chevron${expanded ? ' history-card__chevron--open' : ''}`}
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      {expanded && (
        <div className="history-card__body">
          <div className="history-card__section">
            <span className="history-card__section-title">Why:</span>
            <ul className="history-card__list">
              {(row.reasons ?? []).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
          <div className="history-card__section">
            <span className="history-card__section-title">Action:</span>
            <p className="history-card__text">{row.action}</p>
          </div>
          {row.watch_for && (
            <p className="history-card__watch">
              <span className="history-card__watch-label">Watch for:</span>{' '}
              {row.watch_for}
            </p>
          )}
        </div>
      )}
    </article>
  )
}

export default function History() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    async function fetchHistory() {
      const { data, error } = await supabase
        .from('recommendation_outputs')
        .select('id, created_at, decision, reasons, action, watch_for, signals_used')
        .eq('athlete_id', ATHLETE_ID)
        .order('created_at', { ascending: false })

      if (error) console.error('Failed to fetch history:', error)
      setRows(data ?? [])
      setLoading(false)
    }

    fetchHistory()
  }, [])

  if (loading) {
    return (
      <div className="history history--loading">
        <div className="history__spinner" aria-label="Loading" />
        <p className="history__loading-text">Loading your history…</p>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="history history--empty">
        <span className="history__empty-emoji" aria-hidden="true">
          📋
        </span>
        <p className="history__empty-title">No check-ins yet</p>
        <Link to="/checkin" className="history__empty-btn">
          Start Your First Check In
        </Link>
      </div>
    )
  }

  return (
    <div className="history">
      <header className="history__header">
        <h1 className="history__title">Your History</h1>
        <p className="history__subtitle">
          {rows.length} check-in{rows.length === 1 ? '' : 's'} logged
        </p>
      </header>

      <div className="history__list">
        {rows.map((row, index) => (
          <HistoryCard
            key={row.id ?? `${row.created_at}-${index}`}
            row={row}
            expanded={expandedId === (row.id ?? `${row.created_at}-${index}`)}
            onToggle={() => {
              const key = row.id ?? `${row.created_at}-${index}`
              setExpandedId((current) => (current === key ? null : key))
            }}
          />
        ))}
      </div>
    </div>
  )
}
