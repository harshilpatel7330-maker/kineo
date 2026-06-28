export function calcReadiness(checkin) {
  if (!checkin) return null
  const { sleep = 3, stress = 3, fatigue = 3, soreness = 3 } = checkin
  return Math.round(((6 - fatigue) + (6 - soreness) + sleep + (6 - stress)) / 16 * 100)
}
