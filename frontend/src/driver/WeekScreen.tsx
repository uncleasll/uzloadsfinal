import { useEffect, useState } from 'react'
import { driverApi, type DriverWeek } from '@/api/driver'
import { Card, Header, money } from './shared'

const CACHE_KEY = 'karvan.driver.weeks'

/** My last four weeks, the way the office computes them: loads, my pay, deductions, what gets paid out. */
export default function WeekScreen() {
  const [data, setData] = useState<{ truck?: string; weeks: DriverWeek[] }>(() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{"weeks":[]}') } catch { return { weeks: [] } } })
  const [open, setOpen] = useState<string | null>(null)
  useEffect(() => { driverApi.statement().then(d => { setData(d); localStorage.setItem(CACHE_KEY, JSON.stringify(d)) }).catch(() => {}) }, [])
  return (
    <div className="space-y-3 p-3">
      <Header title="My week" sub={data.truck ? `Truck ${data.truck}` : 'No truck assigned'} />
      {data.weeks.length === 0 && <Card><p className="text-sm text-slate-400">No statements yet.</p></Card>}
      {data.weeks.map((w, i) => (
        <Card key={w.period_start} className={i === 0 ? 'border-blue-200' : ''}>
          <button onClick={() => setOpen(open === w.period_start ? null : w.period_start)} className="flex w-full items-center justify-between text-left">
            <div>
              <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">{i === 0 ? 'This week' : 'Week'} · {w.period}</div>
              <div className="text-2xl font-bold tabular-nums text-slate-950">{money(w.driver_payout)}</div>
              <div className="text-xs text-slate-500">{w.loads} loads · {money(w.gross)} gross · pay {money(w.driver_pay)}{w.driver_deductions ? ` − ${money(w.driver_deductions)}` : ''}</div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${w.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : w.status === 'ready' ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{w.status === 'paid' ? 'Paid' : w.status === 'ready' ? 'Ready' : 'In progress'}</span>
          </button>
          {open === w.period_start && (
            <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 text-sm">
              {w.lines.map((l, j) => (
                <div key={j} className="flex items-center justify-between py-1.5">
                  <span className={l.kind === 'load' ? 'text-slate-700' : l.kind === 'driver_pay' ? 'font-semibold text-slate-900' : 'text-red-700'}>{l.label}</span>
                  <span className={`tabular-nums ${l.kind === 'driver_deduction' ? 'text-red-700' : 'text-slate-900'}`}>{l.kind === 'driver_deduction' ? '−' : ''}{money(Math.abs(l.amount))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-2 font-bold"><span>Paid to you</span><span className="tabular-nums">{money(w.driver_payout)}</span></div>
              {w.paid_at && <div className="pt-1 text-xs text-slate-500">Paid {new Date(w.paid_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
