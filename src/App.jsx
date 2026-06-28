import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import CheckIn from './pages/CheckIn'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import LogSession from './pages/LogSession'
import Onboarding from './pages/Onboarding'
import SeedData from './pages/SeedData'
import Recommendation from './pages/Recommendation'
import './App.css'

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
          <Route path="/log-session" element={<LogSession />} />
          <Route path="/seed" element={<SeedData />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
