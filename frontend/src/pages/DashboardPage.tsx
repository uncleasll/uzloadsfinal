import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { dashboardApi, type DashboardData } from '@/api/dashboard'
import { formatCurrency } from '@/utils'
import { Money, StatusPill } from './WeekBoardPage'
import type { StatementStatus } from '@/api/weeks'

const REVENUE = '#2563eb'
const NET = '#d97706'

/** One screen for the owner: this week, what needs paying, what is due, and the trend. */
export default function DashboardPage() {
  const [d, setD] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setD(await dashboardApi.get()) }
    catch (e) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const w = d?.this_week
  const a = d?.attention
  const delta = (now: number, before: number) => (before ? Math.round(((now - before) / Math.abs(before)) * 100) : null)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 lg:px-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-950">Dashboard</h1>
            {w && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-bold text-slate-500">Week {w.period}</span>}
            {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />}
          </div>
          <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">This week at a glance, what needs paying, and what is due</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/weeks?week=${w?.period_start || ''}`} className="btn-primary h-9 rounded-lg px-4 text-xs">Open weekly board<ArrowRight className="h-3.5 w-3.5" /></Link>
          <button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70 p-3">
        {!d ? <div className="py-16 text-center text-slate-400">Loading…</div> : (
          <div className="mx-auto max-w-[100rem] space-y-3">
            {/* This week */}
            <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Gross" value={formatCurrency(w!.gross)} sub={deltaText(delta(w!.gross, d.last_week.gross))} />
              <Stat label="Deductions" value={formatCurrency(w!.deductions)} sub="fees, fixed, fuel, expenses" />
              <Stat label="Driver payouts" value={formatCurrency(w!.driver_payouts)} sub={`${formatCurrency(w!.driver_pay)} earned`} tone="blue" />
              <Stat label="Net to trucks" value={formatCurrency(w!.net)} sub={deltaText(delta(w!.net, d.last_week.net))} tone={w!.net < 0 ? 'red' : 'emerald'} />
              <Stat label="Loads" value={String(w!.loads)} sub={`${w!.trucks_with_loads} of ${w!.trucks} trucks moving`} />
              <Stat label="Rate per mile" value={w!.rpm != null ? `$${w!.rpm.toFixed(2)}` : '—'} sub={`${w!.miles.toLocaleString()} miles`} />
            </section>

            {/* Needs attention */}
            <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <Attention to="/weeks" label="Statements ready to pay" count={a!.statements_ready.count} amount={formatCurrency(a!.statements_ready.driver_payouts)} note="driver payouts waiting for ACH" />
              <Attention to="/dispatchers" label="Dispatchers to pay" count={a!.dispatchers_unpaid.count} amount={formatCurrency(a!.dispatchers_unpaid.amount)} note="this week's commissions" />
              <Attention to="/bills" label="Bills unpaid this month" count={a!.bills.unpaid_count} amount={formatCurrency(a!.bills.remaining)} note={a!.bills.due_soon.some(b => b.overdue) ? `${a!.bills.due_soon.filter(b => b.overdue).length} overdue` : 'none overdue'} />
              <Attention to="/maintenance" label="Service due" count={a!.maintenance.due} amount={a!.maintenance.soon ? `${a!.maintenance.soon} soon` : undefined} note={a!.maintenance.items[0] ? `${a!.maintenance.items[0].unit_number} ${a!.maintenance.items[0].service_type}` : 'nothing overdue'} />
            </section>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,1fr)]">
              {/* Trend */}
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <div><h2 className="text-sm font-bold text-slate-900">Last 8 weeks</h2><p className="text-[0.6875rem] text-slate-400">Gross and net to trucks per week</p></div>
                  <div className="flex items-center gap-3 text-[0.6875rem] font-medium text-slate-600">
                    <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: REVENUE }} />Gross</span>
                    <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: NET }} />Net</span>
                  </div>
                </header>
                <Trend data={d.trend} />
              </section>

              {/* Watch list */}
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <header className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Watch this week</h2></header>
                <div className="divide-y divide-slate-100 text-xs">
                  <Row label="Trucks with a negative week" value={a!.negative_weeks.count ? `${a!.negative_weeks.count} · ${formatCurrency(a!.negative_weeks.amount)}` : 'None'} detail={a!.negative_weeks.units.join(', ')} tone={a!.negative_weeks.count ? 'red' : undefined} to="/weeks?filter=negative" />
                  <Row label="Trucks without a load" value={a!.idle_trucks.count ? String(a!.idle_trucks.count) : 'None'} detail={a!.idle_trucks.units.join(', ')} tone={a!.idle_trucks.count ? 'amber' : undefined} to="/weeks" />
                  {a!.bills.due_soon.map(b => (
                    <Row key={b.label} label={`Bill · ${b.label}`} value={formatCurrency(b.amount)} detail={b.overdue ? `was due on the ${b.due_day}` : `due on the ${b.due_day}`} tone={b.overdue ? 'red' : 'amber'} to="/bills" />
                  ))}
                  {a!.maintenance.items.map(m => (
                    <Row key={m.unit_number + m.service_type} label={`${m.unit_number} · ${m.service_type}`} value={m.miles_left != null ? (m.miles_left <= 0 ? `${Math.abs(m.miles_left).toLocaleString()} mi over` : `${m.miles_left.toLocaleString()} mi left`) : m.days_left != null ? (m.days_left <= 0 ? `${-m.days_left} d over` : `${m.days_left} d left`) : ''} tone={m.status === 'RED' ? 'red' : 'amber'} to="/maintenance" />
                  ))}
                </div>
              </section>
            </div>

            {/* Top trucks */}
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-bold text-slate-900">Trucks this week</h2>
                <Link to={`/weeks?week=${w!.period_start}`} className="text-[0.6875rem] font-semibold text-blue-700 hover:underline">All trucks</Link>
              </header>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-200 bg-slate-50/80 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left">Truck</th><th className="px-3 py-2 text-left">Driver</th><th className="px-3 py-2 text-right">Loads</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">RPM</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2 text-left">Status</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {d.top_trucks.map(t => (
                    <tr key={t.truck_id} className="hover:bg-blue-50/40">
                      <td className="px-3 py-2"><Link to={`/weeks/${w!.period_start}/trucks/${t.truck_id}`} className="font-bold text-slate-900 hover:text-blue-700">{t.unit_number}</Link></td>
                      <td className="px-3 py-2 text-slate-700">{t.driver_name || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.loads}</td>
                      <td className="px-3 py-2 text-right font-semibold"><Money value={t.gross} /></td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{t.rpm != null ? `$${t.rpm.toFixed(2)}` : '—'}</td>
                      <td className="px-3 py-2 text-right"><Money value={t.net} strong /></td>
                      <td className="px-3 py-2"><StatusPill status={t.status as StatementStatus} /></td>
                    </tr>
                  ))}
                  {d.top_trucks.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No loads this week yet. <Link to="/weeks" className="font-semibold text-blue-700 hover:underline">Add one</Link></td></tr>}
                </tbody>
              </table>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

