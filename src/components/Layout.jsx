import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import BottomNav from './BottomNav'
import { supabase } from '../supabaseClient'
import { getAthleteId } from '../utils/athleteId'

const HIDDEN_NAV_ROUTES    = ['/onboarding', '/recommendation']
// Banner is also suppressed on /checkin (already going there) and /seed (dev page)
const HIDDEN_BANNER_ROUTES = ['/onboarding', '/checkin', '/recommendation', '/seed']

export default function Layout() {
  const { pathname } = useLocation()
  const setupDone = localStorage.getItem('kineo_setup_done')
  const showNav   = setupDone && !HIDDEN_NAV_ROUTES.includes(pathname)

  const [needsCheckIn, setNeedsCheckIn] = useState(false)

  useEffect(() => {
    if (!setupDone || HIDDEN_BANNER_ROUTES.includes(pathname)) {
      setNeedsCheckIn(false)
      return
    }

    const athleteId = getAthleteId()
    if (!athleteId) return

    async function checkToday() {
      const _d = new Date()
      const today = `${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`
      const { data } = await supabase
        .from('checkins')
        .select('id')
        .eq('athlete_id', athleteId)
        .eq('date', today)
        .limit(1)
        .maybeSingle()
      setNeedsCheckIn(data == null)
    }

    checkToday()

    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkToday()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app-layout">
      {needsCheckIn && (
        <div className="checkin-nudge" role="status">
          <p className="checkin-nudge__text">
            Ready for today's check-in? Takes less than a minute.
          </p>
          <Link to="/checkin" className="checkin-nudge__btn">
            Check In
          </Link>
        </div>
      )}
      <main className={`app-main${showNav ? ' app-main--with-nav' : ''}`}>
        <Outlet />
      </main>
      {showNav && <BottomNav />}
    </div>
  )
}
