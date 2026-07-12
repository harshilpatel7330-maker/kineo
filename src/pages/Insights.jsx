import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, Cell, ComposedChart, Line, LineChart,
  ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { getAthleteId } from '../utils/athleteId'
import { MILEAGE_BANDS } from '../athleteiq-engine'
import './Dashboard.css'
import './Insights.css'

const ATHLETE_ID = getAthleteId()

// ── Helpers ──────────────────────────────────────────────────────────────────

function localDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function nDaysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDate(d)
}

function getMondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  return d
}

function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function buildHrv30Data(checkins) {
  const byDate = {}
  for (const r of checkins) {
    if (r.hrv_ms != null) byDate[r.date] = r.hrv_ms
  }
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    d.setHours(12, 0, 0, 0)
    const date = localDate(d)
    return {
      date,
      label: i % 5 === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : '',
      hrv: byDate[date] ?? null,
    }
  })
}

function detectSignificantDip(checkins) {
  const valid = checkins
    .filter(r => r.hrv_ms != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  for (let i = 0; i < valid.length - 1; i++) {
    const prev = valid[i].hrv_ms
    const curr = valid[i + 1].hrv_ms
    if (prev > 0 && (prev - curr) / prev >= 0.30) return valid[i + 1].date
  }
  return null
}

function buildLoadHrvWeekly(sessions, checkins) {
  const now        = new Date()
  const thisMonday = getMondayOf(now)

  const byDate = {}
  for (const r of checkins) {
    if (r.hrv_ms != null) byDate[r.date] = r.hrv_ms
  }

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(thisMonday)
    start.setDate(thisMonday.getDate() - (7 - i) * 7)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    const startStr = localDate(start)
    const endStr   = localDate(end)

    const load = sessions
      .filter(s => s.date >= startStr && s.date <= endStr)
      .reduce((sum, s) => sum + (s.duration_min ?? 0) * (s.rpe ?? 0), 0) || null

    const weekHrvVals = Object.entries(byDate)
      .filter(([d]) => d >= startStr && d <= endStr)
      .map(([, v]) => v)

    const avgHrv = weekHrvVals.length > 0
      ? Math.round(weekHrvVals.reduce((s, v) => s + v, 0) / weekHrvVals.length)
      : null

    return {
      label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      load,
      hrv: avgHrv,
    }
  })

  return weeks.map((w, i) => {
    const priorLoad = i > 0 ? (weeks[i - 1].load ?? 0) : null
    let fill = '#E5E4E7'
    if (priorLoad !== null && priorLoad > 0 && w.load != null) {
      const pct = ((w.load - priorLoad) / priorLoad) * 100
      if (pct < MILEAGE_BANDS.CAUTION)       fill = '#22C55E'
      else if (pct < MILEAGE_BANDS.MODIFY)   fill = '#F59E0B'
      else if (pct < MILEAGE_BANDS.CRITICAL) fill = '#F97316'
      else                                    fill = '#EF4444'
    }
    return { ...w, fill }
  })
}

function buildSleep30Data(checkins) {
  const byDate = {}
  for (const r of checkins) {
    byDate[r.date] = r.sleep_hours
  }
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (29 - i))
    d.setHours(12, 0, 0, 0)
    const date = localDate(d)
    return {
      date,
      label: i % 7 === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : '',
      sleep: date in byDate ? byDate[date] : null,
    }
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyCard({ message, link }) {
  return (
    <div className="insights__empty-card">
      <p className="insights__empty-text">{message}</p>
      {link && (
        <Link to={link.to} className="insights__empty-link">{link.label}</Link>
      )}
    </div>
  )
}

