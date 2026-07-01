import { useNavigate, useParams } from 'react-router-dom'
import { PROTOCOLS } from '../utils/injuryProtocols'
import './InjuryDetail.css'

export default function InjuryDetail() {
  const { injuryId } = useParams()
  const navigate = useNavigate()
  const protocol = PROTOCOLS[injuryId]

  if (!protocol) {
    return (
      <div className="injury-detail injury-detail--not-found">
        <p className="injury-detail__not-found-text">Protocol not found for "{injuryId}".</p>
        <button className="injury-detail__back-btn" onClick={() => navigate(-1)}>
          ← Go back
        </button>
      </div>
    )
  }

  const name = injuryId
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace('It ', 'IT ')

  return (
    <div className="injury-detail">
      <button className="injury-detail__back-btn" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <h1 className="injury-detail__title">{name}</h1>
      <p className="injury-detail__disclaimer">{protocol.disclaimer}</p>

      <section className="injury-detail__section">
        <p className="injury-detail__description">{protocol.description}</p>
      </section>

      <section className="injury-detail__section">
        <h2 className="injury-detail__section-title">Immediate Actions</h2>
        <ol className="injury-detail__list injury-detail__list--ordered">
          {protocol.immediateActions.map((action, i) => (
            <li key={i}>{action}</li>
          ))}
        </ol>
      </section>

      <section className="injury-detail__section">
        <h2 className="injury-detail__section-title">Return-to-Training Timeline</h2>
        <div className="injury-detail__timeline">
          {protocol.returnToTraining.map((step, i) => (
            <div key={i} className="injury-detail__timeline-row">
              <span className="injury-detail__timeline-day">Day {step.day}</span>
              <span className="injury-detail__timeline-instruction">{step.instruction}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="injury-detail__section">
        <h2 className="injury-detail__section-title">Watch For</h2>
        <ul className="injury-detail__list">
          {protocol.watchFor.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="injury-detail__section injury-detail__section--escalation">
        <h2 className="injury-detail__section-title">When to Escalate</h2>
        <p className="injury-detail__escalation">{protocol.escalationCriteria}</p>
      </section>
    </div>
  )
}
