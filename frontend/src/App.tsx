import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import LoadsPage from '@/pages/LoadsPage'
import DriversPage from '@/pages/DriversPage'
import PayrollPage from '@/pages/PayrollPage'
import ReportsPage from '@/pages/ReportsPage'
import TrucksPage from '@/pages/TrucksPage'
import TrailersPage from '@/pages/TrailersPage'
import BrokersPage from '@/pages/BrokersPage'
import VendorsPage from '@/pages/VendorsPage'
import PlaceholderPage from '@/pages/PlaceholderPage'
import MyCompanyPage from '@/pages/MyCompanyPage'
import ExpensesPage from '@/pages/ExpensesPage'
import AdvancedPaymentsPage from '@/pages/AdvancedPaymentsPage'
import PaymentsPage from '@/pages/PaymentsPage'
import DashboardPage from '@/pages/DashboardPage'
import DispatchBoardPage from '@/pages/DispatchBoardPage'
import WeekBoardPage from '@/pages/WeekBoardPage'
import StatementPage from '@/pages/StatementPage'
import DispatchersPage from '@/pages/DispatchersPage'
import BillsPage from '@/pages/BillsPage'
import SettingsPage from '@/pages/SettingsPage'
import MaintenancePage from '@/pages/MaintenancePage'

function RequireAuth({ children }: { children: JSX.Element }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()
  if (loading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="weeks" element={<WeekBoardPage />} />
        <Route path="weeks/:start/trucks/:truckId" element={<StatementPage />} />
        <Route path="dispatchers" element={<DispatchersPage />} />
        <Route path="bills" element={<BillsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="loads" element={<LoadsPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="payments/advanced" element={<AdvancedPaymentsPage />} />
        <Route path="reports/*" element={<ReportsPage />} />
        <Route path="trucks" element={<TrucksPage />} />
        <Route path="brokers" element={<BrokersPage />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="dispatch" element={<DispatchBoardPage />} />
        <Route path="my-company" element={<MyCompanyPage />} />
        <Route path="trailers" element={<TrailersPage />} />
        <Route path="fuel/*" element={<PlaceholderPage title="Fuel" />} />
        <Route path="accounting/expenses" element={<ExpensesPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="accounting/*" element={<PlaceholderPage title="Accounting" />} />
        <Route path="tolls/*" element={<PlaceholderPage title="Tolls" />} />
        <Route path="safety/*" element={<PlaceholderPage title="Safety" />} />
        <Route path="ifta/*" element={<PlaceholderPage title="IFTA" />} />
        <Route path="users" element={<PlaceholderPage title="Users" />} />
        <Route path="data-library/*" element={<PlaceholderPage title="Data Library" />} />
        <Route path="docs" element={<PlaceholderPage title="Docs Exchange" />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