function Skeleton() {
  return <div className="insights__skeleton" />
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Insights() {
  const [loading,         setLoading]         = useState(true)
  const [checkins60,      setCheckins60]      = useState([])
  const [baseline,        setBaseline]        = useState(null)
  const [sessions,        setSessions]        = useState([])
  const [loadChartOpen,   setLoadChartOpen]   = useState(false)

  useEffect(() => {
    async function load() {
      const [
        { data: checkinData },
        { data: baselineData },
        { data: sessionData },
      ] = await Promise.all([
        supabase
          .from('checkins')
          .select('date, hrv_ms, sleep_hours')
          .eq('athlete_id', ATHLETE_ID)
          .gte('date', nDaysAgoISO(60))
          .order('date', { ascending: true }),
        supabase
          .from('baselines')
          .select('avg_hrv_ms, avg_resting_hr, avg_sleep_hours')
          .eq('athlete_id', ATHLETE_ID)
          .maybeSingle(),
        supabase
          .from('training_sessions')
          .select('date, duration_min, rpe')
          .eq('athlete_id', ATHLETE_ID)
          .gte('date', nDaysAgoISO(56))
          .order('date', { ascending: true }),
      ])
      setCheckins60(checkinData ?? [])
      setBaseline(baselineData ?? null)
      setSessions(sessionData ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const hrv30Data   = useMemo(() => buildHrv30Data(checkins60),               [checkins60])
  const weeklyData  = useMemo(() => buildLoadHrvWeekly(sessions, checkins60), [sessions, checkins60])
  const sleep30Data = useMemo(() => buildSleep30Data(checkins60),             [checkins60])
  const dipDate     = useMemo(() => detectSignificantDip(checkins60),         [checkins60])

  const avgHrv   = baseline?.avg_hrv_ms      ?? null
  const avgSleep = baseline?.avg_sleep_hours ?? null

  const hasAnyWearable = checkins60.some(c => c.hrv_ms != null)
  const hrvDataCount   = hrv30Data.filter(d => d.hrv != null).length
  const sleepDataCount = sleep30Data.filter(d => d.sleep != null).length
  const nightsBelow6   = sleep30Data.filter(d => d.sleep != null && d.sleep < 6).length

  if (loading) {
    return (
      <div className="insights">
        <Skeleton />
        <Skeleton />
        <Skeleton />
      </div>
    )
  }

  return (
    <div className="insights">
      <header className="insights__header">
        <h1 className="insights__title">Insights</h1>
      </header>

      {/* ── SECTION 1: HRV TREND ────────────────────────────────────────── */}
      <section className="insights__section">
        <div className="insights__section-header">
          <h2 className="dashboard__section-title">Heart Rate Variability</h2>
          {avgHrv && <p className="insights__section-sub">Your baseline: {avgHrv}ms</p>}
        </div>

        {!hasAnyWearable ? (
          <EmptyCard
            message="Import your Apple Health data to unlock these insights"
            link={{ to: '/import-health', label: 'Import Apple Health data →' }}
          />
        ) : hrvDataCount < 7 ? (
          <EmptyCard message="Keep logging daily check-ins — your HRV trend will appear here after 7 days" />
        ) : (
          <>
            <div className="dashboard__chart-wrap">
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={hrv30Data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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
                  {avgHrv && (
                    <ReferenceArea
                      y1={avgHrv - 10}
                      y2={avgHrv + 10}
                      fill="#22C55E"
                      fillOpacity={0.08}
                      strokeOpacity={0}
                    />
                  )}
                  {avgHrv && (
                    <ReferenceLine
                      y={avgHrv}
                      stroke="#9CA3AF"
                      strokeDasharray="4 3"
                      strokeWidth={1.5}
                      label={{ value: 'baseline', position: 'insideTopRight', fontSize: 9, fill: '#9CA3AF' }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="hrv"
                    stroke="#6C63FF"
                    strokeWidth={2}
                    connectNulls={false}
                    isAnimationActive={false}
                    dot={(props) => {
                      const { cx, cy, value, index } = props
                      if (value == null || cx == null || cy == null) return <g key={index} />
                      let fill = '#22C55E'
                      if (avgHrv) {
                        if (value < avgHrv * 0.85)  fill = '#EF4444'
                        else if (value < avgHrv - 10) fill = '#F59E0B'
                      }
                      return <circle key={index} cx={cx} cy={cy} r={3} fill={fill} stroke="none" />
                    }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {dipDate && (
              <div className="insights__dip-callout">
                <span aria-hidden="true">⚠️</span>
                <p>
                  Significant HRV dip on {fmtDate(dipDate)} — this may have been illness,
                  high stress, or overtraining.
                </p>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── SECTION 2: LOAD VS HRV ──────────────────────────────────────── */}
      <section className="insights__section">
        <div className="insights__section-header">
          <h2 className="dashboard__section-title">Training Load vs. Recovery</h2>
          <p className="insights__section-sub">When load spikes, watch your HRV</p>
        </div>

        {!hasAnyWearable ? (
          <EmptyCard
            message="Import your Apple Health data to unlock these insights"
            link={{ to: '/import-health', label: 'Import Apple Health data →' }}
          />
        ) : hrvDataCount < 7 ? (
          <EmptyCard message="Keep logging daily check-ins — your training trend will appear here after 7 days" />
        ) : (
          <>
            <div className="dashboard__chart-wrap">
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={weeklyData} margin={{ top: 8, right: 40, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: 'var(--text)' }}
                  />
                  <YAxis
                    yAxisId="load"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: 'var(--text)' }}
                  />
                  <YAxis
                    yAxisId="hrv"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: 'var(--text)' }}
                    domain={['auto', 'auto']}
                    width={32}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                    formatter={(v, name) => {
                      if (name === 'load') return v != null ? [v, 'Load'] : []
                      if (name === 'hrv')  return v != null ? [`${v}ms`, 'Avg HRV'] : []
                      return []
                    }}
                  />
                  <Bar yAxisId="load" dataKey="load" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {weeklyData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="hrv"
                    type="monotone"
                    dataKey="hrv"
                    stroke="#6C63FF"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#6C63FF', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <button
              className="insights__caption"
              style={{ background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              onClick={() => setLoadChartOpen(o => !o)}
            >
              How to read this chart {loadChartOpen ? '↑' : '↓'}
            </button>
            {loadChartOpen && (
              <div className="insights__caption" style={{ marginTop: 0 }}>
                <p style={{ margin: '2px 0' }}>📊 Bars — your total training load each week (duration × effort). Taller = harder week.</p>
                <p style={{ margin: '2px 0' }}>💜 Line — your average HRV that week. Higher = better recovered.</p>
                <p style={{ margin: '2px 0' }}>⚠️ Watch for: bars rising while the line drops — that's your body telling you it needs more recovery.</p>
              </div>
            )}
            <p className="insights__caption">
              When your training load increases and HRV drops simultaneously,
              your body may need more recovery time.
            </p>
          </>
        )}
      </section>

      {/* ── SECTION 3: SLEEP ────────────────────────────────────────────── */}
      <section className="insights__section">
        <div className="insights__section-header">
          <h2 className="dashboard__section-title">Sleep</h2>
          {avgSleep && <p className="insights__section-sub">Your average: {avgSleep}h per night</p>}
        </div>

        {sleepDataCount < 7 ? (
          <EmptyCard message="Keep logging daily check-ins — your sleep trend will appear here after 7 days" />
        ) : (
          <>
            <div className="dashboard__chart-wrap">
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={sleep30Data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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
                    tick={{ fontSize: 10, fill: 'var(--text)' }}
                    ticks={[0, 4, 7, 10]}
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                    formatter={(v) => v != null ? [`${v}h`, 'Sleep'] : []}
                    labelFormatter={() => ''}
                  />
                  <ReferenceLine
                    y={7}
                    stroke="#6C63FF"
                    strokeDasharray="4 3"
                    strokeWidth={1.5}
                    label={{ value: 'Recommended', position: 'insideTopRight', fontSize: 9, fill: '#6C63FF' }}
                  />
                  <Bar dataKey="sleep" radius={[3, 3, 0, 0]} maxBarSize={14}>
                    {sleep30Data.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.sleep == null ? 'transparent'
                          : entry.sleep >= 7   ? '#22C55E'
                          : entry.sleep >= 6   ? '#F59E0B'
                          : '#EF4444'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="insights__caption">
              {nightsBelow6 > 3
                ? `You've had ${nightsBelow6} nights under 6 hours this month — this may be affecting your recovery.`
                : 'Your sleep consistency looks good.'}
            </p>
          </>
        )}
      </section>
    </div>
  )
}