function deltaText(pct: number | null) {
  if (pct == null) return 'no last week to compare'
  return `${pct >= 0 ? '+' : ''}${pct}% vs last week`
}

function Stat({ label, value, sub, tone = 'slate' }: { label: string; value: string; sub?: string; tone?: 'slate' | 'blue' | 'emerald' | 'red' }) {
  const tones = { slate: 'text-slate-950', blue: 'text-blue-700', emerald: 'text-emerald-700', red: 'text-red-600' }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
      <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[0.6875rem] text-slate-500">{sub}</div>}
    </div>
  )
}

function Attention({ to, label, count, amount, note }: { to: string; label: string; count: number; amount?: string; note?: string }) {
  const alert = count > 0
  return (
    <Link to={to} className={`group flex items-center gap-3 rounded-lg border bg-white px-3.5 py-3 shadow-sm transition hover:border-blue-200 hover:shadow-md ${alert ? 'border-amber-200' : 'border-slate-200'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold ring-1 ${alert ? 'bg-amber-50 text-amber-700 ring-amber-100' : 'bg-emerald-50 text-emerald-700 ring-emerald-100'}`}>{count}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="block text-xs font-semibold text-slate-900">{alert && amount ? amount : 'All clear'}</span>
        {note && <span className="block truncate text-[0.6875rem] text-slate-500">{note}</span>}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-600" />
    </Link>
  )
}

function Row({ label, value, detail, tone, to }: { label: string; value: string; detail?: string; tone?: 'red' | 'amber'; to: string }) {
  return (
    <Link to={to} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-blue-50/40">
      <span className="min-w-0"><span className="block font-semibold text-slate-800">{label}</span>{detail && <span className="block truncate text-[0.6875rem] text-slate-500">{detail}</span>}</span>
      <span className={`shrink-0 font-bold tabular-nums ${tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-700' : 'text-slate-700'}`}>{value}</span>
    </Link>
  )
}

function Trend({ data }: { data: DashboardData['trend'] }) {
  const max = Math.max(1, ...data.map(x => Math.max(x.gross, Math.abs(x.net))))
  const W = 640, H = 200, padL = 48, padR = 8, padT = 12, padB = 26
  const innerW = W - padL - padR, innerH = H - padT - padB
  const gw = innerW / data.length, bw = Math.max(6, Math.min(22, gw / 2 - 4))
  const zero = padT + innerH * (data.some(x => x.net < 0) ? 0.75 : 1)
  const scale = (zero - padT) / max
  const y = (v: number) => zero - v * scale
  const ticks = [0, 0.5, 1].map(f => f * max)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full px-2 pt-2" role="img" aria-label={data.map(x => `${x.label}: gross ${formatCurrency(x.gross)}, net ${formatCurrency(x.net)}`).join('; ')}>
      {ticks.map(t => <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#e2e8f0" /><text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="#94a3b8">{t >= 1000 ? `$${Math.round(t / 1000)}k` : `$${Math.round(t)}`}</text></g>)}
      {data.map((x, i) => {
        const x0 = padL + i * gw + (gw - (bw * 2 + 3)) / 2
        return (
          <g key={x.period_start}>
            <title>{`${x.label}\nGross ${formatCurrency(x.gross)}\nNet ${formatCurrency(x.net)}`}</title>
            <rect x={x0} y={Math.min(y(x.gross), zero)} width={bw} height={Math.abs(y(x.gross) - zero)} fill={REVENUE} rx={2} />
            <rect x={x0 + bw + 3} y={Math.min(y(x.net), zero)} width={bw} height={Math.abs(y(x.net) - zero)} fill={x.net < 0 ? '#dc2626' : NET} rx={2} />
            <text x={padL + i * gw + gw / 2} y={H - 8} textAnchor="middle" fontSize={10} fill="#64748b">{x.label.split('-')[0]}</text>
          </g>
        )
      })}
      <line x1={padL} x2={W - padR} y1={zero} y2={zero} stroke="#cbd5e1" />
    </svg>
  )
}
