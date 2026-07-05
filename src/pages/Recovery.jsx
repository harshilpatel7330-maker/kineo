import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import {
  Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { getAthleteMode, isReturnToSport } from '../utils/athleteMode'
import { PROTOCOLS } from '../utils/injuryProtocols'
import { computedPainTrend } from '../utils/painTrendCalculator'
import { mapRecommendation } from '../utils/recommendationMapper'
import { getAthleteId } from '../utils/athleteId'
import './Dashboard.css'
import './Recovery.css'

const ATHLETE_ID = getAthleteId()

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nDaysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function computeDayNumber(onsetDateStr) {
  if (!onsetDateStr) return 1
  const onset = new Date(onsetDateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const diff = Math.round((today - onset) / 86400000) + 1
  return Math.max(1, diff)
}

function formatDayLabel(n) {
  if (n > 120) return 'Day 120+'
  return `Day ${n}`
}

// Parses protocol day range strings like '1–3', '4–7', '15+', '22+'
function parseRange(dayStr) {
  if (!dayStr) return { start: 1, end: Infinity }
  const plusMatch = dayStr.match(/^(\d+)\+$/)
  if (plusMatch) return { start: parseInt(plusMatch[1], 10), end: Infinity }
  const rangeMatch = dayStr.match(/^(\d+)[–-](\d+)$/)
  if (rangeMatch) return { start: parseInt(rangeMatch[1], 10), end: parseInt(rangeMatch[2], 10) }
  const singleMatch = dayStr.match(/^(\d+)$/)
  if (singleMatch) { const n = parseInt(singleMatch[1], 10); return { start: n, end: n } }
  return { start: 1, end: Infinity }
}

function getProtocolStep(returnToTraining, dayNumber) {
  if (!returnToTraining?.length) return null
  for (const step of returnToTraining) {
    const { start, end } = parseRange(step.day)
    if (dayNumber >= start && dayNumber <= end) return step
  }
  return returnToTraining[returnToTraining.length - 1]
}

function trendLineColor(trend) {
  if (trend === 'improving') return '#22C55E'
  if (trend === 'worsening') return '#EF4444'
  return '#9CA3AF'
}

function loadLastResult() {
  try {
    const raw = localStorage.getItem('kineo_last_result')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function isCheckInToday(lastResult) {
  if (!lastResult?.checkin) return false
  if (lastResult.date) return lastResult.date === todayISO()
  return true
}

function buildPainChartData(painLogs) {
  const scoreByDate = {}
  for (const row of (painLogs ?? [])) {
    scoreByDate[row.date] = row.pain_score
  }

  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(12, 0, 0, 0)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    // Show label at 4-tick intervals: indices 0, 4, 8, 12
    const idx = 13 - i
    const shortLabel = idx % 4 === 0
      ? `${d.getMonth() + 1}/${d.getDate()}`
      : ''
    days.push({
      date,
      label: shortLabel,
      score: date in scoreByDate ? scoreByDate[date] : null,
    })
  }
  return days
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function Skeleton({ height = 120 }) {
  return <div className="recovery__skeleton" style={{ height }} />
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Recovery() {
  const navigate = useNavigate()

  const { injuryId, injuryOnsetDate, injuryName } = useMemo(() => getAthleteMode(), [])
  const protocol    = injuryId ? PROTOCOLS[injuryId] : null
  const dayNumber   = computeDayNumber(injuryOnsetDate)
  const dayLabel    = formatDayLabel(dayNumber)
  const protocolStep = protocol ? getProtocolStep(protocol.returnToTraining, dayNumber) : null

  const lastResult     = useMemo(() => loadLastResult(), [])
  const checkedInToday = isCheckInToday(lastResult)
  const mapped         = checkedInToday && lastResult?.result
    ? mapRecommendation(lastResult.result.decision)
    : null

  const [loading,          setLoading]          = useState(true)
  const [painLogs,         setPainLogs]         = useState([])
  const [watchForExpanded, setWatchForExpanded] = useState(false)

  const trend     = computedPainTrend(painLogs)
  const chartData = buildPainChartData(painLogs)
  const hasPainData = painLogs.length >= 3

  const trendSubtext = trend === 'improving'
    ? "Pain is trending down — you're on track."
    : trend === 'worsening'
    ? 'Pain is rising — take it easy today.'
    : 'Keep logging check-ins to track your pain trend.'

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('pain_logs')
        .select('pain_score, date')
        .eq('athlete_id', ATHLETE_ID)
        .gte('date', nDaysAgoISO(14))
        .order('date', { ascending: false })
      setPainLogs(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Guards ────────────────────────────────────────────────────────────────

  // After graduation the user switches to prevention mode — redirect them away
  if (!isReturnToSport()) return <Navigate to="/dashboard" replace />

  if (!injuryId) {
    return (
      <div className="recovery recovery--empty">
        <p className="recovery__empty-icon">🩹</p>
        <p className="recovery__empty-title">No recovery profile set up</p>
        <p className="recovery__empty-sub">Choose your injury to get a personalised recovery protocol.</p>
        <Link to="/settings" className="recovery__empty-link">Set up your recovery profile →</Link>
      </div>
    )
  }

  return (
    <div className="recovery">

      {/* ── 1. RECOVERY HEADER CARD ────────────────────────────────────────── */}
      <div className="recovery__header-card">
        <div className="recovery__header-top">
          <div className="recovery__header-text">
            <p className="recovery__eyebrow">{injuryName ?? 'Injury Recovery'}</p>
            <h1 className="recovery__day-label">{dayLabel}</h1>
            <p className="recovery__trend-subtext">{trendSubtext}</p>
          </div>
          <div className="recovery__day-badge">
            <span className="recovery__day-num">{dayNumber > 120 ? '120+' : dayNumber}</span>
            <span className="recovery__day-unit">days</span>
          </div>
        </div>
      </div>

      {/* ── 2. TODAY'S FOCUS ───────────────────────────────────────────────── */}
      <section className="recovery__section">
        <h2 className="dashboard__section-title">Today's Focus</h2>
        {loading ? (
          <Skeleton height={140} />
        ) : (
          <div className="recovery__focus-card">
            {protocolStep && (
              <>
                <p className="recovery__focus-day">DAY {protocolStep.day}</p>
                <p className="recovery__focus-instruction">{protocolStep.instruction}</p>
              </>
            )}

            {protocol?.immediateActions?.length > 0 && (
              <ul className="recovery__checklist">
                {protocol.immediateActions.slice(0, 2).map((action, i) => (
                  <li key={i} className="recovery__checklist-item">
                    <span className="recovery__checklist-box" aria-hidden="true">☐</span>
                    <span className="recovery__checklist-text">{action}</span>
                  </li>
                ))}
              </ul>
            )}

            <Link to={`/injury/${injuryId}`} className="recovery__protocol-link">
              See full protocol →
            </Link>
          </div>
        )}
      </section>

      {/* ── 3. MORNING CHECK-IN CARD ───────────────────────────────────────── */}
      {checkedInToday && mapped ? (
        <section
          className="dashboard__status-card"
          style={{ backgroundColor: mapped.bgColor }}
        >
          <div className="dashboard__status-top">
            <span className="dashboard__status-emoji" aria-hidden="true">{mapped.emoji}</span>
            <div>
              <p className="dashboard__status-label">{mapped.label}</p>
            </div>
          </div>
          <p className="dashboard__status-note">Based on today&apos;s check-in</p>
          <button
            type="button"
            className="dashboard__status-btn"
            onClick={() => navigate('/recommendation')}
          >
            View Details
          </button>
        </section>
      ) : (
        <section className="recovery__checkin-card">
          <div className="recovery__checkin-top">
            <span className="recovery__checkin-icon" aria-hidden="true">📋</span>
            <div>
              <p className="recovery__checkin-title">Log today&apos;s recovery check-in</p>
              <p className="recovery__checkin-sub">Takes 20 seconds</p>
            </div>
          </div>
          <button
            type="button"
            className="dashboard__cta-btn recovery__checkin-btn"
            onClick={() => navigate('/rts-checkin')}
          >
            Check In
          </button>
        </section>
      )}

      {/* ── 4. PAIN TREND CHART ────────────────────────────────────────────── */}
      <section className="recovery__section">
        <h2 className="dashboard__section-title">Pain over the last 14 days</h2>
        {loading ? (
          <Skeleton height={200} />
        ) : !hasPainData ? (
          <div className="recovery__chart-placeholder">
            <p className="recovery__chart-placeholder-icon" aria-hidden="true">📊</p>
            <p className="recovery__chart-placeholder-text">
              Keep logging your check-ins — your pain trend will appear here after 3 days
            </p>
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
                <ReferenceLine
                  y={3}
                  stroke="#F59E0B"
                  strokeDasharray="4 3"
                  strokeWidth={1.5}
                  label={null}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke={trendLineColor(trend)}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: trendLineColor(trend), strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ── 5. WATCH FOR (collapsed by default) ────────────────────────────── */}
      {protocol?.watchFor?.length > 0 && (
        <section className="recovery__section">
          <h2 className="dashboard__section-title">Warning signs to watch for</h2>
          <div className="recovery__card">
            <ul className="recovery__watchfor-list">
              {(watchForExpanded
                ? protocol.watchFor
                : protocol.watchFor.slice(0, 2)
              ).map((item, i) => (
                <li key={i} className="recovery__watchfor-item">
                  <span className="recovery__watchfor-dot" aria-hidden="true">⚠️</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {protocol.watchFor.length > 2 && (
              <button
                className="recovery__toggle-btn"
                onClick={() => setWatchForExpanded(e => !e)}
              >
                {watchForExpanded ? 'Show less' : `+${protocol.watchFor.length - 2} more`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── 6. ESCALATION CARD (always visible) ────────────────────────────── */}
      {protocol?.escalationCriteria && (
        <section className="recovery__section">
          <h2 className="dashboard__section-title">When to see a professional</h2>
          <div className="recovery__escalation-card">
            <span className="recovery__escalation-icon" aria-hidden="true">🏥</span>
            <p className="recovery__escalation-text">{protocol.escalationCriteria}</p>
          </div>
        </section>
      )}

      {/* ── 7. FOOTER LINK ─────────────────────────────────────────────────── */}
      <div className="recovery__footer">
        <Link to="/settings" className="recovery__settings-link">
          Not the right injury? Update in Settings
        </Link>
      </div>

    </div>
  )
}
