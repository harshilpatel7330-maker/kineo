import { NavLink } from 'react-router-dom'

const tabs = [
  { to: '/dashboard', label: 'Home',     emoji: '🏠' },
  { to: '/checkin',   label: 'Check In', emoji: '✅' },
  { to: '/sessions',  label: 'Sessions', emoji: '🏋️' },
  { to: '/history',   label: 'History',  emoji: '📊' },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {tabs.map(({ to, label, emoji }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `bottom-nav__tab${isActive ? ' bottom-nav__tab--active' : ''}`}
        >
          <span className="bottom-nav__emoji" aria-hidden="true">
            {emoji}
          </span>
          <span className="bottom-nav__label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
