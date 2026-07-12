const KEY      = 'kineo_athlete_mode'
const GOAL_KEY = 'kineo_athlete_goal'

const EMPTY_GOAL = { goalType: null, goalName: null, goalDate: null, goalWeeklyVolume: null }

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

export function getAthleteGoal() {
  try {
    const raw = localStorage.getItem(GOAL_KEY)
    if (!raw) return { ...EMPTY_GOAL }
    return { ...EMPTY_GOAL, ...JSON.parse(raw) }
  } catch {
    return { ...EMPTY_GOAL }
  }
}

export function setAthleteGoal({ goalType = null, goalName = null, goalDate = null, goalWeeklyVolume = null } = {}) {
  localStorage.setItem(GOAL_KEY, JSON.stringify({ goalType, goalName, goalDate, goalWeeklyVolume }))
}

export function hasGoal() {
  return getAthleteGoal().goalType != null
}
