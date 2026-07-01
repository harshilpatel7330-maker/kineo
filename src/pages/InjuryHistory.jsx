import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { getAthleteId } from '../utils/athleteId'
import './InjuryHistory.css'

const ATHLETE_ID = getAthleteId()

const INJURY_RULE_IDS = new Set([
  'P1-stress-fracture-risk',
  'P2-injury-pattern-high',
  'P3-injury-pattern-moderate',
])

function localDateStr(daysAgo) {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  })
}

const CONFIDENCE_LABEL = {
  high:     'HIGH',
  moderate: 'POSSIBLE',
  low:      'LOW',
}

const CONFIDENCE_COLOR = {
  high:     '#EF4444',
  moderate: '#F59E0B',
  low:      '#9CA3AF',
}

export default function InjuryHistory() {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const thirtyDaysAgo = localDateStr(30)
      const { data } = await supabase
        .from('recommendation_outputs')
        .select('id, created_at, rules_fired')
        .eq('athlete_id', ATHLETE_ID)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
      setRows(data ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // Collect all injury events from rules_fired
  const events = []
  for (const row of rows) {
    const rules = row.rules_fired ?? []
    for (const rule of rules) {
      if (INJURY_RULE_IDS.has(rule.id) && rule.injury) {
        events.push({
          date: row.created_at.split('T')[0],
          injury: rule.injury,
          ruleId: rule.id,
        })
      }
    }
  }

  // Group by injuryId
  const grouped = {}
  for (const ev of events) {
    const id = ev.injury.injuryId
    if (!grouped[id]) {
      grouped[id] = { injuryId: id, name: ev.injury.name, dates: [], maxConfidence: 'low' }
    }
    grouped[id].dates.push(ev.date)
    const order = { high: 2, moderate: 1, low: 0 }
    if ((order[ev.injury.confidence] ?? 0) > (order[grouped[id].maxConfidence] ?? 0)) {
      grouped[id].maxConfidence = ev.injury.confidence
    }
  }

  const entries = Object.values(grouped).sort((a, b) =>
    (b.dates[0] ?? '').localeCompare(a.dates[0] ?? '')
  )

  return (
    <div className="injury-history">
      <button className="injury-history__back" onClick={() => navigate(-1)}>
        ← Back
      </button>
      <h1 className="injury-history__title">Injury Patterns</h1>
      <p className="injury-history__subtitle">Last 30 days · based on your daily check-in data</p>

      {loading && <p className="injury-history__empty">Loading…</p>}

      {!loading && entries.length === 0 && (
        <div className="injury-history__empty-card">
          <p className="injury-history__empty-icon">🎉</p>
          <p className="injury-history__empty-text">No injury patterns detected in the last 30 days.</p>
        </div>
      )}

      {entries.map(entry => (
        <div key={entry.injuryId} className="injury-history__card">
          <div className="injury-history__card-header">
            <span className="injury-history__name">{entry.name}</span>
            <span
              className="injury-history__badge"
              style={{ background: `${CONFIDENCE_COLOR[entry.maxConfidence]}22`, color: CONFIDENCE_COLOR[entry.maxConfidence] }}
            >
              {CONFIDENCE_LABEL[entry.maxConfidence]}
            </span>
          </div>
          <p className="injury-history__dates">
            Flagged {entry.dates.length}× — last {formatDate(entry.dates[0])}
          </p>
          <Link to={`/injury/${entry.injuryId}`} className="injury-history__protocol-link">
            View protocol →
          </Link>
        </div>
      ))}
    </div>
  )
}
