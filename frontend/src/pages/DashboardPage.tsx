import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, ArrowDownRight, CalendarRange, CreditCard, Headset, RefreshCw, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import { dashboardApi, type DashboardData } from '@/api/dashboard'
import { formatCurrency } from '@/utils'
import PageShell from '@/components/ui/PageShell'
import { Money, StatusPill } from './WeekBoardPage'
import type { StatementStatus } from '@/api/weeks'

const GROSS = '#2563eb'
const NET = '#0f766e'
const LOSS = '#dc2626'

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
  const today = d ? new Date(d.today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''
  const totalDue = a ? a.statements_ready.driver_payouts + a.dispatchers_unpaid.amount + a.bills.remaining : 0

  return (
    <PageShell
      title="Dashboard"
      subtitle={d ? `${today} · Week ${w!.period}` : 'Loading this week…'}
      actions={<>
        <button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        <Link to={`/weeks?week=${w?.period_start || ''}`} className="btn-primary h-9 rounded-lg px-3.5 text-xs">Open weekly board<ArrowRight className="h-3.5 w-3.5" /></Link>
      </>}
    >
      {!d ? <div className="py-16 text-center text-slate-400">Loading…</div> : (
        <div className="mx-auto max-w-[100rem] space-y-3 p-3">

          {/* This week, one strip */}
          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-2 divide-slate-100 md:grid-cols-3 md:divide-x xl:grid-cols-6">
              <Stat label="Gross" value={formatCurrency(w!.gross)} delta={delta(w!.gross, d.last_week.gross)} lead />
              <Stat label="Net to trucks" value={formatCurrency(w!.net)} delta={delta(w!.net, d.last_week.net)} tone={w!.net < 0 ? 'red' : 'teal'} lead />
              <Stat label="Deductions" value={formatCurrency(w!.deductions)} sub="fee, fixed, fuel, expenses" />
              <Stat label="Driver payouts" value={formatCurrency(w!.driver_payouts)} sub={`${formatCurrency(w!.driver_pay)} earned`} />
              <Stat label="Loads" value={String(w!.loads)} sub={`${w!.trucks_with_loads} of ${w!.trucks} trucks moving`} />
              <Stat label="Rate per mile" value={w!.rpm != null ? `$${w!.rpm.toFixed(2)}` : '—'} sub={`${w!.miles.toLocaleString()} miles`} />
            </div>
          </section>

          {/* Needs paying */}
          <section>
            <div className="mb-1.5 flex items-baseline justify-between px-0.5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Needs your attention</h2>
              {totalDue > 0 && <span className="text-[0.6875rem] text-slate-500">{formatCurrency(totalDue)} to pay out</span>}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <Attention to="/weeks" icon={CalendarRange} label="Statements ready" count={a!.statements_ready.count} amount={formatCurrency(a!.statements_ready.driver_payouts)} note="driver payouts waiting for ACH" />
              <Attention to="/dispatchers" icon={Headset} label="Dispatchers to pay" count={a!.dispatchers_unpaid.count} amount={formatCurrency(a!.dispatchers_unpaid.amount)} note="this week's commissions" />
              <Attention to="/bills" icon={CreditCard} label="Bills this month" count={a!.bills.unpaid_count} amount={formatCurrency(a!.bills.remaining)} note={a!.bills.due_soon.some(b => b.overdue) ? `${a!.bills.due_soon.filter(b => b.overdue).length} overdue` : 'none overdue'} urgent={a!.bills.due_soon.some(b => b.overdue)} />
              <Attention to="/maintenance" icon={Wrench} label="Service due" count={a!.maintenance.due} amount={`${a!.maintenance.due} overdue${a!.maintenance.soon ? ` · ${a!.maintenance.soon} soon` : ''}`} note={a!.maintenance.items[0] ? `${a!.maintenance.items[0].unit_number} · ${a!.maintenance.items[0].service_type}` : 'nothing overdue'} urgent={a!.maintenance.due > 0} />
            </div>
          </section>

          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
            {/* Trend */}
            <Card title="Last 8 weeks" description="Gross and net to trucks per week"
              action={<div className="flex items-center gap-3 text-[0.6875rem] font-medium text-slate-600">
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: GROSS }} />Gross</span>
                <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: NET }} />Net</span>
              </div>}>
              <Trend data={d.trend} />
            </Card>

            {/* Watch list */}
            <Card title="Watch this week" description="Things that will cost money if nobody looks">
              <div className="divide-y divide-slate-100">
                <Row label="Trucks with a negative week" value={a!.negative_weeks.count ? `${a!.negative_weeks.count} · ${formatCurrency(a!.negative_weeks.amount)}` : 'None'} detail={a!.negative_weeks.units.join(', ')} tone={a!.negative_weeks.count ? 'red' : undefined} to="/weeks?filter=negative" />
                <Row label="Trucks without a load" value={a!.idle_trucks.count ? String(a!.idle_trucks.count) : 'None'} detail={a!.idle_trucks.units.join(', ')} tone={a!.idle_trucks.count ? 'amber' : undefined} to="/weeks" />
                {a!.bills.due_soon.map(b => (
                  <Row key={b.label} label={b.label} value={formatCurrency(b.amount)} detail={b.overdue ? `bill · was due on the ${ordinal(b.due_day)}` : `bill · due on the ${ordinal(b.due_day)}`} tone={b.overdue ? 'red' : 'amber'} to="/bills" />
                ))}
                {a!.maintenance.items.map(m => (
                  <Row key={m.unit_number + m.service_type} label={`${m.unit_number} · ${m.service_type}`} detail="service"
                    value={m.miles_left != null ? (m.miles_left <= 0 ? `${Math.abs(m.miles_left).toLocaleString()} mi over` : `${m.miles_left.toLocaleString()} mi left`) : m.days_left != null ? (m.days_left <= 0 ? `${-m.days_left} d over` : `${m.days_left} d left`) : ''}
                    tone={m.status === 'RED' ? 'red' : 'amber'} to="/maintenance" />
                ))}
                {!a!.negative_weeks.count && !a!.idle_trucks.count && !a!.bills.due_soon.length && !a!.maintenance.items.length && (
                  <div className="px-4 py-8 text-center text-slate-400">Nothing to watch. Quiet week.</div>
                )}
              </div>
            </Card>
          </div>

          {/* Trucks */}
          <Card title="Trucks this week" action={<Link to={`/weeks?week=${w!.period_start}`} className="text-[0.6875rem] font-semibold text-blue-700 hover:underline">All trucks</Link>} flush>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200 bg-slate-50/80 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left">Truck</th><th className="px-3 py-2 text-left">Driver</th><th className="px-3 py-2 text-right">Loads</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">RPM</th><th className="px-3 py-2 text-right">Net</th><th className="px-4 py-2 text-left">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {d.top_trucks.map(t => (
                  <tr key={t.truck_id} className="hover:bg-blue-50/40">
                    <td className="px-4 py-2.5"><Link to={`/weeks/${w!.period_start}/trucks/${t.truck_id}`} className="font-bold text-blue-700 hover:underline">{t.unit_number}</Link></td>
                    <td className="px-3 py-2.5 text-slate-700">{t.driver_name || <span className="text-slate-300">No driver</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{t.loads}</td>
                    <td className="px-3 py-2.5 text-right"><Money value={t.gross} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{t.rpm != null ? `$${t.rpm.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right"><Money value={t.net} strong /></td>
                    <td className="px-4 py-2.5"><StatusPill status={t.status as StatementStatus} /></td>
                  </tr>
                ))}
                {d.top_trucks.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No loads this week yet. <Link to="/weeks" className="font-semibold text-blue-700 hover:underline">Add one</Link></td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </PageShell>
  )
}

const delta = (now: number, before: number) => (before ? Math.round(((now - before) / Math.abs(before)) * 100) : null)
const ordinal = (n: number) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`

function Stat({ label, value, sub, delta: pct, tone = 'slate', lead }: { label: string; value: string; sub?: string; delta?: number | null; tone?: 'slate' | 'teal' | 'red'; lead?: boolean }) {
  const tones = { slate: 'text-slate-950', teal: 'text-teal-700', red: 'text-red-600' }
  return (
    <div className={`px-4 py-3.5 ${lead ? 'bg-slate-50/60' : ''}`}>
      <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 font-bold tabular-nums tracking-tight ${lead ? 'text-2xl' : 'text-lg'} ${tones[tone]}`}>{value}</div>
      {pct !== undefined ? (
        <div className={`mt-1 flex items-center gap-1 text-[0.6875rem] font-semibold ${pct == null ? 'text-slate-400' : pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
          {pct != null && (pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
          {pct == null ? 'no last week to compare' : `${pct >= 0 ? '+' : ''}${pct}% vs last week`}
        </div>
      ) : sub && <div className="mt-1 truncate text-[0.6875rem] text-slate-500">{sub}</div>}
    </div>
  )
}

function Attention({ to, icon: Icon, label, count, amount, note, urgent }: { to: string; icon: typeof CalendarRange; label: string; count: number; amount?: string; note?: string; urgent?: boolean }) {
  const active = count > 0
  return (
    <Link to={to} className={`group flex items-center gap-3 rounded-lg border bg-white px-3.5 py-3 shadow-sm transition hover:border-blue-300 hover:shadow-md ${active ? (urgent ? 'border-red-200' : 'border-amber-200') : 'border-slate-200'}`}>
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold tabular-nums ${active ? (urgent ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700') : 'bg-slate-100 text-slate-400'}`}>{active ? count : <Icon className="h-4 w-4" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="block text-sm font-bold tabular-nums text-slate-900">{!active ? 'All clear' : amount || `${count} overdue`}</span>
        {note && <span className="block truncate text-[0.6875rem] text-slate-500">{note}</span>}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
    </Link>
  )
}

function Card({ title, description, action, flush, children }: { title: string; description?: string; action?: React.ReactNode; flush?: boolean; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div><h2 className="text-sm font-bold text-slate-900">{title}</h2>{description && <p className="text-[0.6875rem] text-slate-400">{description}</p>}</div>
        {action}
      </header>
      <div className={flush ? '' : 'text-xs'}>{children}</div>
    </section>
  )
}

function Row({ label, value, detail, tone, to }: { label: string; value: string; detail?: string; tone?: 'red' | 'amber'; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-blue-50/40">
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      <span className="min-w-0 flex-1"><span className="block font-semibold text-slate-800">{label}</span>{detail && <span className="block truncate text-[0.6875rem] text-slate-500">{detail}</span>}</span>
      <span className={`shrink-0 font-bold tabular-nums ${tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-700' : 'text-slate-500'}`}>{value}</span>
    </Link>
  )
}

function Trend({ data }: { data: DashboardData['trend'] }) {
  const max = Math.max(1, ...data.map(x => Math.max(x.gross, Math.abs(x.net))))
  const W = 640, H = 210, padL = 46, padR = 10, padT = 14, padB = 28
  const innerW = W - padL - padR, innerH = H - padT - padB
  const gw = innerW / data.length, bw = Math.max(6, Math.min(20, gw / 2 - 5))
  const hasLoss = data.some(x => x.net < 0)
  const zero = padT + innerH * (hasLoss ? 0.72 : 1)
  const scale = (zero - padT) / max
  const y = (v: number) => zero - v * scale
  const ticks = [0, 0.5, 1].map(f => f * max)
  const fmt = (t: number) => (Math.abs(t) >= 1000 ? `$${Math.round(t / 1000)}k` : `$${Math.round(t)}`)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full px-2 py-2" role="img" aria-label={data.map(x => `${x.label}: gross ${formatCurrency(x.gross)}, net ${formatCurrency(x.net)}`).join('; ')}>
      {ticks.map(t => <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#f1f5f9" /><text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="#94a3b8">{fmt(t)}</text></g>)}
      {data.map((x, i) => {
        const x0 = padL + i * gw + (gw - (bw * 2 + 4)) / 2
        return (
          <g key={x.period_start} className="group">
            <title>{`${x.label}\nGross ${formatCurrency(x.gross)}\nNet ${formatCurrency(x.net)}`}</title>
            <rect x={padL + i * gw} y={padT} width={gw} height={innerH} fill="transparent" className="group-hover:fill-slate-50" />
            <rect x={x0} y={Math.min(y(x.gross), zero)} width={bw} height={Math.max(1, Math.abs(y(x.gross) - zero))} fill={GROSS} rx={3} opacity={x.gross ? 1 : 0.15} />
            <rect x={x0 + bw + 4} y={Math.min(y(x.net), zero)} width={bw} height={Math.max(1, Math.abs(y(x.net) - zero))} fill={x.net < 0 ? LOSS : NET} rx={3} opacity={x.net ? 1 : 0.15} />
            <text x={padL + i * gw + gw / 2} y={H - 9} textAnchor="middle" fontSize={10} fill="#64748b">{x.label.split('-')[0]}</text>
          </g>
        )
      })}
      <line x1={padL} x2={W - padR} y1={zero} y2={zero} stroke="#cbd5e1" />
    </svg>
  )
}
