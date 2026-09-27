import { useRef, useState, type ReactNode } from 'react'
import { Camera, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '@/hooks/useAuth'
import { enqueue, newId } from './outbox'
import { shrinkPhoto, whereAmI } from './geo'
import karvanLogo from '@/assets/karvan-logo.png'

export function Header({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
      <img src={karvanLogo} alt="" className="h-8 w-8 rounded-lg bg-slate-900 p-1" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-bold leading-tight text-slate-950">{title}</h1>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
      {action}
    </header>
  )
}

export function SignOut() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  return <button onClick={() => { logout(); navigate('/login', { replace: true }) }} aria-label="Sign out" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><LogOut className="h-4 w-4" /></button>
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</section>
)

export const BigButton = ({ children, onClick, tone = 'primary', disabled }: { children: ReactNode; onClick?: () => void; tone?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) => (
  <button onClick={onClick} disabled={disabled}
    className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold transition active:scale-[0.99] disabled:opacity-40 ${
      tone === 'primary' ? 'bg-[var(--accent)] text-white' : tone === 'danger' ? 'bg-red-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
    {children}
  </button>
)

export const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Take one or more photos and queue them. The camera opens straight away on a phone; GPS is read in the
 * background and the server burns the stamp in. Works with no signal.
 */
export function PhotoButton({ label, url, fields, multiple, tone = 'primary', onQueued, children }: {
  label: string; url: string; fields: Record<string, string>; multiple?: boolean; tone?: 'primary' | 'secondary'
  onQueued?: () => void; children?: ReactNode
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const onFiles = async (list: FileList | null) => {
    if (!list || !list.length) return
    setBusy(true)
    try {
      const files = Array.from(list)
      const [pos, blobs] = await Promise.all([whereAmI(), Promise.all(files.map(f => shrinkPhoto(f)))])
      const taken = new Date(files[0].lastModified || Date.now()).toISOString()
      await enqueue({
        id: newId(), kind: multiple ? 'inspection' : 'photo', url, label,
        fields: { ...fields, taken_at: taken, ...(pos ? { lat: String(pos.lat), lng: String(pos.lng) } : {}) },
        files: blobs.map((b, i) => ({ field: multiple ? 'files' : 'file', name: files[i].name || `photo-${i + 1}.jpg`, type: b.type || 'image/jpeg', blob: b })),
      })
      toast.success(navigator.onLine ? `${label} sent` : `${label} saved, will send when online`)
      onQueued?.()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }
  return (
    <>
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple={multiple} className="hidden" onChange={e => onFiles(e.target.files)} />
      <BigButton tone={tone} disabled={busy} onClick={() => ref.current?.click()}>{children || <><Camera className="h-5 w-5" />{busy ? 'Saving…' : label}</>}</BigButton>
    </>
  )
}
