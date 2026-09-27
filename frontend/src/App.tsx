import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { APP, roleAllowedHere } from '@/product'
import WrongAppPage from '@/pages/WrongAppPage'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import LoadsPage from '@/pages/LoadsPage'
import DriversPage from '@/pages/DriversPage'
import TrucksPage from '@/pages/TrucksPage'
import TrailersPage from '@/pages/TrailersPage'
import BrokersPage from '@/pages/BrokersPage'
import MyCompanyPage from '@/pages/MyCompanyPage'
import ExpensesPage from '@/pages/ExpensesPage'
import DashboardPage from '@/pages/DashboardPage'
import DispatchPage from '@/pages/DispatchPage'
import WeekBoardPage from '@/pages/WeekBoardPage'
import StatementPage from '@/pages/StatementPage'
import DispatchersPage from '@/pages/DispatchersPage'
import BillsPage from '@/pages/BillsPage'
import SettingsPage from '@/pages/SettingsPage'
import MaintenancePage from '@/pages/MaintenancePage'
import InvitePage from '@/pages/InvitePage'
import DriverApp from '@/driver/DriverApp'
import ChatPage from '@/pages/ChatPage'
import InvoicesPage from '@/pages/InvoicesPage'
import CompliancePage from '@/pages/CompliancePage'
import IftaPage from '@/pages/IftaPage'

/** Office pages: any signed-in office role. Drivers are sent to the driver app. */
function RequireOffice({ children }: { children: JSX.Element }) {
  const { user, isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  if (!roleAllowedHere(user?.role)) return <WrongAppPage />
  if (user?.role === 'driver') return <Navigate to="/driver" replace />
  if ((APP === 'dispatch' || user?.role === 'dispatcher') && OFFICE_ONLY.some(p => location.pathname === p || location.pathname.startsWith(p + '/')) && location.pathname !== '/dispatchers') return <Navigate to="/dispatch" replace />
  return children
}

/** Dispatchers land on the board; the office lands on the dashboard. */
function RoleHome() {
  const { user } = useAuth()
  return <Navigate to={APP === 'driver' ? '/driver' : APP === 'dispatch' || user?.role === 'dispatcher' ? '/dispatch' : '/dashboard'} replace />
}

const OFFICE_ONLY = ['/dashboard', '/weeks', '/bills', '/invoices', '/ifta', '/settings', '/maintenance', '/accounting', '/my-company', '/dispatchers']

function RequireDriver({ children }: { children: JSX.Element }) {
  const { user, isAuthenticated, loading } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.role !== 'driver') return APP === 'driver' ? <WrongAppPage /> : <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {APP === 'office' && <Route path="/register" element={<RegisterPage />} />}
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/driver/*" element={<RequireDriver><DriverApp /></RequireDriver>} />
      {APP !== 'driver' && <Route path="/" element={<RequireOffice><AppLayout /></RequireOffice>}>
        <Route index element={<RoleHome />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="compliance" element={<CompliancePage />} />
        <Route path="ifta" element={<IftaPage />} />
        <Route path="weeks" element={<WeekBoardPage />} />
        <Route path="weeks/:start/trucks/:truckId" element={<StatementPage />} />
        <Route path="dispatchers" element={<DispatchersPage />} />
        <Route path="bills" element={<BillsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="loads" element={<LoadsPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="trucks" element={<TrucksPage />} />
        <Route path="brokers" element={<BrokersPage />} />
        <Route path="dispatch" element={<DispatchPage />} />
        <Route path="my-company" element={<MyCompanyPage />} />
        <Route path="trailers" element={<TrailersPage />} />
        <Route path="accounting/expenses" element={<ExpensesPage />} />
        <Route path="*" element={<RoleHome />} />
      </Route>}
      {APP === 'driver' && <Route path="*" element={<Navigate to="/driver" replace />} />}
    </Routes>
  )
}
