import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, RefreshCw, Search } from 'lucide-react'
import LoadForm from '@/components/loads/LoadForm'
import { useEntities } from '@/hooks/useEntities'
import toast from 'react-hot-toast'
import { periodLabel, shiftWeek, toIso, weekStart, weeksApi, type StatementStatus, type WeekBoard } from '@/api/weeks'
import { formatCurrency } from '@/utils'

const STATUS_STYLE: Record<StatementStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 ring-slate-200',
  ready: 'bg-amber-50 text-amber-700 ring-amber-100',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
}
const STATUS_LABEL: Record<StatementStatus, string> = { draft: 'Draft', ready: 'Ready', paid: 'Paid' }

export function StatusPill({ status }: { status: StatementStatus }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ring-1 ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>
}

export function Money({ value, strong = false }: { value: number; strong?: boolean }) {
  const negative = value < 0
  return <span className={`tabular-nums ${negative ? 'text-red-600' : ''} ${strong ? 'font-bold text-slate-950' : ''} ${negative && strong ? 'text-red-600' : ''}`}>{formatCurrency(value)}</span>
}

export default function WeekBoardPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const start = weekStart(params.get('week') || toIso(new Date()))
  const [board, setBoard] = useState<WeekBoard | null>(null)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | StatementStatus | 'negative'>(() => (params.get('filter') as 'negative' | null) || 'all')
  const [addingLoad, setAddingLoad] = useState(false)
  const entities = useEntities()

  const load = useCallback(async () => {
    setLoading(true)
    try { setBoard(await weeksApi.board(start)) }
    catch (e) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }, [start])

  useEffect(() => { load() }, [load])

  const setWeek = (iso: string) => setParams({ week: weekStart(iso) })

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (board?.rows || []).filter(r =>
      (!q || r.unit_number.toLowerCase().includes(q) || (r.driver_name || '').toLowerCase().includes(q)) &&
      (filter === 'all' || (filter === 'negative' ? r.net < 0 : r.status === filter)))
  }, [board, query, filter])

  const t = board?.totals
  const counts = useMemo(() => {
    const c = { draft: 0, ready: 0, paid: 0, negative: 0 }
    for (const r of board?.rows || []) { c[r.status] += 1; if (r.net < 0) c.negative += 1 }
    return c
  }, [board])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Weekly board</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-bold text-slate-500">{board?.rows.length ?? 0} trucks</span>
              {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />}
            </div>
            <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">Every truck's week: loads, deductions, driver pay and what is left</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
              <button onClick={() => setWeek(shiftWeek(start, -1))} className="grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-50 hover:text-slate-900" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
              <div className="border-x border-slate-200 px-3 text-xs font-semibold text-slate-800">{periodLabel(start)}</div>
              <button onClick={() => setWeek(shiftWeek(start, 1))} className="grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-50 hover:text-slate-900" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <input type="date" value={start} onChange={e => e.target.value && setWeek(e.target.value)} aria-label="Pick a week"
              className="h-9 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 text-xs text-slate-800 shadow-sm focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
            <button onClick={() => setWeek(toIso(new Date()))} className="btn-secondary h-9 rounded-lg px-3 text-xs">This week</button>
            <button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
            </button>
            <button onClick={() => setAddingLoad(true)} className="btn-primary h-9 rounded-lg px-4 text-xs"><Plus className="h-4 w-4" />Add load</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          <Stat label="Loads" value={String(t?.loads ?? 0)} />
          <Stat label="Gross" value={formatCurrency(t?.gross ?? 0)} />
          <Stat label="Deductions" value={formatCurrency((t?.fee ?? 0) + (t?.deductions ?? 0))} />
          <Stat label="Driver pay" value={formatCurrency(t?.driver_pay ?? 0)} />
          <Stat label="Driver payouts" value={formatCurrency(t?.driver_payout ?? 0)} tone="blue" />
          <Stat label="Net" value={formatCurrency(t?.net ?? 0)} tone={(t?.net ?? 0) < 0 ? 'red' : 'emerald'} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Truck or driver…"
              className="h-9 w-56 rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-xs text-slate-800 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100" />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {([['all', 'All', board?.rows.length ?? 0], ['draft', 'Draft', counts.draft], ['ready', 'Ready', counts.ready], ['paid', 'Paid', counts.paid], ['negative', 'Negative', counts.negative]] as const).map(([key, label, n]) => (
              <button key={key} onClick={() => setFilter(key)} aria-pressed={filter === key}
                className={`rounded-md px-2.5 py-1.5 text-[0.6875rem] font-semibold transition ${filter === key ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                {label} <span className="ml-1 text-slate-400">{n}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">Truck</th>
              <th className="px-3 py-2 text-left">Driver</th>
              <th className="px-3 py-2 text-right">Loads</th>
              <th className="px-3 py-2 text-right">Miles</th>
              <th className="px-3 py-2 text-right">RPM</th>
              <th className="px-3 py-2 text-right">Gross</th>
              <th className="px-3 py-2 text-right">Fee</th>
              <th className="px-3 py-2 text-right">Deductions</th>
              <th className="px-3 py-2 text-right">Driver pay</th>
              <th className="px-3 py-2 text-right">Payout</th>
              <th className="px-3 py-2 text-right">Carry in</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && !board ? (
              <tr><td colSpan={13} className="py-16 text-center text-slate-400">Building the week…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={13} className="py-16 text-center text-slate-400">No trucks match.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} onClick={() => navigate(`/weeks/${start}/trucks/${r.truck_id}`)}
                className="cursor-pointer transition-colors hover:bg-blue-50/60">
                <td className="px-3 py-2.5 font-bold text-slate-900">{r.unit_number}</td>
                <td className="px-3 py-2.5 text-slate-700">{r.driver_name || <span className="text-slate-400">No driver</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.loads}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.miles ? r.miles.toLocaleString() : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.rpm != null ? `$${r.rpm.toFixed(2)}` : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-slate-900"><Money value={r.gross} /></td>
                <td className="px-3 py-2.5 text-right text-slate-600"><Money value={r.fee} /></td>
                <td className="px-3 py-2.5 text-right text-slate-600"><Money value={r.deductions} /></td>
                <td className="px-3 py-2.5 text-right text-slate-600"><Money value={r.driver_pay} /></td>
                <td className="px-3 py-2.5 text-right font-semibold text-blue-700"><Money value={r.driver_payout} /></td>
                <td className="px-3 py-2.5 text-right text-slate-600">{r.carry_in ? <Money value={-r.carry_in} /> : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-right"><Money value={r.net} strong /></td>
                <td className="px-3 py-2.5"><StatusPill status={r.status} /></td>
              </tr>
            ))}
          </tbody>
          {t && rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-slate-50">
              <tr className="border-t-2 border-slate-200 font-bold text-slate-800">
                <td className="px-3 py-2" colSpan={2}>Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{rows.reduce((s, r) => s + r.loads, 0)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{rows.reduce((s, r) => s + r.miles, 0).toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{(() => { const m = rows.reduce((s, r) => s + r.miles, 0); const g = rows.reduce((s, r) => s + r.gross, 0); return m ? `$${(g / m).toFixed(2)}` : '—' })()}</td>
                {(['gross', 'fee', 'deductions', 'driver_pay', 'driver_payout'] as const).map(k => (
                  <td key={k} className="px-3 py-2 text-right"><Money value={rows.reduce((s, r) => s + r[k], 0)} /></td>
                ))}
                <td className="px-3 py-2 text-right"><Money value={-rows.reduce((s, r) => s + r.carry_in, 0)} /></td>
                <td className="px-3 py-2 text-right"><Money value={rows.reduce((s, r) => s + r.net, 0)} strong /></td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {addingLoad && <LoadForm entities={entities} presetWeekStart={start} onClose={() => setAddingLoad(false)} onSaved={() => { setAddingLoad(false); load() }} />}
    </div>
  )
}

function Stat({ label, value, tone = 'slate' }: { label: string; value: string; tone?: 'slate' | 'blue' | 'emerald' | 'red' }) {
  const tones = { slate: 'text-slate-950', blue: 'text-blue-700', emerald: 'text-emerald-700', red: 'text-red-600' }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  )
}
