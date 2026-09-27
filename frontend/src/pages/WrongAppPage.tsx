import { useNavigate } from 'react-router-dom'
import { ArrowRight, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { APP, APP_META, APP_URLS, appForRole } from '@/product'
import { ROLE_LABELS, type Role } from '@/api/auth'
import karvanLogo from '@/assets/karvan-logo.png'

/** Signed in with a role that belongs to another Karvan product: point them there instead of showing an empty screen. */
export default function WrongAppPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const target = appForRole(user?.role)
  const url = APP_URLS[target]
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07111f] px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl shadow-slate-950/40">
        <img src={karvanLogo} alt="" className="mx-auto h-12 w-12 rounded-xl bg-slate-900 p-2" />
        <h1 className="mt-3 text-lg font-bold text-slate-950">This is {APP_META[APP].name}</h1>
        <p className="mt-1 text-sm text-slate-600">{user?.name}, your account is a {user ? ROLE_LABELS[user.role as Role].toLowerCase() : ''} account, which lives in <b>{APP_META[target].name}</b>.</p>
        {url ? <a href={`${url.replace(/\/+$/, '')}${APP_META[target].home}`} className="btn-primary mt-5 inline-flex h-10 w-full rounded-lg text-sm">Open {APP_META[target].name}<ArrowRight className="h-4 w-4" /></a>
          : <p className="mt-4 text-xs text-slate-500">Ask the office for the {APP_META[target].name} link.</p>}
        <button onClick={() => { logout(); navigate('/login', { replace: true }) }} className="btn-ghost mt-2 h-9 w-full rounded-lg text-xs"><LogOut className="h-3.5 w-3.5" />Sign out</button>
      </div>
    </div>
  )
}
