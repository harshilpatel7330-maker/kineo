import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { backfillRecoveryMetrics } from '../utils/baselineCalculator'
import { getAthleteId } from '../utils/athleteId'
import { PROTOCOLS } from '../utils/injuryProtocols'
import { getAthleteMode, setAthleteMode } from '../utils/athleteMode'
import './Onboarding.css'
import './Settings.css'

const ATHLETE_ID = getAthleteId()

const INJURY_ORDER = [
  'shin-splints', 'it-band', 'plantar-fasciitis', 'patellar-tendinopathy',
  'achilles-tendinopathy', 'stress-fracture-risk', 'rotator-cuff',
  'lower-back-strain', 'elbow-tendinopathy',
]

const INJURY_META = {
  'shin-splints':          { name: 'Shin Splints',                   site: 'Shin / lower leg' },
  'it-band':               { name: 'IT Band Syndrome',               site: 'Outer knee' },
  'plantar-fasciitis':     { name: 'Plantar Fasciitis',              site: 'Heel / bottom of foot' },
  'patellar-tendinopathy': { name: 'Patellar Tendinopathy',          site: 'Below the kneecap' },
  'achilles-tendinopathy': { name: 'Achilles Tendinopathy',          site: 'Back of ankle' },
  'stress-fracture-risk':  { name: 'Stress Reaction / Fracture Risk', site: 'Shin or heel bone' },
  'rotator-cuff':          { name: 'Rotator Cuff Strain',            site: 'Shoulder' },
  'lower-back-strain':     { name: 'Lower Back Strain',              site: 'Lower back' },
  'elbow-tendinopathy':    { name: 'Elbow Tendinopathy',             site: 'Elbow / forearm' },
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoISO(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function Settings() {
  const navigate    = useNavigate()
  const current     = getAthleteMode()
  const isRts       = current.mode === 'return-to-sport'

  const [subStep,         setSubStep]         = useState('main')  // main | injury-select | injury-date
  const [injuryId,        setInjuryId]        = useState(current.injuryId ?? null)
  const [injuryOnsetDate, setInjuryOnsetDate] = useState(current.injuryOnsetDate ?? todayISO())
  const [hasBaseline,     setHasBaseline]     = useState(false)
  const [recalcState,     setRecalcState]     = useState('idle')  // idle | running | done

  useEffect(() => {
    supabase.from('baselines').select('id').eq('athlete_id', ATHLETE_ID).limit(1).maybeSingle()
      .then(({ data }) => setHasBaseline(data != null))
  }, [])

  function switchToPrevention() {
    setAthleteMode({ mode: 'prevention', injuryId: null, injuryOnsetDate: null, injuryName: null })
    navigate('/dashboard')
  }

  function saveRts() {
    const injuryName = injuryId === 'unclassified'
      ? "I'm not sure"
      : (INJURY_META[injuryId]?.name ?? null)
    setAthleteMode({ mode: 'return-to-sport', injuryId, injuryOnsetDate, injuryName })
    navigate('/dashboard')
  }

  return (
    <div className="settings">
      <div className="settings__header">
        <h1 className="settings__title">Settings</h1>
      </div>

      {subStep === 'main' && (
        <div className="settings__section">
          <p className="settings__section-label">Current mode</p>
          <div className="settings__mode-card">
            <span className="settings__mode-icon">{isRts ? '🩹' : '🏋️'}</span>
            <div>
              <p className="settings__mode-name">
                {isRts ? 'Recovery Mode' : 'Prevention Mode'}
              </p>
              {isRts && current.injuryName && (
                <p className="settings__mode-detail">{current.injuryName}</p>
              )}
            </div>
          </div>

          {isRts ? (
            <div className="settings__actions">
              <button className="settings__action-btn" onClick={() => setSubStep('injury-select')}>
                Change injury
              </button>
              <button className="settings__action-btn settings__action-btn--ghost" onClick={switchToPrevention}>
                Switch to Prevention Mode
              </button>
            </div>
          ) : (
            <button className="settings__action-btn" onClick={() => setSubStep('injury-select')}>
              Switch to Recovery Mode
            </button>
          )}
        </div>
      )}

      {subStep === 'main' && (
        <div className="settings__section">
          <p className="settings__section-label">Apple Health Data</p>
          <p className="settings__sub-text">Import your Apple Watch history to enhance recovery signal tracking</p>
          <button className="settings__action-btn" onClick={() => navigate('/import-health')}>
            Import Apple Health Data
          </button>
          {hasBaseline && (
            <button
              className="settings__action-btn settings__action-btn--ghost"
              disabled={recalcState === 'running'}
              onClick={async () => {
                setRecalcState('running')
                await backfillRecoveryMetrics(ATHLETE_ID)
                setRecalcState('done')
              }}
            >
              {recalcState === 'running'
                ? 'Recalculating…'
                : recalcState === 'done'
                ? 'Metrics recalculated'
                : 'Recalculate recovery metrics'}
            </button>
          )}
        </div>
      )}

      {subStep === 'injury-select' && (
        <div className="settings__section">
          <h2 className="settings__sub-title">Which injury are you recovering from?</h2>
          <p className="settings__sub-text">Select the closest match</p>

          <div className="onboarding__injury-list" style={{ maxHeight: '55vh' }}>
            {INJURY_ORDER.map(id => {
              const meta  = INJURY_META[id]
              const proto = PROTOCOLS[id]
              const desc  = proto?.description?.split('.')[0] + '.'
              return (
                <button
                  key={id}
                  className={`onboarding__injury-card ${injuryId === id ? 'selected' : ''}`}
                  onClick={() => setInjuryId(id)}
                >
                  <div className="onboarding__injury-card-main">
                    <span className="onboarding__injury-card-name">{meta.name}</span>
                    <span className="onboarding__injury-card-site">{meta.site}</span>
                  </div>
                  <p className="onboarding__injury-card-desc">{desc}</p>
                </button>
              )
            })}
            <button
              className={`onboarding__injury-card onboarding__injury-card--unsure ${injuryId === 'unclassified' ? 'selected' : ''}`}
              onClick={() => setInjuryId('unclassified')}
            >
              <div className="onboarding__injury-card-main">
                <span className="onboarding__injury-card-name">I'm not sure</span>
              </div>
              <p className="onboarding__injury-card-desc">We'll monitor pain patterns and suggest a protocol over time.</p>
            </button>
          </div>

          <button
            className="settings__action-btn"
            disabled={!injuryId}
            onClick={() => setSubStep('injury-date')}
          >
            Continue
          </button>
          <button className="settings__cancel" onClick={() => setSubStep('main')}>Cancel</button>
        </div>
      )}

      {subStep === 'injury-date' && (
        <div className="settings__section">
          <h2 className="settings__sub-title">When did this start?</h2>
          <p className="settings__sub-text">We use this to track your recovery timeline</p>

          <div className="onboarding__date-quicksels">
            <button
              className={`onboarding__date-quicksel ${injuryOnsetDate === todayISO() ? 'selected' : ''}`}
              onClick={() => setInjuryOnsetDate(todayISO())}
            >
              Today
            </button>
            <button
              className={`onboarding__date-quicksel ${injuryOnsetDate === daysAgoISO(5) ? 'selected' : ''}`}
              onClick={() => setInjuryOnsetDate(daysAgoISO(5))}
            >
              This week
            </button>
            <button
              className={`onboarding__date-quicksel ${injuryOnsetDate === daysAgoISO(14) ? 'selected' : ''}`}
              onClick={() => setInjuryOnsetDate(daysAgoISO(14))}
            >
              2+ weeks ago
            </button>
          </div>

          <div className="onboarding__date-field">
            <label className="onboarding__date-label">Or pick a specific date</label>
            <input
              type="date"
              className="onboarding__date-input"
              value={injuryOnsetDate}
              max={todayISO()}
              onChange={e => setInjuryOnsetDate(e.target.value)}
            />
          </div>

          <button className="settings__action-btn" onClick={saveRts}>
            Save
          </button>
          <button className="settings__cancel" onClick={() => setSubStep('injury-select')}>Back</button>
        </div>
      )}
    </div>
  )
}
