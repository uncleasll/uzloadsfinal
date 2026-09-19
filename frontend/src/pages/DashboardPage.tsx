import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, ArrowDownRight, CalendarRange, CreditCard, Headset, RefreshCw, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import { dashboardApi, type DashboardData } from '@/api/dashboard'
import { formatCurrency } from '@/utils'
import PageShell from '@/components/ui/PageShell'
import { control } from '@/components/ui/Field'
import { Money, StatusPill } from './WeekBoardPage'
import type { StatementStatus } from '@/api/weeks'

const C = { gross: '#2563eb', net: '#0f766e', loss: '#dc2626', fee: '#7c3aed', fixed: '#0891b2', fuel: '#ea580c', expenses: '#d97706', other: '#64748b', driver_pay: '#2563eb' }

// ── Period presets ────────────────────────────────────────────────────────────

type Preset = 'this_week' | 'last_week' | 'last_4' | 'last_13' | 'this_month' | 'last_month' | 'this_year' | 'custom'
const PRESETS: Array<[Preset, string]> = [
  ['this_week', 'This week'], ['last_week', 'Last week'], ['last_4', 'Last 4 weeks'], ['last_13', 'Last 13 weeks'],
  ['this_month', 'This month'], ['last_month', 'Last month'], ['this_year', 'This year'], ['custom', 'Custom…'],
]
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/** Turns a preset into a from/to pair. The server snaps both ends to whole statement weeks. */
function presetRange(p: Preset, today: Date): { from: string; to: string } {
  const y = today.getFullYear(), m = today.getMonth()
  switch (p) {
    case 'this_week': return { from: iso(today), to: iso(today) }
    case 'last_week': return { from: iso(addDays(today, -7)), to: iso(addDays(today, -7)) }
    case 'last_4': return { from: iso(addDays(today, -21)), to: iso(today) }
    case 'last_13': return { from: iso(addDays(today, -84)), to: iso(today) }
    case 'this_month': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
    case 'last_month': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case 'this_year': return { from: iso(new Date(y, 0, 1)), to: iso(today) }
    default: return { from: iso(today), to: iso(today) }
  }
}

