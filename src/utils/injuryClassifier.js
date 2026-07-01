export function classifyInjury({ painLocation, painScore, painTrend, mileageChangePct, acwr, workoutType, hardSessionsThisWeek }) {
  if (!painLocation || painScore === 0 || painScore == null) return null

  const hasLoadSpike    = (mileageChangePct != null && mileageChangePct >= 20) || (acwr != null && acwr >= 1.2)
  const hasMildLoadSpike = (mileageChangePct != null && mileageChangePct >= 15) || (acwr != null && acwr >= 1.2)
  const manyHardSessions = hardSessionsThisWeek != null && hardSessionsThisWeek >= 3

  // 1. Stress fracture — checked first, overrides shin/heel classifications
  if (painLocation === 'shin' || painLocation === 'heel') {
    if (painScore >= 6 || (painScore >= 4 && painTrend === 'worsening')) {
      return {
        injuryId: 'stress-fracture-risk',
        name: 'Stress Reaction / Stress Fracture Risk',
        confidence: 'high',
        confidenceReason: painScore >= 6
          ? `High pain score (${painScore}/10) at a bone stress location`
          : `Worsening pain (${painScore}/10) at a bone stress location`,
      }
    }
  }

  // 2. Shin splints
  if (painLocation === 'shin') {
    if (painScore >= 2 && painScore <= 6) {
      const isHigh = hasLoadSpike || workoutType === 'run'
      return {
        injuryId: 'shin-splints',
        name: 'Shin Splints (MTSS)',
        confidence: isHigh ? 'high' : 'moderate',
        confidenceReason: isHigh
          ? `Shin pain (${painScore}/10) with${hasLoadSpike ? ' load spike and' : ''} running activity`
          : `Shin pain (${painScore}/10) — no confirmed load spike`,
      }
    }
    if (painScore === 1) {
      return { injuryId: 'shin-splints', name: 'Shin Splints (MTSS)', confidence: 'low',
               confidenceReason: `Mild shin discomfort (1/10) — early monitoring` }
    }
  }

  // 3. Achilles tendinopathy
  if (painLocation === 'achilles') {
    if (painScore >= 2 && painScore <= 5) {
      const isHigh = workoutType === 'run' && hasMildLoadSpike
      return {
        injuryId: 'achilles-tendinopathy',
        name: 'Achilles Tendinopathy',
        confidence: isHigh ? 'high' : 'moderate',
        confidenceReason: isHigh
          ? `Achilles pain (${painScore}/10) in a runner with elevated load`
          : `Achilles pain (${painScore}/10) — typical tendinopathy presentation`,
      }
    }
    if (painScore === 1) {
      return { injuryId: 'achilles-tendinopathy', name: 'Achilles Tendinopathy', confidence: 'low',
               confidenceReason: `Mild Achilles discomfort (1/10)` }
    }
  }

  // 4. Plantar fasciitis (stress-fracture check already passed, so painScore < 6)
  if (painLocation === 'heel') {
    if (painScore >= 2 && painScore <= 5) {
      return {
        injuryId: 'plantar-fasciitis',
        name: 'Plantar Fasciitis',
        confidence: workoutType === 'run' ? 'high' : 'moderate',
        confidenceReason: workoutType === 'run'
          ? `Heel pain (${painScore}/10) in a runner — classic plantar fasciitis presentation`
          : `Heel pain (${painScore}/10) — possible plantar fasciitis`,
      }
    }
    if (painScore === 1) {
      return { injuryId: 'plantar-fasciitis', name: 'Plantar Fasciitis', confidence: 'low',
               confidenceReason: `Mild heel discomfort (1/10)` }
    }
  }

  // 5. Patellar tendinopathy
  if (painLocation === 'knee-front') {
    if (painScore >= 2 && painScore <= 6) {
      const isHigh = (workoutType === 'run' || workoutType === 'strength') && (hasMildLoadSpike || manyHardSessions)
      return {
        injuryId: 'patellar-tendinopathy',
        name: 'Patellar Tendinopathy',
        confidence: isHigh ? 'high' : 'moderate',
        confidenceReason: `Front-of-knee pain (${painScore}/10) — patellar tendon loading pattern`,
      }
    }
    if (painScore === 1) {
      return { injuryId: 'patellar-tendinopathy', name: 'Patellar Tendinopathy', confidence: 'low',
               confidenceReason: `Mild front-of-knee discomfort (1/10)` }
    }
  }

  // 6. IT band syndrome
  if (painLocation === 'knee-outer' || painLocation === 'hip-outer') {
    const side = painLocation === 'knee-outer' ? 'knee' : 'hip'
    if (painScore >= 2 && painScore <= 5) {
      const isHigh = workoutType === 'run' && (hasMildLoadSpike || manyHardSessions)
      return {
        injuryId: 'it-band',
        name: 'IT Band Syndrome',
        confidence: isHigh ? 'high' : 'moderate',
        confidenceReason: `Outer-${side} pain (${painScore}/10) — typical ITBS presentation`,
      }
    }
    if (painScore === 1) {
      return { injuryId: 'it-band', name: 'IT Band Syndrome', confidence: 'low',
               confidenceReason: `Mild outer-${side} discomfort (1/10)` }
    }
  }

  // 7. Rotator cuff strain
  if (painLocation === 'shoulder') {
    if (painScore >= 2 && painScore <= 5) {
      const isHigh = workoutType === 'strength' && manyHardSessions
      return {
        injuryId: 'rotator-cuff',
        name: 'Rotator Cuff Strain',
        confidence: isHigh ? 'high' : 'moderate',
        confidenceReason: `Shoulder pain (${painScore}/10) — rotator cuff loading pattern`,
      }
    }
    if (painScore === 1) {
      return { injuryId: 'rotator-cuff', name: 'Rotator Cuff Strain', confidence: 'low',
               confidenceReason: `Mild shoulder discomfort (1/10)` }
    }
  }

  // 8. Lower back strain
  if (painLocation === 'lower-back') {
    if (painScore >= 2 && painScore <= 6) {
      const isHigh = workoutType === 'strength' || hasLoadSpike
      return {
        injuryId: 'lower-back-strain',
        name: 'Lower Back Strain',
        confidence: isHigh ? 'high' : 'moderate',
        confidenceReason: `Lower back pain (${painScore}/10) — ${workoutType === 'strength' ? 'strength training' : hasLoadSpike ? 'elevated load' : 'muscle strain'} pattern`,
      }
    }
    if (painScore === 1) {
      return { injuryId: 'lower-back-strain', name: 'Lower Back Strain', confidence: 'low',
               confidenceReason: `Mild lower back discomfort (1/10)` }
    }
  }

  // 9. Elbow tendinopathy
  if (painLocation === 'elbow') {
    if (painScore >= 2 && painScore <= 5) {
      const isHigh = workoutType === 'strength' && manyHardSessions
      return {
        injuryId: 'elbow-tendinopathy',
        name: 'Elbow Tendinopathy',
        confidence: isHigh ? 'high' : 'moderate',
        confidenceReason: `Elbow/forearm pain (${painScore}/10) — tendon loading pattern`,
      }
    }
    if (painScore === 1) {
      return { injuryId: 'elbow-tendinopathy', name: 'Elbow Tendinopathy', confidence: 'low',
               confidenceReason: `Mild elbow/forearm discomfort (1/10)` }
    }
  }

  // 10. Unclassified — 'other' location or score >= 1 that didn't match above
  if (painScore >= 1) {
    return {
      injuryId: 'unclassified',
      name: 'Unclassified Pain',
      confidence: 'low',
      confidenceReason: `Pain at "${painLocation}" (${painScore}/10) — no specific injury pattern matched`,
    }
  }

  return null
}
