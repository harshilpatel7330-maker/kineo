const KEY = 'kineo_athlete_mode'

export function getAthleteMode() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { mode: 'prevention', injuryId: null, injuryOnsetDate: null, injuryName: null }
    return JSON.parse(raw)
  } catch {
    return { mode: 'prevention', injuryId: null, injuryOnsetDate: null, injuryName: null }
  }
}

export function setAthleteMode({ mode, injuryId = null, injuryOnsetDate = null, injuryName = null }) {
  localStorage.setItem(KEY, JSON.stringify({ mode, injuryId, injuryOnsetDate, injuryName }))
}

export function isReturnToSport() {
  return getAthleteMode().mode === 'return-to-sport'
}

export function isPreventionMode() {
  return getAthleteMode().mode !== 'return-to-sport'
}
