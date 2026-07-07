import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { getAthleteId } from '../utils/athleteId'
import './CheckIn.css'
import './RTSCheckIn.css'
import './LogProtocol.css'

const ATHLETE_ID = getAthleteId()

function localToday() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PAIN_EMOJIS = ['😊', '🙂', '😐', '😐', '😟', '😟', '😣', '😣', '😖', '😖', '🤕']

export default function LogProtocol() {
  const navigate = useNavigate()

  const [completion,   setCompletion]   = useState(null)
  const [painDuring,   setPainDuring]   = useState(0)
  const [painAfter,    setPainAfter]    = useState(0)
  const [durationMin,  setDurationMin]  = useState('')
  const [loading,      setLoading]      = useState(false)

  const sessionDone = completion !== null && completion !== 'none'

  async function handleSave() {
    if (!completion) return
    setLoading(true)
    try {
      const today = localToday()

      await supabase
        .from('athletes')
        .upsert({ id: ATHLETE_ID, email: `${ATHLETE_ID}@kineo.local` }, { onConflict: 'id' })

      const protocolData = {
        protocol_session_done: sessionDone,
        protocol_duration_min: durationMin !== '' ? parseInt(durationMin, 10) : null,
        protocol_pain_during:  sessionDone ? painDuring : null,
        protocol_pain_after:   sessionDone ? painAfter  : null,
        protocol_logged_at:    new Date().toISOString(),
      }

      const { data: existing } = await supabase
        .from('rts_checkins')
        .select('id')
        .eq('athlete_id', ATHLETE_ID)
        .eq('date', today)
        .maybeSingle()

      if (existing) {
        await supabase
          .from('rts_checkins')
          .update(protocolData)
          .eq('athlete_id', ATHLETE_ID)
          .eq('date', today)
      } else {
        // No morning check-in yet — insert a stub row with the protocol data
        await supabase.from('rts_checkins').insert({
          athlete_id:         ATHLETE_ID,
          date:               today,
          morning_stiffness:  0,
          pain_score:         0,
          protocol_adherence: completion,
          ...protocolData,
        })
      }

      // Log a pain_logs entry if protocol pain was significant
      const maxPain = sessionDone ? Math.max(painDuring, painAfter) : 0
      if (maxPain >= 5) {
        const { error: plErr } = await supabase.from('pain_logs').insert({
          athlete_id:           ATHLETE_ID,
          date:                 today,
          pain_score:           maxPain,
          trend:                'stable',
          pain_alters_movement: maxPain >= 7,
          location:             null,
        })
        if (plErr) console.warn('pain_logs insert (possible duplicate):', plErr)
      }

      navigate('/recovery', { state: { justLoggedProtocol: true } })
    } catch (err) {
      console.error('LogProtocol save error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="check-in log-protocol">
      <div className="check-in__header">
        <h1 className="check-in__title">Log Today's Session</h1>
        <p className="check-in__subtitle">How did your protocol go?</p>
      </div>

      {/* Completion */}
      <div className="check-in__field">
        <span className="check-in__label">Did you complete today's protocol?</span>
        <div className="rts-checkin__adherence-btns">
          {[
            { value: 'full',    label: 'Yes, all of it' },
            { value: 'partial', label: 'Some of it'     },
            { value: 'none',    label: "Couldn't do it" },
          ].map(opt => (
            <button
              key={opt.value}
              className={`rts-checkin__adherence-btn ${completion === opt.value ? 'selected' : ''}`}
              onClick={() => setCompletion(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pain + duration — only when something was done */}
      {sessionDone && (
        <>
          <div className="check-in__field">
            <div className="check-in__label-row">
              <span className="check-in__label">Pain during the protocol</span>
              <span className="check-in__emoji">{PAIN_EMOJIS[painDuring]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={painDuring}
              onChange={e => setPainDuring(parseInt(e.target.value, 10))}
              className="check-in__slider check-in__slider--neg"
            />
            <div className="check-in__track-labels">
              <span className="check-in__track-label">No pain (0)</span>
              <span className="check-in__track-label">Severe (10)</span>
            </div>
          </div>

          <div className="check-in__field">
            <div className="check-in__label-row">
              <span className="check-in__label">Pain after the protocol</span>
              <span className="check-in__emoji">{PAIN_EMOJIS[painAfter]}</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              value={painAfter}
              onChange={e => setPainAfter(parseInt(e.target.value, 10))}
              className="check-in__slider check-in__slider--neg"
            />
            <div className="check-in__track-labels">
              <span className="check-in__track-label">No pain (0)</span>
              <span className="check-in__track-label">Severe (10)</span>
            </div>
          </div>

          <div className="check-in__field">
            <span className="check-in__label">
              Duration <span className="log-protocol__optional">optional</span>
            </span>
            <div className="check-in__input-row">
              <input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 20"
                value={durationMin}
                onChange={e => setDurationMin(e.target.value)}
              />
              <span className="check-in__unit">min</span>
            </div>
          </div>
        </>
      )}

      <button
        className="check-in__submit"
        onClick={handleSave}
        disabled={loading || !completion}
      >
        {loading ? 'Saving...' : 'Save'}
      </button>
    </div>
  )
}
