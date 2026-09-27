import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, PlayCircle, Radio, Smartphone, Wallet } from 'lucide-react'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { APP, APP_META, APP_URLS, DEMO_ENABLED, appForRole } from '@/product'
import karvanLogo from '@/assets/karvan-logo.png'

const PITCH: Record<typeof APP, string[]> = {
  office: ['Weekly statements that match your Excel to the cent', 'Loads, expenses, invoices and factoring in one place', 'See what needs paying before it is late'],
  dispatch: ['Every truck on one board: free, loaded, in the shop', 'Assign a load in one click, it lands on the driver\'s phone', 'Chat with drivers, POD photos come back stamped'],
  driver: ['Your load, one big button at a time', 'POD and receipts from the camera, works without signal', 'See your pay for the week, every week'],
}
const ICON = { office: Wallet, dispatch: Radio, driver: Smartphone }[APP]

/** One sign-in screen per product, in that product's colors, with a demo door for anyone curious. */
export default function LoginPage() {
  const { login, demo, sessionExpired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPass, setShowPass] = useState(false)
  const m = APP_META[APP]

  const landing = (role: string) => APP === 'driver' || role === 'driver' ? '/driver' : APP === 'dispatch' || role === 'dispatcher' ? '/dispatch' : location.state?.from?.pathname || APP_META[appForRole(role)].home

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return toast.error('Enter your email and password')
    setLoading(true)
    try { const user = await login(email, password); navigate(landing(user.role), { replace: true }) }
    catch (err) { toast.error((err as Error).message || 'Invalid credentials') }
    finally { setLoading(false) }
  }
  const tryDemo = async () => {
    setLoading(true)
    const slow = setTimeout(() => toast('Waking up the demo server, a few more seconds…', { id: 'demo-wake' }), 4000)
    try { const user = await demo(m.demoRole); toast.dismiss('demo-wake'); toast.success(`Welcome to ${user.company_name}`); navigate(landing(user.role), { replace: true }) }
    catch (err) { toast.dismiss('demo-wake'); toast.error((err as Error).message) }
    finally { clearTimeout(slow); setLoading(false) }
  }

  return (
    <div className="flex min-h-screen" style={{ background: m.bg }}>
      {/* Left: the product */}
      <div className="hidden w-[46%] flex-col justify-between p-10 text-white lg:flex" style={{ background: `linear-gradient(160deg, ${m.bg}, ${m.accent}33)` }}>
        <div className="flex items-center gap-3">
          <img src={m.icon} alt="" className="h-11 w-11 rounded-xl" />
          <div><div className="text-lg font-bold leading-tight">{m.name}</div><div className="text-xs text-white/60">Karvan for trucking companies</div></div>
        </div>
        <div>
          <ICON className="mb-5 h-10 w-10" style={{ color: m.accent }} />
          <h2 className="text-3xl font-bold leading-tight">{m.tagline}</h2>
          <ul className="mt-6 space-y-2.5 text-sm text-white/80">
            {PITCH[APP].map(t => <li key={t} className="flex gap-2.5"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: m.accent }} />{t}</li>)}
          </ul>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
          {(['office', 'dispatch', 'driver'] as const).filter(k => k !== APP && APP_URLS[k]).map(k => <a key={k} href={`${APP_URLS[k].replace(/\/+$/, '')}/login`} className="hover:text-white">{APP_META[k].name} →</a>)}
        </div>
      </div>

      {/* Right: sign in */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <img src={m.icon} alt="" className="h-10 w-10 rounded-xl" />
            <div><div className="text-base font-bold leading-tight text-white">{m.name}</div><div className="text-xs text-white/60">{m.tagline}</div></div>
          </div>
          <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-2xl shadow-black/40">
            <h1 className="text-xl font-bold text-slate-950">Sign in</h1>
            <p className="mb-5 mt-0.5 text-xs text-slate-500">{sessionExpired ? 'Your session ended. Sign in again.' : APP === 'driver' ? 'Use the link the office sent you, or your email and password.' : 'Your Karvan account.'}</p>
            <label className="block"><span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">Email</span>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]" /></label>
            <label className="mt-3 block"><span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">Password</span>
              <span className="relative block">
                <input type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" className="h-11 w-full rounded-lg border border-slate-200 px-3 pr-10 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)]" />
                <button type="button" onClick={() => setShowPass(v => !v)} aria-label="Show password" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">{showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </span></label>
            <button type="submit" disabled={loading} className="mt-5 h-11 w-full rounded-lg text-sm font-bold text-white transition disabled:opacity-50" style={{ background: m.accent }}>{loading ? 'Signing in…' : 'Sign in'}</button>
            {DEMO_ENABLED && (
              <button type="button" onClick={tryDemo} disabled={loading} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">
                <PlayCircle className="h-4 w-4" style={{ color: m.accent }} />Try the demo as {m.demoRole === 'admin' ? 'the owner' : m.demoRole === 'dispatcher' ? 'a dispatcher' : 'a driver'}
              </button>
            )}
            {APP === 'office' && <p className="mt-4 text-center text-xs text-slate-500">New company? <Link to="/register" className="font-semibold hover:underline" style={{ color: m.accent }}>Create an account</Link></p>}
          </form>
          <p className="mt-5 text-center text-xs text-white/30">© 2026 Karvan</p>
        </div>
      </div>
    </div>
  )
}
