import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { mapRecommendation } from '../utils/recommendationMapper'
import './Dashboard.css'

import { getAthleteId } from '../utils/athleteId'
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

function calcReadiness({ sleep, stress, fatigue, soreness }) {
  const score = ((6 - fatigue) + (6 - soreness) + sleep + (6 - stress)) / 16 * 100
  return Math.round(score)
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

  const profile = useMemo(() => loadProfile(), [])
  const lastResult = useMemo(() => loadLastResult(), [])
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
    </div>
  )
}
