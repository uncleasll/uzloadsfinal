import { useCallback, useEffect, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Phone } from 'lucide-react'
import toast from 'react-hot-toast'
import { driverApi, type DriverLoad } from '@/api/driver'
import { fetchFileUrl, type ChatAttachment } from '@/api/chat'
import { BigButton, Card, Header, PhotoButton, money } from './shared'
import { enqueue, newId } from './outbox'
import { whereAmI } from './geo'
import { nextAfter } from './TodayScreen'

const CACHE_KEY = 'karvan.driver.loads'
const STATUS_TONE: Record<string, string> = { New: 'bg-slate-100 text-slate-600', Dispatched: 'bg-[var(--accent-soft)] text-[var(--accent)]', 'En Route': 'bg-amber-50 text-amber-700', 'Picked-up': 'bg-amber-50 text-amber-700', Delivered: 'bg-emerald-50 text-emerald-700', Closed: 'bg-slate-100 text-slate-500' }

export default function LoadsScreen() {
  return <Routes><Route index element={<List />} /><Route path=":id" element={<Detail />} /></Routes>
}

function useLoads() {
  const [loads, setLoads] = useState<DriverLoad[]>(() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '[]') } catch { return [] } })
  const refresh = useCallback(async () => {
    try { const l = await driverApi.loads(); setLoads(l); localStorage.setItem(CACHE_KEY, JSON.stringify(l)) } catch { /* offline */ }
  }, [])
  useEffect(() => { refresh() }, [refresh])
  return { loads, refresh }
}

