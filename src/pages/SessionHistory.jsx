import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { supabase } from '../supabaseClient'
import { getAthleteId } from '../utils/athleteId'
import { MILEAGE_BANDS } from '../athleteiq-engine'
import './History.css'
import './SessionHistory.css'

const ATHLETE_ID = getAthleteId()

const WORKOUT_LABELS = {
  run:              { emoji: '🏃', label: 'Run' },
  bike:             { emoji: '🚴', label: 'Bike' },
  swim:             { emoji: '🏊', label: 'Swim' },
  strength:         { emoji: '🏋️', label: 'Strength' },
  'cross-training': { emoji: '⚡', label: 'Cross-training' },
  other:            { emoji: '🎯', label: 'Other' },
}

const INTENSITY_COLOR = {
  easy:     '#22C55E',
  moderate: '#F59E0B',
  hard:     '#EF4444',
}

// Returns a YYYY-MM-DD string in local time.
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Returns a new Date set to Monday 00:00:00 local of the week containing `date`.
function getMondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()                    // 0=Sun…6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

// Produces 8 week buckets (oldest → newest) with total distance and bar color.
// Color is based on week-over-week % change using MILEAGE_BANDS thresholds.
//
// Hand-trace example (3 sessions):
//   Week N-1: 10 km run Mon + 5 km run Thu  → dist = 15 km, prior = 0 → gray
//   Week N:   18 km run Sun                 → dist = 18 km
//             changePct = (18 - 15) / 15 * 100 = 20.0%
//             20 >= MODIFY (20) && 20 < CRITICAL (40) → orange (#F97316)
function buildWeeklyChart(sessions) {
  const now = new Date()
  const thisMonday = getMondayOf(now)

  const weeks = []
  for (let i = 7; i >= 0; i--) {
    const start = new Date(thisMonday)
    start.setDate(thisMonday.getDate() - i * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)

    const startStr = localDateStr(start)
    const endStr   = localDateStr(end)

    const dist = sessions
      .filter(s => s.distance_km != null && s.date >= startStr && s.date <= endStr)
      .reduce((sum, s) => sum + s.distance_km, 0)

    weeks.push({
      label:    start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dist:     Math.round(dist * 10) / 10,
    })
  }

  return weeks.map((w, i) => {
    const priorDist = i > 0 ? weeks[i - 1].dist : null
    let fill
    if (priorDist === null || priorDist === 0) {
      fill = '#E5E4E7'
    } else {
      const pct = ((w.dist - priorDist) / priorDist) * 100
      if (pct < MILEAGE_BANDS.CAUTION)       fill = '#22C55E'
      else if (pct < MILEAGE_BANDS.MODIFY)   fill = '#F59E0B'
      else if (pct < MILEAGE_BANDS.CRITICAL) fill = '#F97316'
      else                                    fill = '#EF4444'
    }
    return { ...w, fill }
  })
}

function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function SessionCard({ session }) {
  const type     = WORKOUT_LABELS[session.workout_type] ?? { emoji: '🎯', label: session.workout_type }
  const dotColor = INTENSITY_COLOR[session.intensity_label] ?? '#E5E4E7'
  const load     = session.duration_min != null && session.rpe != null
    ? session.duration_min * session.rpe
    : null

  return (
    <article className="history-card">
      <div className="history-card__header session-card__header">
        <span className="history-card__dot" style={{ backgroundColor: dotColor }} aria-hidden="true" />
        <div className="history-card__info">
          <span className="history-card__date">{formatDate(session.date)}</span>
          <span className="history-card__label">{type.emoji} {type.label}</span>
          <div className="session-card__meta">
            {session.distance_km != null && (
              <span className="session-card__tag">{session.distance_km} km</span>
            )}
            {session.duration_min != null && (
              <span className="session-card__tag">{session.duration_min} min</span>
            )}
            {session.rpe != null && (
              <span className="session-card__tag">RPE {session.rpe}</span>
            )}
            {load != null && (
              <span className="session-card__tag session-card__tag--load">Load {load}</span>
            )}
          </div>
        </div>
        {session.intensity_label && (
          <span
            className="session-card__intensity-badge"
            style={{ color: dotColor }}
          >
            {session.intensity_label}
          </span>
        )}
      </div>
    </article>
  )
}

export default function SessionHistory() {
  const location = useLocation()
  const navigate  = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [showToast, setShowToast] = useState(location.state?.justLogged ?? false)

  // Clear the router state so back-nav doesn't replay the toast.
  useEffect(() => {
    if (location.state?.justLogged) {
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-dismiss the toast after 4 s.
  useEffect(() => {
    if (!showToast) return
    const t = setTimeout(() => setShowToast(false), 4000)
    return () => clearTimeout(t)
  }, [showToast])

  useEffect(() => {
    async function fetchSessions() {
      const { data, error } = await supabase
        .from('training_sessions')
        .select('id, date, workout_type, distance_km, duration_min, rpe, intensity_label')
        .eq('athlete_id', ATHLETE_ID)
        .order('date', { ascending: false })

      if (error) console.error('Failed to fetch sessions:', error)
      setSessions(data ?? [])
      setLoading(false)
    }
    fetchSessions()
  }, [])

  const chartData = buildWeeklyChart(sessions)

  if (loading) {
    return (
      <div className="history history--loading">
        <div className="history__spinner" aria-label="Loading" />
        <p className="history__loading-text">Loading sessions…</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="history history--empty">
        <span className="history__empty-emoji" aria-hidden="true">🏋️</span>
        <p className="history__empty-title">No sessions logged yet</p>
        <Link to="/log-session" className="history__empty-btn">
          Log Your First Session
        </Link>
      </div>
    )
  }

  return (
    <div className="history">
      {showToast && (
        <div className="checkin-nudge" role="status">
          <p className="checkin-nudge__text">
            Logged — this will factor into tomorrow's recommendation.
          </p>
        </div>
      )}

      <header className="history__header">
        <h1 className="history__title">Sessions</h1>
        <p className="history__subtitle">
          {sessions.length} session{sessions.length === 1 ? '' : 's'} logged
        </p>
      </header>

      <div className="sessions__chart-section">
        <p className="sessions__chart-title">Weekly distance (km)</p>
        <div className="sessions__chart-wrap">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--text)' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--text)' }}
                width={40}
              />
              <Bar dataKey="dist" radius={[5, 5, 0, 0]} maxBarSize={28}>
                {chartData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="sessions__chart-legend">
          <span style={{ color: '#22C55E' }}>● &lt;{MILEAGE_BANDS.CAUTION}%</span>
          <span style={{ color: '#F59E0B' }}>● {MILEAGE_BANDS.CAUTION}–{MILEAGE_BANDS.MODIFY}%</span>
          <span style={{ color: '#F97316' }}>● {MILEAGE_BANDS.MODIFY}–{MILEAGE_BANDS.CRITICAL}%</span>
          <span style={{ color: '#EF4444' }}>● &gt;{MILEAGE_BANDS.CRITICAL}%</span>
        </div>
      </div>

      <div className="history__list">
        {sessions.map(s => (
          <SessionCard key={s.id} session={s} />
        ))}
      </div>
    </div>
  )
}
