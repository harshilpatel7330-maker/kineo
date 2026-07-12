import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { getAthleteMode, isReturnToSport } from '../utils/athleteMode'
import { PROTOCOLS } from '../utils/injuryProtocols'
import { computedPainTrend } from '../utils/painTrendCalculator'
import { mapRecommendation } from '../utils/recommendationMapper'
import { evaluateGraduationCriteria } from '../utils/graduationChecker'
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

function formatShortDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function buildHrvChartData14(checkins14) {
  const byDate = {}
  for (const r of checkins14) {
    if (r.hrv_ms != null) byDate[r.date] = r.hrv_ms
  }
  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    d.setHours(12, 0, 0, 0)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const idx = 13 - i
    days.push({ date, label: idx % 4 === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : '', hrv: byDate[date] ?? null })
  }
  return days
}

function getHrvStatus(pct) {
  if (pct == null) return null
  if (pct >= -5)  return { text: '▲ Within normal range',        color: '#22C55E' }
  if (pct >= -15) return { text: '▼ Mildly suppressed',          color: '#F59E0B' }
  return               { text: '▼ Significantly below baseline', color: '#EF4444' }
}

function getRhrStatus(delta) {
  if (delta == null) return null
  if (delta <= 2) return { text: 'Within normal range',    color: '#22C55E' }
  if (delta <= 7) return { text: 'Mildly elevated',        color: '#F59E0B' }
  return               { text: 'Significantly elevated',   color: '#EF4444' }
}

function wearableLineColor(pct) {
  if (pct == null) return '#9CA3AF'
  if (pct >= 0)   return '#22C55E'
  if (pct >= -15) return '#F59E0B'
  return '#EF4444'
}

function computeShortHrvTrend(chartData) {
  const pts = chartData.filter(d => d.hrv != null)
  if (pts.length < 3) return 'few-data'
  const recent = pts.slice(-3).map(d => d.hrv)
  const prior  = pts.slice(-6, -3).map(d => d.hrv)
  if (!prior.length) return 'few-data'
  const avgR = recent.reduce((s, v) => s + v, 0) / recent.length
  const avgP = prior.reduce((s, v) => s + v, 0) / prior.length
  if (avgP === 0) return 'stable'
  const change = (avgR - avgP) / avgP
  if (change > 0.05) return 'improving'
  if (change < -0.05) return 'worsening'
  return 'stable'
}

