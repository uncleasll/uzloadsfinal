import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Plus, RefreshCw, Settings2, Trash2, Unlock, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  periodLabel, shiftWeek, weekStart, weeksApi,
  type StatementDetail, type StatementLine,
} from '@/api/weeks'
import { formatCurrency } from '@/utils'
import { Money, StatusPill } from './WeekBoardPage'
import QuickLoadModal from '@/components/loads/QuickLoadModal'
import RulesPanel from '@/components/weeks/RulesPanel'

const KIND_LABEL: Record<string, string> = {
  fee: 'Fee', template: 'Fixed deductions', fuel: 'Diesel', expense: 'Expenses', manual: 'Added on this statement',
  driver_pay: 'Driver pay', driver_deduction: 'Driver deductions', carry_in: 'Balance from last week',
}
const TRUCK_SIDE = ['fee', 'template', 'fuel', 'expense', 'manual', 'carry_in'] as const
const input = 'h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'

export default function StatementPage() {
  const { start: rawStart = '', truckId: rawTruck = '' } = useParams()
  const navigate = useNavigate()
  const start = weekStart(rawStart)
  const truckId = Number(rawTruck)
  const [s, setS] = useState<StatementDetail | null>(null)
  const [busy, setBusy] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [addingLoad, setAddingLoad] = useState(false)

  const load = useCallback(async () => {
    setBusy(true)
    try { setS(await weeksApi.truckWeek(start, truckId)) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }, [start, truckId])
  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<StatementDetail>, done?: string) => {
    setBusy(true)
    try { setS(await fn()); if (done) toast.success(done) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  const locked = s?.status === 'paid'
  const lines = s?.lines || []
  const loads = lines.filter(l => l.kind === 'load')
  const group = (kind: string) => lines.filter(l => l.kind === kind)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 lg:px-5">
        <div className="flex items-center gap-3">
          <Link to={`/weeks?week=${start}`} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900" aria-label="Back to board"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Truck {s?.unit_number ?? '…'}</h1>
              {s && <StatusPill status={s.status} />}
              {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />}
            </div>
            <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">
              {periodLabel(start)} · {s?.driver_name || 'No driver'}{s?.ach_reference ? ` · ACH ${s.ach_reference}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 shadow-sm">
            <button onClick={() => navigate(`/weeks/${shiftWeek(start, -1)}/trucks/${truckId}`)} className="grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-50" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
            <span className="border-x border-slate-200 px-3 text-xs font-semibold text-slate-800">{s?.period ?? ''}</span>
            <button onClick={() => navigate(`/weeks/${shiftWeek(start, 1)}/trucks/${truckId}`)} className="grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-50" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <button onClick={() => setRulesOpen(v => !v)} aria-expanded={rulesOpen} className={`btn-secondary h-9 rounded-lg px-3 text-xs ${rulesOpen ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}`}>
            <Settings2 className="h-3.5 w-3.5" />Rules
          </button>
          <button onClick={load} disabled={busy} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />Recalculate</button>
          {s && <StatusActions s={s} busy={busy} run={run} />}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70 p-3">
        {!s ? <div className="py-16 text-center text-slate-400">Loading…</div> : (
          <div className="mx-auto max-w-[90rem] space-y-3">
            {rulesOpen && <RulesPanel truckId={truckId} driverId={s.driver_id} onSaved={() => { setRulesOpen(false); load() }} onClose={() => setRulesOpen(false)} />}

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,1fr)]">
              {/* Loads */}
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <h2 className="text-sm font-bold text-slate-900">Loads <span className="ml-1 text-slate-400">{loads.length}</span></h2>
                  <div className="flex items-center gap-3">
                    <Link to="/loads" className="text-[0.6875rem] font-semibold text-slate-500 hover:underline">All loads</Link>
                    {!locked && <button onClick={() => setAddingLoad(true)} className="btn-primary h-8 rounded-lg px-3 text-[0.6875rem]"><Plus className="h-3.5 w-3.5" />Add load</button>}
                  </div>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50/80 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2 text-left">Load #</th><th className="px-3 py-2 text-left">Broker</th><th className="px-3 py-2 text-left">Dispatcher</th>
                        <th className="px-3 py-2 text-left">PU</th><th className="px-3 py-2 text-left">DEL</th><th className="px-3 py-2 text-left">From</th><th className="px-3 py-2 text-left">To</th>
                        <th className="px-3 py-2 text-right">Miles</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-center">POD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loads.length === 0 && <tr><td colSpan={10} className="py-10 text-center text-slate-400">No loads this week.</td></tr>}
                      {loads.map(l => <LoadRow key={l.id} line={l} />)}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50/80 font-bold text-slate-900">
                        <td className="px-3 py-2" colSpan={8}>Gross</td>
                        <td className="px-3 py-2 text-right"><Money value={s.gross} strong /></td><td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {s.driver_pay_type === 'per_mile' && <OdometerRow s={s} locked={locked} run={run} />}
              </section>

              {/* Deductions and results */}
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <header className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Deductions</h2></header>
                <div className="divide-y divide-slate-100">
                  {TRUCK_SIDE.map(kind => {
                    const items = group(kind)
                    if (!items.length && kind !== 'manual') return null
                    return (
                      <div key={kind} className="px-4 py-2.5">
                        <div className="mb-1 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{KIND_LABEL[kind]}</div>
                        {items.map(l => (
                          <div key={l.id} className="flex items-center justify-between gap-2 py-0.5 text-xs text-slate-700">
                            <span className="min-w-0 truncate">{l.label}</span>
                            <span className="flex shrink-0 items-center gap-2">
                              <Money value={l.amount} />
                              {kind === 'manual' && !locked && (
                                <button onClick={() => run(() => weeksApi.removeLine(s.id, l.id))} className="text-slate-300 hover:text-red-600" aria-label="Remove line"><Trash2 className="h-3.5 w-3.5" /></button>
                              )}
                            </span>
                          </div>
                        ))}
                        {kind === 'manual' && !locked && <AddLine onAdd={(label, amount) => run(() => weeksApi.addLine(s.id, label, amount))} />}
                        {kind === 'carry_in' && !locked && (
                          <button onClick={() => run(() => weeksApi.setCarry(s.id, false))} className="mt-1 text-[0.6875rem] font-semibold text-blue-700 hover:underline">Do not carry this week</button>
                        )}
                      </div>
                    )
                  })}
                  {!s.carry_enabled && !locked && (
                    <div className="px-4 py-2 text-[0.6875rem] text-slate-500">Last week's balance is not carried. <button onClick={() => run(() => weeksApi.setCarry(s.id, true))} className="font-semibold text-blue-700 hover:underline">Carry it</button></div>
                  )}
                  <div className="px-4 py-2.5">
                    <div className="mb-1 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{KIND_LABEL.driver_pay}</div>
                    {group('driver_pay').map(l => <div key={l.id} className="flex justify-between py-0.5 text-xs text-slate-700"><span>{l.label}</span><Money value={l.amount} /></div>)}
                    {!group('driver_pay').length && <div className="text-xs text-slate-400">{s.driver_id ? 'No driver pay this week' : 'No driver on this truck'}</div>}
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-slate-200 bg-slate-50/80 px-4 py-3 text-xs">
                  <Row label="Gross" value={s.gross} />
                  <Row label={`Fee ${s.fee_pct ? `${s.fee_pct}%` : ''}`} value={-s.fee} />
                  <Row label="Deductions" value={-s.deductions} />
                  <Row label="Driver pay" value={-s.driver_pay} />
                  {s.carry_in > 0 && <Row label="Balance from last week" value={-s.carry_in} />}
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
                    <span className="font-bold text-slate-900">Net to truck</span>
                    <span className={`text-lg font-bold tabular-nums ${s.net < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatCurrency(s.net)}</span>
                  </div>
                </div>

                {s.driver_id && (
                  <div className="space-y-1.5 border-t border-slate-200 px-4 py-3 text-xs">
                    <Row label="Driver pay" value={s.driver_pay} />
                    {group('driver_deduction').map(l => <Row key={l.id} label={l.label} value={-l.amount} />)}
                    <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm">
                      <span className="font-bold text-slate-900">Pay driver</span>
                      <span className="text-lg font-bold tabular-nums text-blue-700">{formatCurrency(s.driver_payout)}</span>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <Notes s={s} locked={locked} run={run} />
          </div>
        )}
      </div>
      {addingLoad && s && <QuickLoadModal truckId={s.truck_id} defaultDate={s.period_start} weekStart={s.period_start} onClose={() => setAddingLoad(false)} onSaved={() => { setAddingLoad(false); load() }} />}
    </div>
  )
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex items-center justify-between text-slate-700"><span>{label}</span><Money value={value} /></div>
}

function LoadRow({ line }: { line: StatementLine }) {
  const l = line.load
  if (!l) return null
  const place = (p: typeof l.pickup) => (p ? [p.city, p.state].filter(Boolean).join(', ') || '—' : '—')
  const day = (p: typeof l.pickup) => (p?.date ? new Date(p.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : '—')
  return (
    <tr className="hover:bg-blue-50/40">
      <td className="px-3 py-2 font-semibold text-slate-900">{l.po_number || `#${l.load_number}`}</td>
      <td className="px-3 py-2 text-slate-700">{l.broker || '—'}</td>
      <td className="px-3 py-2 text-slate-600">{l.dispatcher || '—'}</td>
      <td className="px-3 py-2 text-slate-600">{day(l.pickup)}</td>
      <td className="px-3 py-2 text-slate-600">{day(l.delivery)}</td>
      <td className="px-3 py-2 text-slate-700">{place(l.pickup)}</td>
      <td className="px-3 py-2 text-slate-700">{place(l.delivery)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-600" title={l.total_miles ? `${l.loaded_miles} loaded + ${l.empty_miles} deadhead` : ''}>{l.total_miles ? `${l.total_miles.toLocaleString()}${l.rpm != null ? ` · $${l.rpm.toFixed(2)}` : ''}` : '—'}</td>
      <td className="px-3 py-2 text-right font-semibold text-slate-900"><Money value={l.rate} /></td>
      <td className="px-3 py-2 text-center">{l.pod ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <X className="mx-auto h-4 w-4 text-slate-300" />}</td>
    </tr>
  )
}

function OdometerRow({ s, locked, run }: { s: StatementDetail; locked: boolean; run: (fn: () => Promise<StatementDetail>, done?: string) => void }) {
  const [a, setA] = useState(s.odometer_start?.toString() ?? '')
  const [b, setB] = useState(s.odometer_end?.toString() ?? '')
  useEffect(() => { setA(s.odometer_start?.toString() ?? ''); setB(s.odometer_end?.toString() ?? '') }, [s.id, s.odometer_start, s.odometer_end])
  const miles = a && b ? Math.max(0, Number(b) - Number(a)) : null
  const dirty = a !== (s.odometer_start?.toString() ?? '') || b !== (s.odometer_end?.toString() ?? '')
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-2.5 text-xs">
      <span className="font-bold uppercase tracking-wide text-slate-400">Odometer</span>
      <label className="flex items-center gap-1.5 text-slate-600">Start <input inputMode="numeric" value={a} disabled={locked} onChange={e => setA(e.target.value.replace(/\D/g, ''))} className={`${input} w-28`} /></label>
      <label className="flex items-center gap-1.5 text-slate-600">End <input inputMode="numeric" value={b} disabled={locked} onChange={e => setB(e.target.value.replace(/\D/g, ''))} className={`${input} w-28`} /></label>
      <span className="text-slate-500">{miles != null ? `${miles.toLocaleString()} mi` : 'Needed for per-mile pay'}</span>
      {dirty && !locked && <button onClick={() => run(() => weeksApi.setOdometer(s.id, a ? Number(a) : null, b ? Number(b) : null), 'Odometer saved')} className="btn-primary h-8 rounded-md px-3 text-xs">Save</button>}
    </div>
  )
}

function AddLine({ onAdd }: { onAdd: (label: string, amount: number) => void }) {
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const submit = () => { if (!label.trim() || !amount) return; onAdd(label.trim(), Number(amount)); setLabel(''); setAmount('') }
  return (
    <div className="mt-1 flex items-center gap-1.5">
      <input value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Truck wash 12/28" className={`${input} min-w-0 flex-1`} />
      <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.-]/g, ''))} onKeyDown={e => e.key === 'Enter' && submit()} placeholder="0.00" inputMode="decimal" className={`${input} w-24 text-right`} />
      <button onClick={submit} className="grid h-8 w-8 place-items-center rounded-md bg-blue-600 text-white hover:bg-blue-700" aria-label="Add line"><Plus className="h-4 w-4" /></button>
    </div>
  )
}

