import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import CheckIn from './pages/CheckIn'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import LogSession from './pages/LogSession'
import Onboarding from './pages/Onboarding'
import Recommendation from './pages/Recommendation'
import SessionHistory from './pages/SessionHistory'
import './App.css'

// Stripped from production bundle by Vite dead-code elimination.
// import.meta.env.DEV is replaced with `false` at build time, so the
// dynamic import is never included in a production chunk.
const SeedData = import.meta.env.DEV
  ? lazy(() => import('./pages/SeedData'))
  : null

function RootRedirect() {
  const setupDone = localStorage.getItem('kineo_setup_done')
  return <Navigate to={setupDone ? '/dashboard' : '/onboarding'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/checkin" element={<CheckIn />} />
          <Route path="/recommendation" element={<Recommendation />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/history" element={<History />} />
          <Route path="/sessions" element={<SessionHistory />} />
          <Route path="/log-session" element={<LogSession />} />
          {import.meta.env.DEV && SeedData && (
            <Route path="/seed" element={<Suspense fallback={null}><SeedData /></Suspense>} />
          )}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
