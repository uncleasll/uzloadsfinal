import { useNavigate } from 'react-router-dom'
import { LogOut, Truck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import karvanLogo from '@/assets/karvan-logo.png'

/** Where a driver account lands until the driver app ships. Keeps drivers out of the office. */
export default function DriverHomePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-2"><img src={karvanLogo} alt="Karvan" className="h-7 w-7 rounded-lg bg-slate-900 p-1" /><span className="text-sm font-bold text-slate-900">Karvan</span></div>
        <button onClick={() => { logout(); navigate('/login', { replace: true }) }} className="btn-ghost h-9 rounded-lg px-3 text-xs"><LogOut className="h-4 w-4" />Sign out</button>
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-blue-50 text-blue-700"><Truck className="h-6 w-6" /></span>
          <h1 className="mt-3 text-lg font-bold text-slate-950">Hi {user?.name?.split(' ')[0]}</h1>
          <p className="mt-1 text-sm text-slate-600">Your account at <b>{user?.company_name}</b> is ready. The driver app, with your loads, documents and chat, is coming here next.</p>
        </div>
      </main>
    </div>
  )
}