/** One screen for the owner: any period at a glance, where the money went, what needs paying now, and the trend. */
export default function DashboardPage() {
  const [d, setD] = useState<DashboardData | null>(null)
  const [preset, setPreset] = useState<Preset>('this_week')
  const [custom, setCustom] = useState({ from: iso(addDays(new Date(), -28)), to: iso(new Date()) })
  const [loading, setLoading] = useState(true)
  const range = useMemo(() => (preset === 'custom' ? custom : presetRange(preset, new Date())), [preset, custom])

  const load = useCallback(async () => {
    setLoading(true)
    try { setD(await dashboardApi.get(range)) }
    catch (e) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }, [range])
  useEffect(() => { load() }, [load])

  const p = d?.period
  const a = d?.attention
  const multi = (p?.weeks || 1) > 1
  const compare = multi ? `vs previous ${p!.weeks} weeks` : 'vs last week'
  const today = d ? new Date(d.today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''
  const totalDue = a ? a.statements_ready.driver_payouts + a.dispatchers_unpaid.amount + a.bills.remaining : 0
  const spark = (key: 'gross' | 'net' | 'loads' | 'driver_pay') => (d?.trend || []).slice(-8).map(t => t[key])

  return (
    <PageShell
      title="Dashboard"
      subtitle={d ? `${today} · ${multi ? `${p!.weeks} weeks, ${p!.label}` : `Week ${p!.label}`}` : 'Loading…'}
      actions={<>
        <select aria-label="Period" value={preset} onChange={e => setPreset(e.target.value as Preset)} className={`${control} w-auto`}>
          {PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {preset === 'custom' && <>
          <input type="date" aria-label="From" value={custom.from} max={custom.to} onChange={e => setCustom({ ...custom, from: e.target.value })} className={`${control} w-auto`} />
          <input type="date" aria-label="To" value={custom.to} min={custom.from} onChange={e => setCustom({ ...custom, to: e.target.value })} className={`${control} w-auto`} />
        </>}
        <button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        <Link to={`/weeks?week=${d?.this_week_start || ''}`} className="btn-primary h-9 rounded-lg px-3.5 text-xs">Weekly board<ArrowRight className="h-3.5 w-3.5" /></Link>
      </>}
    >
      {!d ? <div className="py-16 text-center text-slate-400">Loading…</div> : (
        <div className={`mx-auto max-w-[100rem] space-y-3 p-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>

          {/* Period totals */}
          <section className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Gross" value={formatCurrency(p!.gross)} delta={delta(p!.gross, d.previous.gross)} compare={compare} spark={spark('gross')} color={C.gross} />
            <Kpi label="Net to trucks" value={formatCurrency(p!.net)} delta={delta(p!.net, d.previous.net)} compare={compare} spark={spark('net')} color={p!.net < 0 ? C.loss : C.net} tone={p!.net < 0 ? 'red' : 'teal'} />
            <Kpi label="Driver pay" value={formatCurrency(p!.driver_pay)} sub={`${formatCurrency(p!.driver_payouts)} paid out after deductions`} spark={spark('driver_pay')} color={C.driver_pay} />
            <Kpi label="Deductions" value={formatCurrency(p!.deductions)} sub={p!.gross ? `${Math.round((p!.deductions / p!.gross) * 100)}% of gross` : 'fee, fixed, fuel, expenses'} />
            <Kpi label="Loads" value={String(p!.loads)} sub={multi ? `${(p!.loads / p!.weeks).toFixed(1)} per week · ${p!.miles.toLocaleString()} mi` : `${p!.trucks_with_loads} of ${p!.trucks} trucks moving`} spark={spark('loads')} color={C.other} />
            <Kpi label="Rate per mile" value={p!.rpm != null ? `$${p!.rpm.toFixed(2)}` : '—'} delta={p!.rpm != null && d.previous.rpm != null ? delta(p!.rpm, d.previous.rpm) : undefined} compare={compare} sub={`${p!.miles.toLocaleString()} miles`} />
          </section>

          {/* Attention, always "now" */}
          <section>
            <div className="mb-1.5 flex items-baseline justify-between px-0.5">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Needs your attention now</h2>
              {totalDue > 0 && <span className="text-[0.6875rem] text-slate-500">{formatCurrency(totalDue)} to pay out</span>}
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
              <Attention to="/weeks" icon={CalendarRange} label="Statements ready" count={a!.statements_ready.count} amount={formatCurrency(a!.statements_ready.driver_payouts)} note="driver payouts waiting for ACH" />
              <Attention to="/dispatchers" icon={Headset} label="Dispatchers to pay" count={a!.dispatchers_unpaid.count} amount={formatCurrency(a!.dispatchers_unpaid.amount)} note="this week's commissions" />
              <Attention to="/bills" icon={CreditCard} label="Bills this month" count={a!.bills.unpaid_count} amount={formatCurrency(a!.bills.remaining)} note={a!.bills.due_soon.some(b => b.overdue) ? `${a!.bills.due_soon.filter(b => b.overdue).length} overdue` : 'none overdue'} urgent={a!.bills.due_soon.some(b => b.overdue)} />
              <Attention to="/maintenance" icon={Wrench} label="Service due" count={a!.maintenance.due} amount={`${a!.maintenance.due} overdue${a!.maintenance.soon ? ` · ${a!.maintenance.soon} soon` : ''}`} note={a!.maintenance.items[0] ? `${a!.maintenance.items[0].unit_number} · ${a!.maintenance.items[0].service_type}` : 'nothing overdue'} urgent={a!.maintenance.due > 0} />
            </div>
          </section>

          {/* Trend + breakdown */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
            <Card title="Weekly trend" description={multi ? 'Highlighted weeks are in the selected period. Hover a week for detail.' : 'The selected week and the seven before it. Hover a week for detail.'}>
              <TrendChart data={d.trend} />
            </Card>
            <Card title="Where the gross went" description={multi ? `${p!.weeks} weeks, every truck` : 'This week, every truck'}>
              <Breakdown gross={p!.gross} b={d.breakdown} />
            </Card>
          </div>

          {/* Brokers + watch list */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.7fr)_minmax(20rem,1fr)]">
            <Card title="Gross by broker" description="Who paid in this period">
              <Brokers rows={d.brokers} gross={p!.gross} />
            </Card>
            <Card title="Watch this week" description="Things that will cost money if nobody looks">
              <div className="divide-y divide-slate-100">
                <Row label="Trucks with a negative week" value={a!.negative_weeks.count ? `${a!.negative_weeks.count} · ${formatCurrency(a!.negative_weeks.amount)}` : 'None'} detail={a!.negative_weeks.units.join(', ')} tone={a!.negative_weeks.count ? 'red' : undefined} to="/weeks?filter=negative" />
                <Row label="Trucks without a load" value={a!.idle_trucks.count ? String(a!.idle_trucks.count) : 'None'} detail={a!.idle_trucks.units.join(', ')} tone={a!.idle_trucks.count ? 'amber' : undefined} to="/weeks" />
                {a!.bills.due_soon.map(b => <Row key={b.label} label={b.label} value={formatCurrency(b.amount)} detail={`bill · ${b.overdue ? 'was due' : 'due'} on the ${ordinal(b.due_day)}`} tone={b.overdue ? 'red' : 'amber'} to="/bills" />)}
                {a!.maintenance.items.map(m => (
                  <Row key={m.unit_number + m.service_type} label={`${m.unit_number} · ${m.service_type}`} detail="service" tone={m.status === 'RED' ? 'red' : 'amber'} to="/maintenance"
                    value={m.miles_left != null ? (m.miles_left <= 0 ? `${Math.abs(m.miles_left).toLocaleString()} mi over` : `${m.miles_left.toLocaleString()} mi left`) : m.days_left != null ? (m.days_left <= 0 ? `${-m.days_left} d over` : `${m.days_left} d left`) : ''} />
                ))}
              </div>
            </Card>
          </div>

          {/* Trucks */}
          <Card title={multi ? 'Trucks in this period' : 'Trucks this week'} description="Gross bar is relative to the best truck" action={<Link to={`/weeks?week=${d.this_week_start}`} className="text-[0.6875rem] font-semibold text-blue-700 hover:underline">Weekly board</Link>} flush>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200 bg-slate-50/80 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left">Truck</th><th className="px-3 py-2 text-left">Driver</th><th className="px-3 py-2 text-right">Loads</th><th className="px-3 py-2 text-left">Gross</th><th className="px-3 py-2 text-right">RPM</th><th className="px-3 py-2 text-right">Net</th><th className="px-4 py-2 text-left">{multi ? 'Latest week' : 'Status'}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {d.top_trucks.map(t => {
                  const max = Math.max(1, ...d.top_trucks.map(x => x.gross))
                  return (
                    <tr key={t.truck_id} className="hover:bg-blue-50/40">
                      <td className="px-4 py-2.5"><Link to={`/weeks/${p!.to}/trucks/${t.truck_id}`} className="font-bold text-blue-700 hover:underline">{t.unit_number}</Link></td>
                      <td className="px-3 py-2.5 text-slate-700">{t.driver_name || <span className="text-slate-300">No driver</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{t.loads}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${(t.gross / max) * 100}%`, background: C.gross }} /></div>
                          <Money value={t.gross} />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{t.rpm != null ? `$${t.rpm.toFixed(2)}` : '—'}</td>
                      <td className="px-3 py-2.5 text-right"><Money value={t.net} strong /></td>
                      <td className="px-4 py-2.5"><StatusPill status={t.status as StatementStatus} /></td>
                    </tr>
                  )
                })}
                {d.top_trucks.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-slate-400">No loads in this period. <Link to="/weeks" className="font-semibold text-blue-700 hover:underline">Add one</Link></td></tr>}
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
const short = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`)

// ── KPI with sparkline ────────────────────────────────────────────────────────

function Kpi({ label, value, sub, delta: pct, compare, spark, color, tone = 'slate' }: { label: string; value: string; sub?: string; delta?: number | null; compare?: string; spark?: number[]; color?: string; tone?: 'slate' | 'teal' | 'red' }) {
  const tones = { slate: 'text-slate-950', teal: 'text-teal-700', red: 'text-red-600' }
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-3.5 py-3 shadow-sm">
      <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums tracking-tight ${tones[tone]}`}>{value}</div>
      {pct !== undefined ? (
        <div className={`mt-1 flex items-center gap-1 text-[0.6875rem] font-semibold ${pct == null ? 'text-slate-400' : pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
          {pct != null && (pct >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />)}
          <span className="truncate">{pct == null ? 'nothing before to compare' : `${pct >= 0 ? '+' : ''}${pct}% ${compare}`}</span>
        </div>
      ) : sub && <div className="mt-1 truncate text-[0.6875rem] text-slate-500">{sub}</div>}
      {spark && spark.some(Boolean) && <Sparkline data={spark} color={color || C.gross} />}
    </div>
  )
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const W = 96, H = 28
  const min = Math.min(0, ...data), max = Math.max(1, ...data)
  const x = (i: number) => (i / Math.max(1, data.length - 1)) * W
  const y = (v: number) => H - ((v - min) / (max - min || 1)) * (H - 2) - 1
  const path = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute bottom-2 right-3 h-7 w-24 opacity-70" aria-hidden>
      <path d={`${path} L${W},${H} L0,${H} Z`} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={2} fill={color} />
    </svg>
  )
}

// ── Trend with hover tooltip ──────────────────────────────────────────────────

function useTooltip() {
  const ref = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; body: ReactNode } | null>(null)
  const show = (e: React.MouseEvent, body: ReactNode) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, body })
  }
  const hide = () => setTip(null)
  const node = tip && (
    <div className="pointer-events-none absolute z-20 w-max max-w-[15rem] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[0.6875rem] shadow-xl shadow-slate-900/10 backdrop-blur"
      style={{ left: Math.max(0, Math.min(tip.x + 12, (ref.current?.clientWidth || 0) - 230)), top: Math.max(0, tip.y - 12) }}>
      {tip.body}
    </div>
  )
  return { ref, show, hide, node }
}

function TrendChart({ data }: { data: DashboardData['trend'] }) {
  const { ref, show, hide, node } = useTooltip()
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map(x => Math.max(x.gross, Math.abs(x.net))))
  const W = 720, H = 220, padL = 46, padR = 10, padT = 14, padB = 28
  const innerW = W - padL - padR, innerH = H - padT - padB
  const gw = innerW / data.length, bw = Math.max(3, Math.min(18, gw / 2 - 4))
  const hasLoss = data.some(x => x.net < 0)
  const zero = padT + innerH * (hasLoss ? 0.72 : 1)
  const scale = (zero - padT) / max
  const y = (v: number) => zero - v * scale
  const active = data.filter(x => x.gross)
  const avgGross = active.length ? active.reduce((s, x) => s + x.gross, 0) / active.length : 0
  const every = data.length > 26 ? 4 : data.length > 13 ? 2 : 1
  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full px-2 py-2" role="img" aria-label="Weekly gross and net">
        {[0, 0.5, 1].map(f => <g key={f}><line x1={padL} x2={W - padR} y1={y(f * max)} y2={y(f * max)} stroke="#f1f5f9" /><text x={padL - 8} y={y(f * max) + 3.5} textAnchor="end" fontSize={10} fill="#94a3b8">{short(f * max)}</text></g>)}
        {avgGross > 0 && <g><line x1={padL} x2={W - padR} y1={y(avgGross)} y2={y(avgGross)} stroke={C.gross} strokeDasharray="3 4" opacity={0.5} /><text x={W - padR} y={y(avgGross) - 4} textAnchor="end" fontSize={9} fill={C.gross}>avg {short(avgGross)}</text></g>}
        {data.map((x, i) => {
          const x0 = padL + i * gw + (gw - (bw * 2 + 3)) / 2
          const dim = (hover != null && hover !== i) || !x.in_range
          return (
            <g key={x.period_start} opacity={dim ? (x.in_range ? 0.45 : 0.3) : 1} style={{ transition: 'opacity 120ms' }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => { setHover(null); hide() }}
              onMouseMove={e => show(e, <TrendTip x={x} />)}>
              <rect x={padL + i * gw} y={padT} width={gw} height={innerH} fill={hover === i ? '#f8fafc' : x.in_range ? '#f8fafc' : 'transparent'} opacity={hover === i ? 1 : 0.6} />
              <rect x={x0} y={Math.min(y(x.gross), zero)} width={bw} height={Math.max(1, Math.abs(y(x.gross) - zero))} fill={C.gross} rx={2} opacity={x.gross ? 1 : 0.15} />
              <rect x={x0 + bw + 3} y={Math.min(y(x.net), zero)} width={bw} height={Math.max(1, Math.abs(y(x.net) - zero))} fill={x.net < 0 ? C.loss : C.net} rx={2} opacity={x.net ? 1 : 0.15} />
              {(i % every === 0 || i === data.length - 1) && <text x={padL + i * gw + gw / 2} y={H - 9} textAnchor="middle" fontSize={10} fill={x.in_range ? '#0f172a' : '#94a3b8'} fontWeight={x.in_range ? 600 : 400}>{x.label.split('-')[0]}</text>}
            </g>
          )
        })}
        <line x1={padL} x2={W - padR} y1={zero} y2={zero} stroke="#cbd5e1" />
      </svg>
      <div className="flex items-center gap-4 px-4 pb-3 text-[0.6875rem] font-medium text-slate-600">
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: C.gross }} />Gross</span>
        <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: C.net }} />Net to trucks</span>
        {hasLoss && <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: C.loss }} />Negative week</span>}
      </div>
      {node}
    </div>
  )
}

function TrendTip({ x }: { x: DashboardData['trend'][number] }) {
  const margin = x.gross ? Math.round((x.net / x.gross) * 100) : null
  return (
    <div className="space-y-1">
      <div className="font-bold text-slate-900">Week {x.label}</div>
      <TipRow label="Gross" value={formatCurrency(x.gross)} color={C.gross} />
      <TipRow label="Deductions" value={`− ${formatCurrency(x.deductions)}`} />
      <TipRow label="Driver pay" value={`− ${formatCurrency(x.driver_pay)}`} />
      <TipRow label="Net to trucks" value={formatCurrency(x.net)} color={x.net < 0 ? C.loss : C.net} strong />
      <div className="border-t border-slate-100 pt-1 text-slate-500">{x.loads} loads · {x.miles.toLocaleString()} mi{x.rpm != null ? ` · $${x.rpm.toFixed(2)}/mi` : ''}{margin != null ? ` · ${margin}% margin` : ''}</div>
    </div>
  )
}

function TipRow({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-slate-600">{color && <i className="h-2 w-2 rounded-sm" style={{ background: color }} />}{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{value}</span>
    </div>
  )
}

// ── Breakdown donut ───────────────────────────────────────────────────────────

function Breakdown({ gross, b }: { gross: number; b: DashboardData['breakdown'] }) {
  const [hover, setHover] = useState<string | null>(null)
  const parts = useMemo(() => [
    { key: 'net', label: 'Net to trucks', value: Math.max(0, b.net), color: C.net },
    { key: 'driver_pay', label: 'Driver pay', value: b.driver_pay, color: C.driver_pay },
    { key: 'fee', label: 'Company fee', value: b.fee, color: C.fee },
    { key: 'fixed', label: 'Fixed deductions', value: b.fixed, color: C.fixed },
    { key: 'fuel', label: 'Fuel', value: b.fuel, color: C.fuel },
    { key: 'expenses', label: 'Expenses', value: b.expenses, color: C.expenses },
    { key: 'other', label: 'Other / carry', value: b.other, color: C.other },
  ].filter(p => p.value > 0), [b])
  const total = parts.reduce((s, p) => s + p.value, 0)
  const R = 54, r = 38, cx = 70, cy = 70
  let acc = 0
  const arcs = parts.map(p => {
    const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2; acc += p.value
    const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2
    const big = a1 - a0 > Math.PI ? 1 : 0
    const P = (ang: number, rad: number) => `${(cx + Math.cos(ang) * rad).toFixed(2)},${(cy + Math.sin(ang) * rad).toFixed(2)}`
    const d = parts.length === 1 ? `M${cx - R},${cy} A${R},${R} 0 1 1 ${cx + R},${cy} A${R},${R} 0 1 1 ${cx - R},${cy} M${cx - r},${cy} A${r},${r} 0 1 0 ${cx + r},${cy} A${r},${r} 0 1 0 ${cx - r},${cy}`
      : `M${P(a0, R)} A${R},${R} 0 ${big} 1 ${P(a1, R)} L${P(a1, r)} A${r},${r} 0 ${big} 0 ${P(a0, r)} Z`
    return { ...p, d }
  })
  const active = arcs.find(p => p.key === hover)
  if (!total) return <div className="px-4 py-10 text-center text-slate-400">Nothing on the statements in this period.</div>
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <svg viewBox="0 0 140 140" className="h-32 w-32 shrink-0">
        {arcs.map(p => (
          <path key={p.key} d={p.d} fill={p.color} fillRule="evenodd" opacity={hover && hover !== p.key ? 0.35 : 1} style={{ transition: 'opacity 120ms, transform 120ms', transformOrigin: '70px 70px', transform: hover === p.key ? 'scale(1.04)' : 'scale(1)' }}
            onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fontSize={8} fill="#94a3b8" fontWeight={700}>{(active ? active.label : 'Gross').toUpperCase()}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={12} fill="#0f172a" fontWeight={700}>{active ? short(active.value) : short(gross)}</text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-1">
        {arcs.map(p => (
          <li key={p.key} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)} className={`flex items-center gap-2 rounded px-1.5 py-0.5 transition ${hover === p.key ? 'bg-slate-50' : ''}`}>
            <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: p.color }} />
            <span className="min-w-0 flex-1 text-slate-700">{p.label}</span>
            <span className="shrink-0 text-right tabular-nums"><span className="font-semibold text-slate-900">{formatCurrency(p.value)}</span><span className="ml-1.5 text-slate-400">{Math.round((p.value / total) * 100)}%</span></span>
          </li>
        ))}
        {b.net < 0 && <li className="mt-1 border-t border-slate-100 pt-1.5 text-[0.6875rem] font-semibold text-red-600">Trucks are {formatCurrency(Math.abs(b.net))} short of covering their costs.</li>}
      </ul>
    </div>
  )
}

// ── Brokers ───────────────────────────────────────────────────────────────────

function Brokers({ rows, gross }: { rows: DashboardData['brokers']; gross: number }) {
  if (!rows.length) return <div className="px-4 py-10 text-center text-slate-400">No loads in this period.</div>
  const max = Math.max(1, ...rows.map(r => r.gross))
  return (
    <ul className="space-y-2 px-4 py-3">
      {rows.map(r => (
        <li key={r.name} className="group">
          <div className="mb-1 flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-semibold text-slate-800">{r.name}</span>
            <span className="shrink-0 text-slate-500">{r.loads} load{r.loads === 1 ? '' : 's'} · <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(r.gross)}</span>{gross ? <span className="text-slate-400"> · {Math.round((r.gross / gross) * 100)}%</span> : null}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full transition-all group-hover:brightness-110" style={{ width: `${(r.gross / max) * 100}%`, background: C.gross }} /></div>
        </li>
      ))}
    </ul>
  )
}

// ── Small pieces ──────────────────────────────────────────────────────────────

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

function Card({ title, description, action, flush, children }: { title: string; description?: string; action?: ReactNode; flush?: boolean; children: ReactNode }) {
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
