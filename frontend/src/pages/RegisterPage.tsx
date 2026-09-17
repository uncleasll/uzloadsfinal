import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import karvanLogo from '@/assets/karvan-logo.png'

const field = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
const label = 'mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400'

/** A trucking company signs up: company name plus its first owner account. */
export default function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [f, setF] = useState({ company_name: '', name: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF(p => ({ ...p, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.company_name.trim() || !f.name.trim() || !f.email.trim()) return toast.error('Fill in company, your name and email')
    if (f.password.length < 8) return toast.error('Password must be at least 8 characters')
    setLoading(true)
    try {
      await register(f)
      toast.success(`Welcome, ${f.company_name.trim()}`)
      navigate('/settings', { replace: true })
    } catch (err) { toast.error((err as Error).message || 'Could not create the account') }
    finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07111f] px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src={karvanLogo} alt="Karvan" className="mx-auto h-12 w-12 object-contain" />
          <div className="mt-2 text-lg font-bold text-white">Karvan</div>
          <div className="text-xs text-slate-400">Weekly statements for trucking companies</div>
        </div>
        <form onSubmit={submit} className="rounded-2xl bg-white p-6 shadow-2xl shadow-slate-950/40">
          <h1 className="text-xl font-bold text-slate-950">Create your company</h1>
          <p className="mb-5 mt-1 text-xs text-slate-500">You will add trucks, drivers and deduction rules right after this.</p>
          <div className="space-y-3">
            <div><label className={label}>Company name</label><input value={f.company_name} onChange={set('company_name')} placeholder="Eastern Green LLC" className={field} autoFocus /></div>
            <div><label className={label}>Your name</label><input value={f.name} onChange={set('name')} placeholder="Sam" className={field} /></div>
            <div><label className={label}>Email</label><input type="email" value={f.email} onChange={set('email')} placeholder="you@company.com" className={field} autoComplete="email" /></div>
            <div><label className={label}>Password</label><input type="password" value={f.password} onChange={set('password')} placeholder="At least 8 characters" className={field} autoComplete="new-password" /></div>
          </div>
          <button type="submit" disabled={loading} className="btn-primary mt-5 h-10 w-full rounded-lg text-sm">{loading ? 'Creating…' : 'Create company'}</button>
          <p className="mt-4 text-center text-xs text-slate-500">Already have an account? <Link to="/login" className="font-semibold text-blue-700 hover:underline">Sign in</Link></p>
        </form>
      </div>
    </div>
  )
}
