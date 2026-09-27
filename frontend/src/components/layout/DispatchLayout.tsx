import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Building2, Container, Headset, LogOut, MessageSquare, Package, Radio, Truck, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { chatApi } from '@/api/chat'
import { APP_META } from '@/product'

const TABS = [
  { to: '/dispatch', label: 'Board', icon: Radio },
  { to: '/loads', label: 'Loads', icon: Package },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
  { to: '/drivers', label: 'Drivers', icon: Users },
  { to: '/trucks', label: 'Trucks', icon: Truck },
  { to: '/trailers', label: 'Trailers', icon: Container },
  { to: '/brokers', label: 'Brokers', icon: Building2 },
  { to: '/dispatchers', label: 'My pay', icon: Headset },
]

/** Karvan Dispatch: a board-first product with a top bar, no side menu. Dark bar, orange accent, wide workspace. */
export default function DispatchLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const m = APP_META.dispatch
  useEffect(() => {
    let alive = true
    const tick = () => chatApi.conversations().then(cs => { if (alive) setUnread(cs.reduce((s, c) => s + c.unread, 0)) }).catch(() => {})
    tick(); const t = setInterval(tick, 30_000)
    return () => { alive = false; clearInterval(t) }
  }, [])
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-stone-100 text-slate-900">
      <header className="flex h-12 shrink-0 items-center gap-2 px-3 text-white" style={{ background: m.bg }}>
        <img src={m.icon} alt="" className="h-7 w-7 rounded-md" />
        <span className="mr-4 text-sm font-bold">Dispatch</span>
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {TABS.map(t => (
            <NavLink key={t.to} to={t.to} end={t.to === '/dispatch'} className={({ isActive }) => `flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition ${isActive ? 'text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'}`} style={({ isActive }) => isActive ? { background: m.accent } : undefined}>
              <t.icon className="h-3.5 w-3.5" />{t.label}{t.to === '/chat' && unread > 0 && <span className="rounded-full bg-white px-1.5 text-[0.625rem] font-bold" style={{ color: m.accent }}>{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <span className="hidden text-xs text-white/60 sm:block">{user?.name} · {user?.company_name}</span>
        <button onClick={() => { logout(); navigate('/login', { replace: true }) }} aria-label="Sign out" className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-white/10 hover:text-white"><LogOut className="h-4 w-4" /></button>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
        <Outlet />
      </main>
    </div>
  )
}
