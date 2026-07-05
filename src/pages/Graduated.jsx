import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { getAthleteMode, setAthleteMode } from '../utils/athleteMode'
import { PROTOCOLS } from '../utils/injuryProtocols'
import { getAthleteId } from '../utils/athleteId'
import './Dashboard.css'
import './Graduated.css'

const ATHLETE_ID = getAthleteId()

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function computeTotalDays(onsetDateStr) {
  if (!onsetDateStr) return 1
  const onset = new Date(onsetDateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const diff = Math.round((today - onset) / 86400000) + 1
  return Math.max(1, diff)
}

// Build chart data spanning the full recovery arc from onset to today
function buildRecoveryArcData(painLogs, onsetDate) {
  if (!painLogs?.length) return []

  const scoreByDate = {}
  for (const row of painLogs) {
    scoreByDate[row.date] = row.pain_score
  }

  const start = new Date((onsetDate ?? painLogs[painLogs.length - 1]?.date ?? localToday()) + 'T12:00:00')
  const end   = new Date()
  end.setHours(12, 0, 0, 0)

  const totalDays = Math.max(1, Math.round((end - start) / 86400000))
  const labelEvery = Math.max(1, Math.floor(totalDays / 4))

  const days = []
  const cur  = new Date(start)
  let idx    = 0
  while (cur <= end) {
    const date  = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    const label = idx % labelEvery === 0 ? `${cur.getMonth() + 1}/${cur.getDate()}` : ''
    days.push({ date, label, score: date in scoreByDate ? scoreByDate[date] : null })
    cur.setDate(cur.getDate() + 1)
    idx++
  }
  return days
}

function Skeleton({ height = 100 }) {
  return <div className="recovery__skeleton" style={{ height }} />
}

export default function Graduated() {
  const navigate = useNavigate()
  const { injuryId, injuryOnsetDate, injuryName } = useMemo(() => getAthleteMode(), [])
  const protocol   = injuryId ? PROTOCOLS[injuryId] : null
  const totalDays  = computeTotalDays(injuryOnsetDate)
  const lastStep   = protocol?.returnToTraining?.[protocol.returnToTraining.length - 1]

  const [loading,       setLoading]       = useState(true)
  const [stats,         setStats]         = useState({ lowestPain: null, checkInCount: 0 })
  const [painLogs,      setPainLogs]      = useState([])

  useEffect(() => {
    async function load() {
      const startDate = injuryOnsetDate ?? '2000-01-01'
      const [rtsResult, painResult] = await Promise.all([
        supabase
          .from('rts_checkins')
          .select('pain_score')
          .eq('athlete_id', ATHLETE_ID),
        supabase
          .from('pain_logs')
          .select('pain_score, date')
          .eq('athlete_id', ATHLETE_ID)
          .gte('date', startDate)
          .order('date', { ascending: false }),
      ])

      const rtsRows = rtsResult.data ?? []
      const lowestPain = rtsRows.length > 0
        ? Math.min(...rtsRows.map(r => r.pain_score))
        : null

      setStats({ lowestPain, checkInCount: rtsRows.length })
      setPainLogs(painResult.data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const chartData = buildRecoveryArcData(painLogs, injuryOnsetDate)

  function handleContinuePrevention() {
    setAthleteMode({ mode: 'prevention', injuryId: null, injuryOnsetDate: null, injuryName: null })
    navigate('/dashboard')
  }

  return (
    <div className="graduated">

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="graduated__hero">
        <p className="graduated__confetti" aria-hidden="true">🎉</p>
        <h1 className="graduated__title">You're cleared to train</h1>
        <p className="graduated__subtitle">
          {injuryName ? `${injuryName} recovery is complete` : 'Your recovery is complete'}
        </p>
      </div>

      {/* ── Recovery summary stats ────────────────────────────────────────── */}
      <section className="recovery__section">
        <h2 className="dashboard__section-title">Recovery Summary</h2>
        {loading ? (
          <Skeleton height={100} />
        ) : (
          <div className="graduated__stats-row">
            <div className="dashboard__mini-card">
              <span className="dashboard__mini-icon">📅</span>
              <span className="dashboard__mini-label">Days</span>
              <span className="dashboard__mini-value">{totalDays}</span>
            </div>
            <div className="dashboard__mini-card">
              <span className="dashboard__mini-icon">📉</span>
              <span className="dashboard__mini-label">Low pain</span>
              <span className="dashboard__mini-value">
                {stats.lowestPain != null ? `${stats.lowestPain}/10` : '—'}
              </span>
            </div>
            <div className="dashboard__mini-card">
              <span className="dashboard__mini-icon">✅</span>
              <span className="dashboard__mini-label">Check-ins</span>
              <span className="dashboard__mini-value">{stats.checkInCount}</span>
            </div>
          </div>
        )}
      </section>

      {/* ── Full recovery arc chart ───────────────────────────────────────── */}
      <section className="recovery__section">
        <h2 className="dashboard__section-title">Your recovery arc</h2>
        {loading ? (
          <Skeleton height={200} />
        ) : chartData.length < 2 ? (
          <div className="recovery__chart-placeholder">
            <p className="recovery__chart-placeholder-icon" aria-hidden="true">📊</p>
            <p className="recovery__chart-placeholder-text">Not enough data to show the chart</p>
          </div>
        ) : (
          <div className="dashboard__chart-wrap">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: 'var(--text)' }}
                />
                <YAxis
                  domain={[0, 10]}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--text)' }}
                  ticks={[0, 2, 4, 6, 8, 10]}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                  formatter={(v) => v != null ? [v, 'Pain score'] : []}
                  labelFormatter={() => ''}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#22C55E"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: '#22C55E', strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ── What's next ──────────────────────────────────────────────────────── */}
      <section className="recovery__section">
        <h2 className="dashboard__section-title">What's next</h2>
        <div className="graduated__next-card">
          {lastStep && (
            <div className="graduated__next-protocol">
              <p className="graduated__next-label">ONGOING MAINTENANCE</p>
              <p className="graduated__next-text">{lastStep.instruction}</p>
            </div>
          )}
          <div className="graduated__next-tip">
            <span className="graduated__next-tip-icon" aria-hidden="true">📈</span>
            <p>Continue logging check-ins — your baseline is now stronger than ever.</p>
          </div>
        </div>
      </section>

      {/* ── Action buttons ───────────────────────────────────────────────────── */}
      <div className="graduated__actions">
        <button
          type="button"
          className="graduated__primary-btn"
          onClick={handleContinuePrevention}
        >
          Continue to Prevention Mode
        </button>
        <button
          type="button"
          className="graduated__secondary-btn"
          onClick={() => navigate('/settings')}
        >
          I have another injury
        </button>
      </div>

    </div>
  )
}
