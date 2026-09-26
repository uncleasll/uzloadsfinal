import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, MessageSquare, Plus, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { dispatchApi, type Board, type BoardLoad, type BoardTruck } from '@/api/dispatch'
import { loadsApi } from '@/api/loads'
import { useEntities } from '@/hooks/useEntities'
import { formatCurrency } from '@/utils'
import PageShell, { Pill } from '@/components/ui/PageShell'
import { control } from '@/components/ui/Field'
import LoadForm from '@/components/loads/LoadForm'
import LoadModal from '@/components/loads/LoadModal'

const POLL_MS = 15_000
const STATE: Record<BoardTruck['state'], { label: string; tone: 'green' | 'slate' | 'blue' | 'amber' | 'red' }> = {
  free: { label: 'Free', tone: 'green' }, no_driver: { label: 'No driver', tone: 'slate' }, New: { label: 'Assigned', tone: 'blue' },
  Dispatched: { label: 'Dispatched', tone: 'blue' }, 'En Route': { label: 'En route', tone: 'amber' }, 'Picked-up': { label: 'Loaded', tone: 'amber' },
}

/** The dispatcher's board: every truck, what it is doing, and the loads that still need a truck. */
export default function DispatchPage() {
  const entities = useEntities()
  const [b, setB] = useState<Board | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'free' | 'busy'>('all')
  const [newFor, setNewFor] = useState<number | null | 'any'>(null)
  const [openLoad, setOpenLoad] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { setB(await dispatchApi.board()) } catch (e) { toast.error((e as Error).message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load(); const t = setInterval(load, POLL_MS); return () => clearInterval(t) }, [load])

  const trucks = useMemo(() => (b?.trucks || []).filter(t => filter === 'all' || (filter === 'free' ? t.state === 'free' : !!t.current_load)), [b, filter])

  const assign = async (l: BoardLoad, truckId: number) => {
    const t = b?.trucks.find(x => x.truck_id === truckId)
    try {
      await loadsApi.update(l.id, { truck_id: truckId, driver_id: t?.driver_id ?? undefined, status: 'Dispatched' } as never)
      toast.success(`#${l.number} → truck ${t?.unit_number}`); load()
    } catch (e) { toast.error((e as Error).message) }
  }

  const c = b?.counts
  return (
    <PageShell title="Dispatch" subtitle={b ? `${c!.free} free · ${c!.on_load} on a load · ${c!.unassigned} need a truck` : 'Loading…'}
      actions={<>
        <button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        <button onClick={() => setNewFor('any')} className="btn-primary h-9 rounded-lg px-3.5 text-xs"><Plus className="h-4 w-4" />New load</button>
      </>}
      toolbar={<div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
        {([['all', 'All trucks'], ['free', 'Free'], ['busy', 'On a load']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`rounded-md px-2.5 py-1 text-[0.6875rem] font-semibold transition ${filter === k ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
        ))}
      </div>}
    >
      {!b ? <div className="py-16 text-center text-slate-400">Loading…</div> : (
        <div className="grid gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="grid content-start gap-2.5 sm:grid-cols-2 2xl:grid-cols-3">
            {trucks.map(t => <TruckCard key={t.truck_id} t={t} onAssign={() => setNewFor(t.truck_id)} onOpenLoad={setOpenLoad} />)}
            {trucks.length === 0 && <p className="col-span-full py-12 text-center text-slate-400">No trucks here.</p>}
          </section>

          <aside className="space-y-2.5">
            <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <h2 className="text-xs font-bold text-slate-900">Needs a truck</h2>
                <span className="rounded-full bg-amber-50 px-2 text-[0.6875rem] font-bold text-amber-700">{b.unassigned.length}</span>
              </header>
              {b.unassigned.length === 0 ? <p className="px-4 py-6 text-center text-slate-400">Everything is covered.</p> : (
                <ul className="divide-y divide-slate-100">
                  {b.unassigned.map(l => (
                    <li key={l.id} className="px-4 py-2.5">
                      <button onClick={() => setOpenLoad(l.id)} className="font-bold text-blue-700 hover:underline">#{l.number}</button>
                      <span className="ml-1.5 text-slate-500">{l.broker || ''}</span>
                      <div className="text-slate-700">{place(l.pickup)} → {place(l.delivery)}</div>
                      <div className="mt-1 flex items-center gap-2 text-[0.6875rem] text-slate-500">
                        <span>{l.pickup?.date ? fmtDate(l.pickup.date) : '—'} · {formatCurrency(l.rate)}</span>
                        <select aria-label="Assign to truck" defaultValue="" onChange={e => e.target.value && assign(l, Number(e.target.value))} className={`${control} ml-auto h-7 w-auto px-1.5 text-[0.6875rem]`}>
                          <option value="">Assign to…</option>
                          {b.trucks.filter(t => t.driver_id).map(t => <option key={t.truck_id} value={t.truck_id}>{t.unit_number} · {t.driver}{t.state === 'free' ? '' : ' (busy)'}</option>)}
                        </select>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      )}

      {newFor !== null && <LoadForm entities={entities} presetTruckId={newFor === 'any' ? undefined : newFor} onClose={() => setNewFor(null)} onSaved={() => { setNewFor(null); load() }} />}
      {openLoad != null && <LoadModal loadId={openLoad} entities={entities} onClose={() => setOpenLoad(null)} onSaved={load} />}
    </PageShell>
  )
}

function TruckCard({ t, onAssign, onOpenLoad }: { t: BoardTruck; onAssign: () => void; onOpenLoad: (id: number) => void }) {
  const s = STATE[t.state] || STATE.free
  const l = t.current_load
  return (
    <div className={`rounded-lg border bg-white p-3.5 shadow-sm ${t.state === 'free' ? 'border-emerald-200' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0"><span className="text-sm font-bold text-slate-950">{t.unit_number}</span><span className="ml-2 truncate text-slate-600">{t.driver || 'No driver'}</span></div>
        <Pill tone={s.tone}>{s.label}</Pill>
      </div>
      {l ? (
        <div className="mt-2 rounded-md bg-slate-50 px-2.5 py-2">
          <button onClick={() => onOpenLoad(l.id)} className="font-bold text-blue-700 hover:underline">#{l.number}</button>
          <span className="ml-1.5 text-slate-500">{l.broker || ''}</span>
          <div className="text-slate-700">{place(l.pickup)} → {place(l.delivery)}</div>
          {l.next_stop && <div className="text-[0.6875rem] text-slate-500">Next: {l.next_stop.title || place(l.next_stop)}{l.next_stop.date ? ` · ${fmtDate(l.next_stop.date)}` : ''}{l.pod ? ' · POD ✓' : ''}</div>}
          {t.queued.length > 0 && <div className="mt-1 text-[0.6875rem] text-slate-400">+{t.queued.length} more queued</div>}
        </div>
      ) : t.state === 'no_driver' ? <p className="mt-2 text-[0.6875rem] text-slate-400">Assign a driver on the Trucks page.</p>
        : <p className="mt-2 text-[0.6875rem] text-emerald-700">Ready for a load.</p>}
      <div className="mt-2.5 flex items-center gap-2 text-[0.6875rem] text-slate-500">
        {t.last_position && <a href={`https://maps.google.com/?q=${t.last_position.lat},${t.last_position.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline"><MapPin className="h-3 w-3" />{timeAgo(t.last_position.at)}</a>}
        {t.last_activity && <span className="truncate">{t.last_activity_text}</span>}
        <span className="ml-auto flex shrink-0 gap-1">
          {t.conversation_id && <Link to={`/chat?c=${t.conversation_id}`} className="btn-secondary h-7 rounded-md px-2 text-[0.6875rem]"><MessageSquare className="h-3 w-3" />Chat</Link>}
          {t.driver_id && <button onClick={onAssign} className="btn-primary h-7 rounded-md px-2 text-[0.6875rem]"><Plus className="h-3 w-3" />Load</button>}
        </span>
      </div>
    </div>
  )
}

const place = (s: { city: string | null; state: string | null } | null) => (s ? [s.city, s.state].filter(Boolean).join(', ') || '—' : '—')
const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
function timeAgo(iso: string) { const s = (Date.now() - new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime()) / 1000; return s < 3600 ? `${Math.max(1, Math.floor(s / 60))}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago` }
