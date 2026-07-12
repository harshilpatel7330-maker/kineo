import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { calcReadiness } from '../utils/readiness'
import { mapRecommendation } from '../utils/recommendationMapper'
import './Dashboard.css'

import { getAthleteId } from '../utils/athleteId'
import { getAthleteGoal, isPreventionMode } from '../utils/athleteMode'
const ATHLETE_ID = getAthleteId()

const SPORT_LABELS = {
  runner: { emoji: '🏃', label: 'Runner' },
  recreational: { emoji: '💪', label: 'Recreational Athlete' },
}

const WEARABLE_LABELS = {
  'apple-watch': { emoji: '⌚', label: 'Apple Watch' },
  garmin: { emoji: '🟠', label: 'Garmin' },
  whoop: { emoji: '🖤', label: 'WHOOP' },
  oura: { emoji: '💍', label: 'Oura Ring' },
  fitbit: { emoji: '💙', label: 'Fitbit' },
  none: { emoji: '📱', label: 'No wearable' },
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function formatToday() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

function barColor(score, hasEntry) {
  if (!hasEntry || score === 0) return '#E5E4E7'
  if (score > 70) return '#22C55E'
  if (score >= 40) return '#F59E0B'
  return '#EF4444'
}

function getLast7Days() {
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push({
      day: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: d.toISOString().split('T')[0],
      score: 0,
      hasEntry: false,
    })
  }
  return days
}

function getWeekBounds() {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(now)
  mon.setDate(now.getDate() + diffToMon)
  const sun = new Date(mon)
  sun.setDate(mon.getDate() + 6)
  const fmt = d =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { monISO: fmt(mon), sunISO: fmt(sun) }
}

function getPrevWeekBounds() {
  const now = new Date()
  const day = now.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const prevMon = new Date(now)
  prevMon.setDate(now.getDate() + diffToMon - 7)
  const prevSun = new Date(prevMon)
  prevSun.setDate(prevMon.getDate() + 6)
  const fmt = d =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { monISO: fmt(prevMon), sunISO: fmt(prevSun) }
}

function weeksAway(dateISO) {
  if (!dateISO) return null
  const diff = new Date(dateISO + 'T00:00:00') - new Date()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24 * 7)))
}

