import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { authApi, ROLE_LABELS, type Role } from '@/api/auth'
import { useAuth } from '@/hooks/useAuth'
import karvanLogo from '@/assets/karvan-logo.png'

const field = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
const label = 'mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400'

/** The invited person lands here from the link, sets a password, and is signed in. */
export default function InvitePage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { acceptInvite } = useAuth()
  const [preview, setPreview] = useState<{ name: string; email: string; role: Role; company_name: string } | null>(null)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    authApi.previewInvitation(token).then(setPreview).catch(e => setError((e as Error).message))
  }, [token])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 8) return toast.error('Password must be at least 8 characters')
    setLoading(true)
    try {
      const user = await acceptInvite(token, { password, phone: phone || undefined })
      toast.success(`Welcome to ${preview?.company_name}`)
      navigate(user.role === 'driver' ? '/driver' : user.role === 'dispatcher' ? '/dispatch' : '/dashboard', { replace: true })
    } catch (err) { toast.error((err as Error).message) }
    finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#07111f] px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src={karvanLogo} alt="Karvan" className="mx-auto h-12 w-12 object-contain" />
          <div className="mt-2 text-lg font-bold text-white">Karvan</div>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow-2xl shadow-slate-950/40">
          {error ? (
            <>
              <h1 className="text-xl font-bold text-slate-950">This link does not work</h1>
              <p className="mt-2 text-sm text-slate-600">{error}</p>
              <p className="mt-5 text-center text-xs text-slate-500"><Link to="/login" className="font-semibold text-blue-700 hover:underline">Sign in</Link></p>
            </>
          ) : !preview ? <p className="py-8 text-center text-sm text-slate-400">Checking the invitation…</p> : (
            <form onSubmit={submit}>
              <h1 className="text-xl font-bold text-slate-950">Hi {preview.name.split(' ')[0]}</h1>
              <p className="mb-5 mt-1 text-sm text-slate-600"><b>{preview.company_name}</b> invited you as {ROLE_LABELS[preview.role].toLowerCase()}. Choose a password to get in.</p>
              <div className="space-y-3">
                <div><label className={label}>Email</label><input value={preview.email} readOnly className={`${field} bg-slate-50 text-slate-500`} /></div>
                <div><label className={label}>Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" className={field} autoComplete="new-password" autoFocus /></div>
                {preview.role === 'driver' && <div><label className={label}>Phone</label><input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" className={field} autoComplete="tel" /></div>}
              </div>
              <button type="submit" disabled={loading} className="btn-primary mt-5 h-10 w-full rounded-lg text-sm">{loading ? 'Setting up…' : 'Join and sign in'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
