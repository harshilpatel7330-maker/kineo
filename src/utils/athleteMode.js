const KEY      = 'kineo_athlete_mode'
const GOAL_KEY = 'kineo_athlete_goal'

const EMPTY_GOAL = { goalType: null, goalName: null, goalDate: null, goalWeeklyVolume: null }

const MODE_DEFAULTS = { mode: 'prevention', injuryId: null, injuryOnsetDate: null, injuryName: null, userName: null }

export function getAthleteMode() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...MODE_DEFAULTS }
    return { ...MODE_DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...MODE_DEFAULTS }
  }
}

export function setAthleteMode(updates = {}) {
  const current = getAthleteMode()
  const next = {
    mode:            updates.mode            !== undefined ? updates.mode            : current.mode,
    injuryId:        updates.injuryId        !== undefined ? updates.injuryId        : current.injuryId,
    injuryOnsetDate: updates.injuryOnsetDate !== undefined ? updates.injuryOnsetDate : current.injuryOnsetDate,
    injuryName:      updates.injuryName      !== undefined ? updates.injuryName      : current.injuryName,
    userName:        updates.userName        !== undefined ? updates.userName        : current.userName,
  }
  localStorage.setItem(KEY, JSON.stringify(next))
}

export function getName() {
  return getAthleteMode().userName || 'Athlete'
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
