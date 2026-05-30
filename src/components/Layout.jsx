import { Outlet, useLocation } from 'react-router-dom'
import BottomNav from './BottomNav'

const HIDDEN_NAV_ROUTES = ['/onboarding', '/recommendation']

export default function Layout() {
  const { pathname } = useLocation()
  const setupDone = localStorage.getItem('kineo_setup_done')
  const showNav = setupDone && !HIDDEN_NAV_ROUTES.includes(pathname)

  return (
    <div className="app-layout">
      <main className={`app-main${showNav ? ' app-main--with-nav' : ''}`}>
        <Outlet />
      </main>
      {showNav && <BottomNav />}
    </div>
  )
}