function formatGoalDate(dateISO) {
  if (!dateISO) return ''
  return new Date(dateISO + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function getWeeklySummaryText({ sessionCount, loadChangePct, flaggedDays }) {
  if (sessionCount === 0) return 'No sessions logged yet this week.'
  const parts = [`${sessionCount} session${sessionCount !== 1 ? 's' : ''} this week`]
  if (loadChangePct != null) {
    parts.push(
      loadChangePct >= 0
        ? `load up ${loadChangePct}% vs last week`
        : `load down ${Math.abs(loadChangePct)}% vs last week`
    )
  }
  if (flaggedDays > 0) {
    parts.push(`${flaggedDays} day${flaggedDays !== 1 ? 's' : ''} with caution flags`)
  }
  return parts.join(' · ')
}

function loadProfile() {
  try {
    const raw = localStorage.getItem('kineo_profile')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function loadLastResult() {
  try {
    const raw = localStorage.getItem('kineo_last_result')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function isCheckInToday(lastResult) {
  if (!lastResult?.checkin) return false
  if (lastResult.date) return lastResult.date === todayISO()
  return true
}

function buildChartData(rows) {
  const days = getLast7Days()
  if (!rows?.length) return { data: days, hasData: false }

  const scoresByDate = {}
  rows.forEach((row) => {
    const date = row.created_at?.split('T')[0]
    const checkin = row.signals_used?.checkin
    if (date && checkin) {
      scoresByDate[date] = calcReadiness(checkin)
    }
  })

  const data = days.map((d) => ({
    ...d,
    score: scoresByDate[d.date] ?? 0,
    hasEntry: d.date in scoresByDate,
  }))

  return { data, hasData: Object.keys(scoresByDate).length > 0 }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [chartData, setChartData] = useState(getLast7Days())
  const [hasChartData, setHasChartData] = useState(false)
  const [weeklyData, setWeeklyData] = useState(null)

  const profile = useMemo(() => loadProfile(), [])
  const lastResult = useMemo(() => loadLastResult(), [])
  const goal = useMemo(() => getAthleteGoal(), [])
  const isPreventionUser = useMemo(() => isPreventionMode(), [])
  const checkInToday = isCheckInToday(lastResult)

  useEffect(() => {
    async function fetchHistory() {
      const { data, error } = await supabase
        .from('recommendation_outputs')
        .select('created_at, signals_used, decision')
        .eq('athlete_id', ATHLETE_ID)
        .order('created_at', { ascending: false })
        .limit(7)

      if (error) {
        console.error('Failed to fetch history:', error)
        return
      }

      const { data: chart, hasData } = buildChartData(data ?? [])
      setChartData(chart)
      setHasChartData(hasData)
    }

    fetchHistory()
  }, [])

  useEffect(() => {
    if (!isPreventionUser) return
    async function fetchWeekly() {
      const { monISO, sunISO } = getWeekBounds()
      const prev = getPrevWeekBounds()
      const [thisRes, prevRes, recsRes] = await Promise.all([
        supabase
          .from('training_sessions')
          .select('session_load')
          .eq('athlete_id', ATHLETE_ID)
          .gte('date', monISO)
          .lte('date', sunISO),
        supabase
          .from('training_sessions')
          .select('session_load')
          .eq('athlete_id', ATHLETE_ID)
          .gte('date', prev.monISO)
          .lte('date', prev.sunISO),
        supabase
          .from('recommendation_outputs')
          .select('decision')
          .eq('athlete_id', ATHLETE_ID)
          .gte('created_at', monISO + 'T00:00:00')
          .lte('created_at', sunISO + 'T23:59:59'),
      ])
      const sessions     = thisRes.data ?? []
      const prevSessions = prevRes.data ?? []
      const recs         = recsRes.data ?? []
      const sessionCount  = sessions.length
      const totalLoad     = sessions.reduce((s, r) => s + (r.session_load ?? 0), 0)
      const prevTotalLoad = prevSessions.reduce((s, r) => s + (r.session_load ?? 0), 0)
      const loadChangePct = prevTotalLoad > 0
        ? Math.round(((totalLoad - prevTotalLoad) / prevTotalLoad) * 100)
        : null
      const flaggedDays = recs.filter(r => r.decision === 'MODIFY' || r.decision === 'RECOVER').length
      setWeeklyData({ sessionCount, totalLoad, loadChangePct, flaggedDays })
    }
    fetchWeekly()
  }, [isPreventionUser])

  const sport = profile?.pathway ? SPORT_LABELS[profile.pathway] : null
  const wearable = profile?.wearable ? WEARABLE_LABELS[profile.wearable] : null
  const checkin = lastResult?.checkin
  const readiness = checkin ? calcReadiness(checkin) : null
  const mapped = checkInToday && lastResult?.result
    ? mapRecommendation(lastResult.result.decision)
    : null

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <h1 className="dashboard__greeting">{getGreeting()}, Athlete 👋</h1>
        <p className="dashboard__date">{formatToday()}</p>
      </header>

      {isPreventionUser && goal.goalType && (
        <section className="dashboard__goal-card">
          <div className="dashboard__goal-header">
            <div className="dashboard__goal-meta">
              <p className="dashboard__goal-name">{goal.goalName}</p>
              {goal.goalType === 'race' && goal.goalDate && (
                <p className="dashboard__goal-detail">
                  {weeksAway(goal.goalDate) > 0
                    ? `${weeksAway(goal.goalDate)} weeks away · ${formatGoalDate(goal.goalDate)}`
                    : `Race week! · ${formatGoalDate(goal.goalDate)}`}
                </p>
              )}
              {goal.goalType === 'strength' && (
                <p className="dashboard__goal-detail">
                  {goal.goalDate ? `${weeksAway(goal.goalDate)} weeks away` : 'Ongoing goal'}
                </p>
              )}
              {goal.goalType === 'fitness' && goal.goalWeeklyVolume && (
                <p className="dashboard__goal-detail">
                  This week: {weeklyData?.sessionCount ?? 0} of {goal.goalWeeklyVolume} days
                </p>
              )}
            </div>
            <Link to="/settings" className="dashboard__goal-edit">Edit</Link>
          </div>

          {goal.goalType === 'race' && goal.goalDate && (
            <div className="dashboard__goal-bar">
              <div
                className="dashboard__goal-fill"
                style={{
                  width: `${Math.max(2, Math.min(100, Math.round((1 - weeksAway(goal.goalDate) / 20) * 100)))}%`,
                }}
              />
            </div>
          )}

          {goal.goalType === 'fitness' && goal.goalWeeklyVolume && (
            <div className="dashboard__goal-dots">
              {Array.from({ length: goal.goalWeeklyVolume }).map((_, i) => (
                <span
                  key={i}
                  className={`dashboard__goal-dot ${i < (weeklyData?.sessionCount ?? 0) ? 'dashboard__goal-dot--filled' : ''}`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {isPreventionUser && !goal.goalType && (
        <button
          type="button"
          className="dashboard__goal-prompt"
          onClick={() => navigate('/settings')}
        >
          Set a training goal for more personalised recommendations →
        </button>
      )}

      {checkInToday && mapped ? (
        <section
          className="dashboard__status-card"
          style={{ backgroundColor: mapped.bgColor }}
        >
          <div className="dashboard__status-top">
            <span className="dashboard__status-emoji" aria-hidden="true">
              {mapped.emoji}
            </span>
            <div>
              <p className="dashboard__status-label">{mapped.label}</p>
              <p className="dashboard__status-readiness">Readiness: {readiness}%</p>
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
        <section className="dashboard__cta-card">
          <p className="dashboard__cta-title">Ready to check in? 💪</p>
          <p className="dashboard__cta-sub">Takes less than 30 seconds</p>
          <button
            type="button"
            className="dashboard__cta-btn"
            onClick={() => navigate('/checkin')}
          >
            Check In Now
          </button>
        </section>
      )}

      <button
        type="button"
        className="dashboard__log-btn"
        onClick={() => navigate('/log-session')}
      >
        + Log a session
      </button>

      {isPreventionUser && weeklyData && (
        <section className="dashboard__weekly-card">
          <div className="dashboard__weekly-header">
            <h3 className="dashboard__weekly-title">This week</h3>
          </div>
          <div className="dashboard__weekly-stats">
            <div className="dashboard__weekly-stat">
              <span className="dashboard__weekly-stat-value">{weeklyData.sessionCount}</span>
              <span className="dashboard__weekly-stat-label">sessions</span>
            </div>
            {weeklyData.totalLoad > 0 && (
              <div className="dashboard__weekly-stat">
                <span className="dashboard__weekly-stat-value">{weeklyData.totalLoad}</span>
                <span className="dashboard__weekly-stat-label">total load</span>
              </div>
            )}
            {weeklyData.loadChangePct != null && (
              <div className="dashboard__weekly-stat">
                <span className={`dashboard__weekly-stat-value ${weeklyData.loadChangePct >= 0 ? 'dashboard__weekly-stat-value--up' : 'dashboard__weekly-stat-value--down'}`}>
                  {weeklyData.loadChangePct >= 0 ? '+' : ''}{weeklyData.loadChangePct}%
                </span>
                <span className="dashboard__weekly-stat-label">vs last week</span>
              </div>
            )}
            {weeklyData.flaggedDays > 0 && (
              <div className="dashboard__weekly-stat">
                <span className="dashboard__weekly-stat-value dashboard__weekly-stat-value--warn">
                  {weeklyData.flaggedDays}
                </span>
                <span className="dashboard__weekly-stat-label">flagged days</span>
              </div>
            )}
          </div>
          <p className="dashboard__weekly-summary">{getWeeklySummaryText(weeklyData)}</p>
        </section>
      )}

      <section className="dashboard__section">
        <h2 className="dashboard__section-title">7-Day Readiness</h2>
        <div className="dashboard__chart-wrap">
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: 'var(--text)' }}
              />
              <YAxis
                domain={[0, 100]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--text)' }}
                ticks={[0, 25, 50, 75, 100]}
              />
              <Bar dataKey="score" radius={[6, 6, 0, 0]} maxBarSize={32}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.date}
                    fill={barColor(entry.score, entry.hasEntry)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {!hasChartData && (
            <div className="dashboard__chart-overlay">
              <p>Complete check-ins to see your trend</p>
            </div>
          )}
        </div>
      </section>

      <section className="dashboard__section">
        <h2 className="dashboard__section-title">Recovery Summary</h2>
        <div className="dashboard__recovery-row">
          <div className="dashboard__mini-card">
            <span className="dashboard__mini-icon">😴</span>
            <span className="dashboard__mini-label">Sleep</span>
            <span className="dashboard__mini-value">
              {checkin ? `${checkin.sleep}/5` : '--'}
            </span>
          </div>
          <div className="dashboard__mini-card">
            <span className="dashboard__mini-icon">⚡</span>
            <span className="dashboard__mini-label">Energy</span>
            <span className="dashboard__mini-value">
              {checkin ? `${6 - checkin.fatigue}/5` : '--'}
            </span>
          </div>
          <div className="dashboard__mini-card">
            <span className="dashboard__mini-icon">💪</span>
            <span className="dashboard__mini-label">Soreness</span>
            <span className="dashboard__mini-value">
              {checkin ? `${checkin.soreness}/5` : '--'}
            </span>
          </div>
        </div>
      </section>

      <div className="dashboard__badges">
        {sport && (
          <span className="dashboard__badge">
            {sport.emoji} {sport.label}
          </span>
        )}
        {wearable && (
          <span className="dashboard__badge">
            {wearable.emoji} {wearable.label}
          </span>
        )}
      </div>

      <div className="dashboard__device-id">
        <p className="dashboard__device-id-label">Device ID</p>
        <p className="dashboard__device-id-value">{ATHLETE_ID}</p>
        <p className="dashboard__device-id-hint">
          Save this. If you lose access to this device or clear your browser, send this code so your data can be recovered.
        </p>
        <Link to="/settings" className="dashboard__settings-link">⚙️ Settings &amp; mode</Link>
      </div>
    </div>
  )
}
