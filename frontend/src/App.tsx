import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import AppLayout from '@/components/layout/AppLayout'
import LoginPage from '@/pages/LoginPage'
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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#1a2332]">
      <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Navigate to="/loads" replace />} />
        <Route path="loads" element={<LoadsPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="payments/advanced" element={<AdvancedPaymentsPage />} />
        <Route path="reports/*" element={<ReportsPage />} />
        <Route path="trucks" element={<TrucksPage />} />
        <Route path="brokers" element={<BrokersPage />} />
        <Route path="vendors" element={<VendorsPage />} />
        <Route path="dispatch" element={<PlaceholderPage title="Dispatch Board" />} />
        <Route path="my-company" element={<MyCompanyPage />} />
        <Route path="loadboards" element={<PlaceholderPage title="Loadboards" />} />
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
        <Route path="*" element={<Navigate to="/loads" replace />} />
      </Route>
    </Routes>
  )
}
