import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, RefreshCw, Undo2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { officeApi, type DispatcherWeek } from '@/api/office'
import { periodLabel, shiftWeek, toIso, weekStart } from '@/api/weeks'
import { formatCurrency } from '@/utils'
import { Money } from './WeekBoardPage'

/** The Excel "Office" sheet: each dispatcher's gross for the week and the commission owed. */
export default function DispatchersPage() {
  const [params, setParams] = useSearchParams()
  const start = weekStart(params.get('week') || toIso(new Date()))
  const [data, setData] = useState<DispatcherWeek | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await officeApi.dispatcherWeek(start)) }
    catch (e) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }, [start])
  useEffect(() => { load() }, [load])

  const setWeek = (iso: string) => setParams({ week: weekStart(iso) })

  const togglePaid = async (id: number, paid: boolean) => {
    try {
      await officeApi.setDispatcherPaid(start, id, paid)
      toast.success(paid ? 'Marked paid' : 'Payment removed')
      load()
    } catch (e) { toast.error((e as Error).message) }
  }

  const t = data?.totals
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 px-4 py-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Dispatchers</h1>
              {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />}
            </div>
            <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">Weekly gross per dispatcher and the commission owed</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
              <button onClick={() => setWeek(shiftWeek(start, -1))} className="grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-50" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></button>
              <div className="border-x border-slate-200 px-3 text-xs font-semibold text-slate-800">{periodLabel(start)}</div>
              <button onClick={() => setWeek(shiftWeek(start, 1))} className="grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-50" aria-label="Next week"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <button onClick={() => setWeek(toIso(new Date()))} className="btn-secondary h-9 rounded-lg px-3 text-xs">This week</button>
            <button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[['Loads', String(t?.loads ?? 0), ''], ['Gross', formatCurrency(t?.gross ?? 0), ''], ['Commission owed', formatCurrency(t?.commission ?? 0), 'text-blue-700'], ['Paid so far', formatCurrency(t?.paid ?? 0), 'text-emerald-700']].map(([l, v, c]) => (
            <div key={l} className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{l}</div>
              <div className={`mt-0.5 text-sm font-bold tabular-nums ${c || 'text-slate-950'}`}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">Dispatcher</th>
              <th className="px-3 py-2 text-left">Rule</th>
              <th className="px-3 py-2 text-left">Trucks</th>
              <th className="px-3 py-2 text-right">Loads</th>
              <th className="px-3 py-2 text-right">Gross</th>
              <th className="px-3 py-2 text-right">Commission</th>
              <th className="px-3 py-2 text-left">Paid</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {(data?.rows || []).map(r => (
              <tr key={r.dispatcher_id} className="hover:bg-blue-50/40">
                <td className="px-3 py-2.5 font-bold text-slate-900">{r.name}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.commission_type === 'flat' ? `Flat ${formatCurrency(r.commission_value)}` : `${r.commission_value}% of gross`}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.trucks.length ? r.trucks.join(', ') : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.loads}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-slate-900"><Money value={r.gross} /></td>
                <td className="px-3 py-2.5 text-right font-bold text-blue-700"><Money value={r.commission} /></td>
                <td className="px-3 py-2.5">
                  {r.paid
                    ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-100"><Check className="h-3 w-3" />{formatCurrency(r.paid_amount || 0)}</span>
                    : <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-500 ring-1 ring-slate-200">Not paid</span>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {r.paid
                    ? <button onClick={() => togglePaid(r.dispatcher_id, false)} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]"><Undo2 className="h-3 w-3" />Undo</button>
                    : <button onClick={() => togglePaid(r.dispatcher_id, true)} disabled={r.commission <= 0} className="btn-primary h-7 rounded-md px-2.5 text-[0.6875rem]">Mark paid</button>}
                </td>
              </tr>
            ))}
            {data && data.rows.length === 0 && <tr><td colSpan={8} className="py-16 text-center text-slate-400">No active dispatchers. Add them in Settings.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
