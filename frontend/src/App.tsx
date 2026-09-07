import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import EngagementsPage from './pages/EngagementsPage'
import EngagementDetailPage from './pages/EngagementDetailPage'
import CoordinationPage from './pages/CoordinationPage'
import PleniairePage from './pages/PleniairePage'
import TimelinePage from './pages/TimelinePage'
import AdminPage from './pages/AdminPage'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/connexion" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/engagements" element={<EngagementsPage />} />
              <Route path="/engagements/:id" element={<EngagementDetailPage />} />
              <Route path="/coordination" element={<CoordinationPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/plenaire" element={<PleniairePage />} />
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