function StatusActions({ s, busy, run }: { s: StatementDetail; busy: boolean; run: (fn: () => Promise<StatementDetail>, done?: string) => void }) {
  const [ach, setAch] = useState('')
  if (s.status === 'draft') return <button disabled={busy} onClick={() => run(() => weeksApi.setStatus(s.id, 'ready'), 'Marked ready')} className="btn-primary h-9 rounded-lg px-4 text-xs">Mark ready</button>
  if (s.status === 'ready') return (
    <div className="flex items-center gap-1.5">
      <button disabled={busy} onClick={() => run(() => weeksApi.setStatus(s.id, 'draft'))} className="btn-secondary h-9 rounded-lg px-3 text-xs">Back to draft</button>
      <input value={ach} onChange={e => setAch(e.target.value)} placeholder="ACH confirmation #" className={`${input} h-9 w-40`} />
      <button disabled={busy} onClick={() => run(() => weeksApi.setStatus(s.id, 'paid', ach || undefined), 'Marked paid and locked')} className="btn-primary h-9 rounded-lg px-4 text-xs"><Check className="h-3.5 w-3.5" />Mark paid</button>
    </div>
  )
  return <button disabled={busy} onClick={() => { if (confirm('Reopen this paid statement? It will be recalculated from current loads and expenses.')) run(() => weeksApi.setStatus(s.id, 'draft'), 'Reopened') }} className="btn-secondary h-9 rounded-lg px-3 text-xs"><Unlock className="h-3.5 w-3.5" />Reopen</button>
}

function Notes({ s, locked, run }: { s: StatementDetail; locked: boolean; run: (fn: () => Promise<StatementDetail>, done?: string) => void }) {
  const [v, setV] = useState(s.notes || '')
  useEffect(() => setV(s.notes || ''), [s.id, s.notes])
  return (
    <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="mb-1 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">Notes</div>
      <textarea value={v} disabled={locked} onChange={e => setV(e.target.value)} onBlur={() => v !== (s.notes || '') && run(() => weeksApi.setNotes(s.id, v))}
        rows={2} placeholder="Anything the driver or the owner should know about this week" className="w-full resize-y rounded-md border border-slate-200 px-2.5 py-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50" />
    </section>
  )
}
