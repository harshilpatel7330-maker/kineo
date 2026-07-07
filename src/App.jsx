import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { isReturnToSport } from './utils/athleteMode'
import CheckIn from './pages/CheckIn'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import InjuryDetail from './pages/InjuryDetail'
import InjuryHistory from './pages/InjuryHistory'
import ImportHealthData from './pages/ImportHealthData'
import Recovery from './pages/Recovery'
import RTSCheckIn from './pages/RTSCheckIn'
import Graduated from './pages/Graduated'
import Insights from './pages/Insights'
import Settings from './pages/Settings'
import LogSession from './pages/LogSession'
import Onboarding from './pages/Onboarding'
import Recommendation from './pages/Recommendation'
import SessionHistory from './pages/SessionHistory'
import LogProtocol from './pages/LogProtocol'
import './App.css'

// Stripped from production bundle by Vite dead-code elimination.
// import.meta.env.DEV is replaced with `false` at build time, so the
// dynamic import is never included in a production chunk.
const SeedData    = import.meta.env.DEV ? lazy(() => import('./pages/SeedData'))    : null
const AdminEntry  = import.meta.env.DEV ? lazy(() => import('./pages/AdminEntry'))  : null

function RootRedirect() {
  const setupDone = localStorage.getItem('kineo_setup_done')
  if (!setupDone) return <Navigate to="/onboarding" replace />
  if (isReturnToSport()) return <Navigate to="/recovery" replace />
  return <Navigate to="/dashboard" replace />
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
          <Route path="/injury/:injuryId" element={<InjuryDetail />} />
          <Route path="/injury-history" element={<InjuryHistory />} />
          <Route path="/import-health" element={<ImportHealthData />} />
          <Route path="/recovery" element={<Recovery />} />
          <Route path="/rts-checkin" element={<RTSCheckIn />} />
          <Route path="/log-protocol" element={<LogProtocol />} />
          <Route path="/graduated" element={<Graduated />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/settings" element={<Settings />} />
          {import.meta.env.DEV && SeedData && (
            <Route path="/seed" element={<Suspense fallback={null}><SeedData /></Suspense>} />
          )}
          {import.meta.env.DEV && AdminEntry && (
            <Route path="/admin" element={<Suspense fallback={null}><AdminEntry /></Suspense>} />
          )}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
