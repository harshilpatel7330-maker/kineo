const STORAGE_KEY = 'kineo_athlete_id'

/**
 * Returns this device's athlete ID, generating and persisting
 * a new one on first visit. This is what isolates each tester's
 * data from every other tester using the same deployed app.
 */
export function getAthleteId() {
  let id = localStorage.getItem(STORAGE_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(STORAGE_KEY, id)
  }
  return id
}