function progressMsg(streak, hasRows, gradCheck) {
  if (streak === 7) return gradCheck?.graduated
    ? 'Criteria met — checking clearance...'
    : 'Pain and stiffness criteria met — HRV recovery is still in progress'
  if (streak >= 5) return `Almost there — ${7 - streak} more qualifying day${7 - streak === 1 ? '' : 's'} to go`
  if (streak >= 2) return `Building momentum — ${7 - streak} more qualifying days to go`
  if (streak === 1) return 'Good start — keep logging daily'
  if (!hasRows)    return "Log today's check-in to start tracking your progress"
  return 'Keep going — each qualifying day counts toward clearance'
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
  const location = useLocation()

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

  const [loading,            setLoading]            = useState(true)
  const [painLogs,           setPainLogs]           = useState([])
  const [watchForExpanded,   setWatchForExpanded]   = useState(false)
  const [wearableMetrics,    setWearableMetrics]    = useState(null)
  const [hrv14,              setHrv14]              = useState([])
  const [rtsRows,            setRtsRows]            = useState([])
  const [progressHrvRows,    setProgressHrvRows]    = useState([])
  const [yesterdayProtocol,  setYesterdayProtocol]  = useState(undefined)
  const [showProtocolToast,  setShowProtocolToast]  = useState(
    location.state?.justLoggedProtocol ?? false
  )

  const trend     = computedPainTrend(painLogs)
  const chartData = buildPainChartData(painLogs)
  const hasPainData = painLogs.length >= 3

  const wearableChartData = useMemo(() => buildHrvChartData14(hrv14), [hrv14])
  const wearableTrend     = computeShortHrvTrend(wearableChartData)
  const wearableColor     = wearableLineColor(wearableMetrics?.hrv_vs_baseline_pct ?? null)
  const hasWearableSignal = !!(wearableMetrics?.hrv_ms || wearableMetrics?.resting_hr_bpm)
  const daysSinceWearable = wearableMetrics?.date
    ? Math.round((Date.now() - new Date(wearableMetrics.date + 'T12:00:00').getTime()) / 86400000)
    : 0
  const isStaleWearable   = hasWearableSignal && daysSinceWearable > 14

  const trendSubtext = trend === 'improving'
    ? "Pain is trending down — you're on track."
    : trend === 'worsening'
    ? 'Pain is rising — take it easy today.'
    : 'Keep logging check-ins to track your pain trend.'

  const qualifyingStreak = useMemo(() => {
    let count = 0
    for (const row of rtsRows) {
      if (row.pain_score <= 1 && row.morning_stiffness <= 2) count++
      else break
    }
    return count
  }, [rtsRows])

  const gradCheck = useMemo(
    () => qualifyingStreak === 7
      ? evaluateGraduationCriteria(rtsRows, painLogs, progressHrvRows)
      : null,
    [qualifyingStreak, rtsRows, painLogs, progressHrvRows]
  )

  const trajectoryLine = useMemo(() => {
    if (qualifyingStreak === 0) {
      if (rtsRows.length === 0) return null
      return "Focus on today's protocol — your streak resets with each qualifying day you add"
    }
    const recentTrend = computedPainTrend(painLogs.slice(0, 5))
    if (recentTrend === 'worsening') {
      return '⚠️ Your pain is trending up — prioritise recovery before pushing the timeline'
    }
    if (qualifyingStreak >= 5) {
      const withHrv = progressHrvRows.filter(r => r.hrv_vs_baseline_pct != null)
      if (withHrv.length >= 4 && withHrv.filter(r => r.hrv_vs_baseline_pct >= -15).length < 4) {
        return 'Pain criteria on track — your HRV suggests your body may need a little more recovery time after pain resolves'
      }
    }
    const rem = 7 - qualifyingStreak
    return `At this pace, you could be cleared in approximately ${rem} more qualifying day${rem === 1 ? '' : 's'}`
  }, [qualifyingStreak, rtsRows, painLogs, progressHrvRows])

  useEffect(() => {
    if (!showProtocolToast) return
    navigate(location.pathname, { replace: true, state: {} })
    const t = setTimeout(() => setShowProtocolToast(false), 4000)
    return () => clearTimeout(t)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function load() {
      const [
        { data: painData },
        { data: rmData },
        { data: latestCheckinData },
        { data: baselineData },
        { data: hrv14Data },
        { data: rtsData },
        { data: progressHrvData },
        { data: ypData },
      ] = await Promise.all([
        supabase.from('pain_logs').select('pain_score, date').eq('athlete_id', ATHLETE_ID).gte('date', nDaysAgoISO(14)).order('date', { ascending: false }),
        supabase.from('recovery_metrics').select('hrv_vs_baseline_pct, rhr_vs_baseline_bpm').eq('athlete_id', ATHLETE_ID).order('date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('checkins').select('hrv_ms, resting_hr_bpm, date').eq('athlete_id', ATHLETE_ID).not('hrv_ms', 'is', null).order('date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('baselines').select('avg_hrv_ms, avg_resting_hr').eq('athlete_id', ATHLETE_ID).maybeSingle(),
        supabase.from('checkins').select('date, hrv_ms').eq('athlete_id', ATHLETE_ID).not('hrv_ms', 'is', null).gte('date', nDaysAgoISO(14)).order('date', { ascending: true }),
        supabase.from('rts_checkins').select('pain_score, morning_stiffness, date').eq('athlete_id', ATHLETE_ID).order('date', { ascending: false }).limit(7),
        supabase.from('recovery_metrics').select('hrv_vs_baseline_pct, date').eq('athlete_id', ATHLETE_ID).order('date', { ascending: false }).limit(7),
        supabase.from('rts_checkins').select('protocol_session_done, protocol_duration_min, protocol_pain_during, protocol_pain_after').eq('athlete_id', ATHLETE_ID).eq('date', nDaysAgoISO(1)).maybeSingle(),
      ])

      setPainLogs(painData ?? [])
      setWearableMetrics({
        hrv_ms:              latestCheckinData?.hrv_ms              ?? null,
        resting_hr_bpm:      latestCheckinData?.resting_hr_bpm      ?? null,
        date:                latestCheckinData?.date                 ?? null,
        hrv_vs_baseline_pct: rmData?.hrv_vs_baseline_pct            ?? null,
        rhr_vs_baseline_bpm: rmData?.rhr_vs_baseline_bpm            ?? null,
        avg_hrv_ms:          baselineData?.avg_hrv_ms               ?? null,
        avg_resting_hr:      baselineData?.avg_resting_hr           ?? null,
      })
      setHrv14(hrv14Data ?? [])
      setRtsRows(rtsData ?? [])
      setProgressHrvRows(progressHrvData ?? [])
      setYesterdayProtocol(ypData ?? null)
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

      {showProtocolToast && (
        <div className="checkin-nudge" role="status">
          <p className="checkin-nudge__text">Protocol logged — we'll factor this into your next recommendation.</p>
        </div>
      )}

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

      {/* ── 1.5. PROGRESS TO CLEARANCE ───────────────────────────────────── */}
      {loading ? (
        <Skeleton height={130} />
      ) : (
        <div className="recovery__progress-card">
          <p className="recovery__progress-title">Progress to Clearance</p>
          <div className="recovery__progress-track">
            <div
              className={`recovery__progress-fill recovery__progress-fill--${qualifyingStreak >= 5 ? 'green' : qualifyingStreak >= 2 ? 'amber' : 'gray'}`}
              style={{ width: `${(qualifyingStreak / 7) * 100}%` }}
            />
          </div>
          <div className="recovery__progress-meta">
            <p className="recovery__progress-count">
              <strong>{qualifyingStreak} of 7</strong> qualifying days
            </p>
            <p className="recovery__progress-criteria">Pain ≤ 1/10 and morning stiffness ≤ 2/10</p>
          </div>
          <p className="recovery__progress-msg">
            {progressMsg(qualifyingStreak, rtsRows.length > 0, gradCheck)}
          </p>
          {trajectoryLine && (
            <p className="recovery__progress-hrv-note" style={{ marginTop: 8 }}>
              {trajectoryLine}
            </p>
          )}
          <p className="recovery__progress-hrv-note">
            Clearance also considers your HRV recovery if Apple Watch data is available
          </p>
        </div>
      )}

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

            {/* Yesterday's protocol summary */}
            {yesterdayProtocol?.protocol_session_done === true && (() => {
              const during = yesterdayProtocol.protocol_pain_during
              const after  = yesterdayProtocol.protocol_pain_after
              const max    = Math.max(during ?? 0, after ?? 0)
              const color  = max >= 5 ? '#EF4444' : max >= 3 ? '#F59E0B' : '#22C55E'
              return (
                <div className="recovery__yesterday-protocol" style={{ borderLeftColor: color }}>
                  <p className="recovery__yesterday-label" style={{ color }}>Yesterday</p>
                  <p className="recovery__yesterday-detail">
                    {during != null && after != null
                      ? `During: ${during}/10 · After: ${after}/10`
                      : 'Completed'}
                    {yesterdayProtocol.protocol_duration_min != null
                      ? ` · ${yesterdayProtocol.protocol_duration_min} min`
                      : ''}
                  </p>
                </div>
              )
            })()}
            {yesterdayProtocol?.protocol_session_done === false && (
              <p className="recovery__yesterday-rest">Yesterday: rest day</p>
            )}

            <div className="recovery__protocol-links">
              <Link to={`/injury/${injuryId}`} className="recovery__protocol-link">
                See full protocol →
              </Link>
              <Link to="/log-protocol" className="recovery__protocol-link recovery__protocol-link--log">
                Log how it went →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ── 2.5. HOW YOUR BODY IS RESPONDING ──────────────────────────────── */}
      <section className="recovery__section">
        <h2 className="dashboard__section-title">How your body is responding</h2>
        {loading ? (
          <Skeleton height={200} />
        ) : !hasWearableSignal ? (
          <div className="recovery__signals-empty">
            <p className="recovery__signals-empty-text">
              Connect Apple Watch data to see your recovery signals
            </p>
            <Link to="/import-health" className="recovery__empty-link">
              Import Apple Health data →
            </Link>
          </div>
        ) : (
          <div className="recovery__card">
            <div className="recovery__signals-pills">
              <div className="recovery__signal-pill">
                <p className="recovery__signal-label">HRV TODAY</p>
                <p className="recovery__signal-value">
                  {wearableMetrics.hrv_ms != null ? `${wearableMetrics.hrv_ms}ms` : '—'}
                </p>
                {isStaleWearable
                  ? <p className="recovery__signal-status recovery__signal-status--muted">Last reading: {formatShortDate(wearableMetrics.date)}</p>
                  : (() => {
                      const s = getHrvStatus(wearableMetrics.hrv_vs_baseline_pct)
                      return s
                        ? <p className="recovery__signal-status" style={{ color: s.color }}>{s.text}</p>
                        : <p className="recovery__signal-status recovery__signal-status--muted">No data yet</p>
                    })()
                }
              </div>
              <div className="recovery__signal-pill">
                <p className="recovery__signal-label">RESTING HR</p>
                <p className="recovery__signal-value">
                  {wearableMetrics.resting_hr_bpm != null ? `${wearableMetrics.resting_hr_bpm} bpm` : '—'}
                </p>
                {isStaleWearable
                  ? <p className="recovery__signal-status recovery__signal-status--muted">Last reading: {formatShortDate(wearableMetrics.date)}</p>
                  : (() => {
                      const s = getRhrStatus(wearableMetrics.rhr_vs_baseline_bpm)
                      return s
                        ? <p className="recovery__signal-status" style={{ color: s.color }}>{s.text}</p>
                        : <p className="recovery__signal-status recovery__signal-status--muted">No data yet</p>
                    })()
                }
              </div>
            </div>

            {isStaleWearable && (
              <p className="recovery__signal-stale-note">
                Data is from {daysSinceWearable} days ago — enter today&apos;s reading in your check-in for current insights.
              </p>
            )}

            {(() => {
              const recentHrvCount = wearableChartData.filter(d => d.hrv != null).length
              if (recentHrvCount === 0) {
                return !isStaleWearable ? (
                  <p className="recovery__signals-trend">
                    No HRV readings in the last 14 days — log a check-in or import Apple Health data.
                  </p>
                ) : null
              }
              return (
                <>
                  <div className="dashboard__chart-wrap recovery__signals-chart">
                    <ResponsiveContainer width="100%" height={120}>
                      <LineChart data={wearableChartData} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
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
                          domain={['auto', 'auto']}
                        />
                        <Tooltip
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                          formatter={(v) => v != null ? [`${v}ms`, 'HRV'] : []}
                          labelFormatter={() => ''}
                        />
                        {wearableMetrics.avg_hrv_ms && (
                          <ReferenceLine
                            y={wearableMetrics.avg_hrv_ms}
                            stroke="#9CA3AF"
                            strokeDasharray="4 3"
                            strokeWidth={1.5}
                            label={{ value: 'Your baseline', position: 'insideTopRight', fontSize: 9, fill: '#9CA3AF' }}
                          />
                        )}
                        <Line
                          type="monotone"
                          dataKey="hrv"
                          stroke={wearableColor}
                          strokeWidth={2}
                          dot={{ r: 2.5, fill: wearableColor, strokeWidth: 0 }}
                          activeDot={{ r: 4 }}
                          connectNulls={false}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  {!isStaleWearable && (
                    <p className="recovery__signals-trend">
                      {wearableTrend === 'improving'  ? 'Your HRV is recovering — a good sign.'
                       : wearableTrend === 'worsening' ? "Your HRV is dropping — consider reducing today's load."
                       : wearableTrend === 'few-data'  ? 'Keep logging — trends appear after a few days.'
                       : 'Your HRV is holding steady.'}
                    </p>
                  )}
                </>
              )
            })()}
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
