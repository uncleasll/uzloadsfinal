import { useCallback, useEffect, useState } from 'react'
import { Plus, RefreshCw, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { maintenanceApi, type MaintenanceBoard, type MaintenanceRow, type ServiceStatus, type TruckHistory } from '@/api/maintenance'
import { formatCurrency } from '@/utils'

const TONE: Record<ServiceStatus, { pill: string; label: string; dot: string }> = {
  RED: { pill: 'bg-red-50 text-red-700 ring-red-100', label: 'Due', dot: 'bg-red-500' },
  AMBER: { pill: 'bg-amber-50 text-amber-700 ring-amber-100', label: 'Soon', dot: 'bg-amber-500' },
  GREEN: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-100', label: 'OK', dot: 'bg-emerald-500' },
  GRAY: { pill: 'bg-slate-100 text-slate-500 ring-slate-200', label: 'No history', dot: 'bg-slate-300' },
}
const field = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
const label = 'mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400'

/** The Fleet Command Center: every truck, every service, and what is due. */
export default function MaintenancePage() {
  const [board, setBoard] = useState<MaintenanceBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<MaintenanceRow | null>(null)
  const [filter, setFilter] = useState<'all' | 'RED' | 'AMBER'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    try { setBoard(await maintenanceApi.board()) }
    catch (e) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const rows = (board?.rows || []).filter(r => filter === 'all' || r.services.some(s => s.status === filter))
  const c = board?.counts

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 px-4 py-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Maintenance</h1>
              {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />}
            </div>
            <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">Odometer, services done, and what is due next. Statement odometers feed this automatically.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {([['all', 'All trucks'], ['RED', 'Due'], ['AMBER', 'Due soon']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={`rounded-md px-2.5 py-1.5 text-[0.6875rem] font-semibold transition ${filter === k ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
              ))}
            </div>
            <button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {(['RED', 'AMBER', 'GREEN', 'GRAY'] as ServiceStatus[]).map(s => (
            <div key={s} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${TONE[s].dot}`} />
              <div><div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{TONE[s].label}</div><div className="text-sm font-bold tabular-nums text-slate-950">{c?.[s] ?? 0}</div></div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70 p-3">
        <div className="space-y-2">
          {rows.map(r => (
            <button key={r.truck_id} onClick={() => setOpen(r)} className="flex w-full items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:border-blue-200 hover:shadow-md">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE[r.worst].dot}`} />
              <div className="w-28 shrink-0">
                <div className="text-sm font-bold text-slate-950">{r.unit_number}</div>
                <div className="truncate text-slate-500">{r.driver_name || 'No driver'}</div>
              </div>
              <div className="w-32 shrink-0">
                <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">Odometer</div>
                <div className="text-xs font-semibold tabular-nums text-slate-800">{r.odometer ? r.odometer.toLocaleString() : '—'}{r.odometer_date && <span className="ml-1 font-normal text-slate-400">{r.odometer_date.slice(5)}</span>}</div>
              </div>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {r.services.map(s => (
                  <span key={s.service_type} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1 ${TONE[s.status].pill}`} title={s.next_due_miles ? `Next at ${s.next_due_miles.toLocaleString()} mi` : s.next_due_date ? `Next on ${s.next_due_date}` : 'No history'}>
                    {s.service_type}{s.miles_left != null && s.status !== 'GRAY' ? ` · ${s.miles_left <= 0 ? 'overdue' : `${s.miles_left.toLocaleString()} mi`}` : s.days_left != null && s.status !== 'GRAY' ? ` · ${s.days_left <= 0 ? 'overdue' : `${s.days_left} d`}` : ''}
                  </span>
                ))}
              </div>
            </button>
          ))}
          {board && rows.length === 0 && <div className="py-16 text-center text-slate-400">Nothing here.</div>}
        </div>
      </div>

      {open && <TruckDrawer row={open} intervals={board?.intervals.map(i => i.service_type) || []} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}

function TruckDrawer({ row, intervals, onClose, onChanged }: { row: MaintenanceRow; intervals: string[]; onClose: () => void; onChanged: () => void }) {
  const [h, setH] = useState<TruckHistory | null>(null)
  const [odo, setOdo] = useState({ date: new Date().toISOString().slice(0, 10), reading: '' })
  const [svc, setSvc] = useState({ service_type: intervals[0] || 'Oil Change', date: new Date().toISOString().slice(0, 10), odometer: '', cost: '', vendor: '', notes: '' })
  const refresh = useCallback(() => maintenanceApi.history(row.truck_id).then(setH).catch(e => toast.error(e.message)), [row.truck_id])
  useEffect(() => { refresh() }, [refresh])

  const saveOdo = async () => {
    if (!odo.reading) return
    try { setH(await maintenanceApi.addOdometer(row.truck_id, odo.date, Number(odo.reading))); setOdo({ ...odo, reading: '' }); toast.success('Odometer saved'); onChanged() }
    catch (e) { toast.error((e as Error).message) }
  }
  const saveSvc = async () => {
    try {
      setH(await maintenanceApi.addService(row.truck_id, { service_type: svc.service_type, date: svc.date, odometer: svc.odometer ? Number(svc.odometer) : null, cost: Number(svc.cost) || 0, vendor: svc.vendor || null, notes: svc.notes || null }))
      setSvc({ ...svc, odometer: '', cost: '', vendor: '', notes: '' }); toast.success('Service recorded'); onChanged()
    } catch (e) { toast.error((e as Error).message) }
  }
  const remove = async (id: number) => {
    if (!confirm('Remove this service record?')) return
    try { await maintenanceApi.deleteService(id); refresh(); onChanged() } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer-panel max-w-xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Truck {row.unit_number}</h2>
            <p className="text-[0.6875rem] text-slate-400">{row.driver_name || 'No driver'} · odometer {row.odometer?.toLocaleString() ?? '—'}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5 text-xs">
          <section>
            <div className={label}>Record a service</div>
            <div className="grid grid-cols-2 gap-2">
              <select value={svc.service_type} onChange={e => setSvc({ ...svc, service_type: e.target.value })} className={field}>{intervals.map(i => <option key={i}>{i}</option>)}<option>Repair</option><option>Other</option></select>
              <input type="date" value={svc.date} onChange={e => setSvc({ ...svc, date: e.target.value })} className={field} />
              <input value={svc.odometer} onChange={e => setSvc({ ...svc, odometer: e.target.value.replace(/\D/g, '') })} placeholder="Odometer" inputMode="numeric" className={`${field} text-right`} />
              <input value={svc.cost} onChange={e => setSvc({ ...svc, cost: e.target.value.replace(/[^\d.]/g, '') })} placeholder="Cost" inputMode="decimal" className={`${field} text-right`} />
              <input value={svc.vendor} onChange={e => setSvc({ ...svc, vendor: e.target.value })} placeholder="Shop" className={field} />
              <input value={svc.notes} onChange={e => setSvc({ ...svc, notes: e.target.value })} placeholder="Notes" className={field} />
            </div>
            <button onClick={saveSvc} className="btn-primary mt-2 h-9 rounded-lg px-4 text-xs"><Plus className="h-4 w-4" />Record service</button>
          </section>
          <section>
            <div className={label}>Odometer reading</div>
            <div className="flex gap-2">
              <input type="date" value={odo.date} onChange={e => setOdo({ ...odo, date: e.target.value })} className={`${field} w-40`} />
              <input value={odo.reading} onChange={e => setOdo({ ...odo, reading: e.target.value.replace(/\D/g, '') })} placeholder="445984" inputMode="numeric" className={`${field} text-right`} />
              <button onClick={saveOdo} disabled={!odo.reading} className="btn-secondary h-9 shrink-0 rounded-lg px-3 text-xs">Save</button>
            </div>
          </section>
          <section>
            <div className={label}>Service history</div>
            {!h ? <div className="text-slate-400">Loading…</div> : h.services.length === 0 ? <div className="text-slate-400">No services recorded yet.</div> : (
              <table className="w-full text-xs"><tbody className="divide-y divide-slate-100">
                {h.services.map(s => (
                  <tr key={s.id}><td className="py-1.5 font-semibold text-slate-900">{s.service_type}</td><td className="py-1.5 text-slate-600">{s.date}</td><td className="py-1.5 text-right tabular-nums text-slate-600">{s.odometer?.toLocaleString() ?? '—'}</td><td className="py-1.5 text-right tabular-nums">{s.cost ? formatCurrency(s.cost) : ''}</td><td className="py-1.5 text-slate-500">{s.vendor || ''}</td><td className="py-1.5 text-right"><button onClick={() => remove(s.id)} className="text-slate-300 hover:text-red-600" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button></td></tr>
                ))}
              </tbody></table>
            )}
          </section>
          <section>
            <div className={label}>Odometer log</div>
            {h && h.odometer.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">{h.odometer.map(o => <span key={o.id} className="rounded-md bg-slate-100 px-2 py-0.5 tabular-nums text-slate-700" title={o.source || ''}>{o.date.slice(5)} · {o.reading.toLocaleString()}</span>)}</div>
            ) : <div className="text-slate-400">No readings yet. Entering an odometer end on a statement adds one.</div>}
          </section>
        </div>
      </aside>
    </>
  )
}