function List() {
  const { loads } = useLoads()
  const open = loads.filter(l => !['Delivered', 'Closed', 'Canceled', 'TONU'].includes(l.status))
  const done = loads.filter(l => ['Delivered', 'Closed', 'Canceled', 'TONU'].includes(l.status))
  return (
    <div className="space-y-3 p-3">
      <Header title="My loads" sub={`${open.length} open · ${done.length} done`} />
      {[['Open', open], ['Done', done]].map(([title, list]) => (
        <div key={title as string}>
          <div className="mb-1.5 px-1 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">{title as string}</div>
          {(list as DriverLoad[]).length === 0 && <Card><p className="text-sm text-slate-400">Nothing here.</p></Card>}
          <div className="space-y-2">
            {(list as DriverLoad[]).map(l => (
              <Link key={l.id} to={`/driver/loads/${l.id}`} className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-950">#{l.number} <span className="font-semibold text-slate-500">· {l.broker?.name || '—'}</span></span>
                  <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${STATUS_TONE[l.status] || 'bg-slate-100 text-slate-600'}`}>{l.status}</span>
                </div>
                <div className="mt-1 text-sm text-slate-700">{l.pickup?.city}, {l.pickup?.state} <ArrowRight className="inline h-3.5 w-3.5 text-slate-400" /> {l.delivery?.city}, {l.delivery?.state}</div>
                <div className="mt-0.5 flex items-center justify-between text-xs text-slate-500"><span>{l.pickup?.date ? new Date(l.pickup.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''} · {l.miles.toLocaleString()} mi</span><span className="font-semibold text-slate-800">{money(l.rate)}</span></div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Detail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { loads, refresh } = useLoads()
  const l = loads.find(x => String(x.id) === id)
  if (!l) return <div className="p-6 text-center text-sm text-slate-400">Loading…</div>

  const advance = async () => {
    if (!l.next_status) return
    if (l.next_status === 'Delivered' && !l.pod) return toast.error('Take the POD photo first')
    const pos = await whereAmI()
    await enqueue({ id: newId(), kind: 'status', url: `/api/v1/driver/loads/${l.id}/status`, label: `${l.number}: ${l.next_status}`, json: { status: l.next_status, at: new Date().toISOString(), ...(pos || {}) } })
    toast.success(l.next_status)
    const cached: DriverLoad[] = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]')
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached.map(x => x.id === l.id ? { ...x, status: l.next_status!, next_status: nextAfter(l.next_status!) } : x)))
    setTimeout(refresh, 1500)
  }

  return (
    <div className="space-y-3 p-3">
      <Header title={`Load #${l.number}`} sub={`${l.broker?.name || ''} · ${l.status}`} action={<button onClick={() => navigate(-1)} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-4 w-4" /></button>} />
      <Card>
        <StopBlock label="Pickup" stop={l.pickup} />
        <div className="my-3 border-t border-slate-100" />
        <StopBlock label="Delivery" stop={l.delivery} />
        {l.notes && <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">{l.notes}</p>}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{l.miles.toLocaleString()} miles{l.dispatcher ? ` · dispatcher ${l.dispatcher}` : ''}</span><span className="text-sm font-bold text-slate-900">{money(l.rate)}</span></div>
      </Card>
      <div className="grid gap-2">
        {l.next_status && <BigButton onClick={advance}>{l.next_status === 'Delivered' ? 'Mark delivered' : l.next_status === 'Picked-up' ? 'Loaded, leaving' : l.next_status === 'En Route' ? 'On my way' : 'Accept load'}<ArrowRight className="h-4 w-4" /></BigButton>}
        <PhotoButton label={l.pod ? 'Add another POD photo' : 'Take POD photo'} tone={l.pod ? 'secondary' : 'primary'} url={`/api/v1/driver/loads/${l.id}/photos`} fields={{ category: 'pod' }} onQueued={() => setTimeout(refresh, 1500)} />
        <div className="grid grid-cols-3 gap-2">
          <PhotoButton label="BOL" tone="secondary" url={`/api/v1/driver/loads/${l.id}/photos`} fields={{ category: 'bol' }} onQueued={() => setTimeout(refresh, 1500)}>BOL</PhotoButton>
          <PhotoButton label="Lumper receipt" tone="secondary" url={`/api/v1/driver/loads/${l.id}/photos`} fields={{ category: 'lumper' }} onQueued={() => setTimeout(refresh, 1500)}>Lumper</PhotoButton>
          <PhotoButton label="Scale ticket" tone="secondary" url={`/api/v1/driver/loads/${l.id}/photos`} fields={{ category: 'scale' }} onQueued={() => setTimeout(refresh, 1500)}>Scale</PhotoButton>
        </div>
        {l.broker?.phone && <a href={`tel:${l.broker.phone}`} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800"><Phone className="h-4 w-4" />Call {l.broker.name}</a>}
      </div>
      {l.photos.length > 0 && (
        <Card>
          <div className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">Documents on this load</div>
          <div className="grid grid-cols-3 gap-2">{l.photos.map(p => <Thumb key={p.id} a={p} />)}</div>
        </Card>
      )}
    </div>
  )
}

function StopBlock({ label, stop }: { label: string; stop: DriverLoad['pickup'] }) {
  if (!stop) return <div className="text-sm text-slate-400">{label}: not set</div>
  const addr = [stop.address, [stop.city, stop.state].filter(Boolean).join(', '), stop.zip].filter(Boolean).join(', ')
  return (
    <div>
      <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}{stop.date ? ` · ${new Date(stop.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}</div>
      <div className="text-base font-bold text-slate-950">{stop.title || stop.city}</div>
      <a href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer" className="text-sm text-[var(--accent)]">{addr}</a>
      {stop.notes && <p className="mt-1 text-xs text-slate-600">{stop.notes}</p>}
    </div>
  )
}

function Thumb({ a }: { a: ChatAttachment }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { let u: string | null = null; fetchFileUrl(a).then(x => { u = x; setSrc(x) }).catch(() => {}); return () => { if (u) URL.revokeObjectURL(u) } }, [a])
  return (
    <button onClick={() => src && window.open(src, '_blank')} className="relative aspect-square overflow-hidden rounded-lg bg-slate-100">
      {src && <img src={src} alt={a.category} className="h-full w-full object-cover" />}
      <span className="absolute bottom-1 left-1 rounded bg-slate-900/70 px-1 text-[0.625rem] font-bold uppercase text-white">{a.category}</span>
    </button>
  )
}
