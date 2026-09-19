import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { dashboardApi, type DashboardData } from '@/api/dashboard'
import { formatCurrency } from '@/utils'
import PageShell from '@/components/ui/PageShell'
import TrendChart from '@/components/dashboard/TrendChart'
import { control } from '@/components/ui/Field'
import { Money, StatusPill } from './WeekBoardPage'
import type { StatementStatus } from '@/api/weeks'

const NET = '#0f766e'
const PART_COLORS = { net: NET, driver_pay: '#3b82f6', fee: '#7c3aed', fixed: '#0891b2', fuel: '#ea580c', expenses: '#d97706', other: '#94a3b8' }

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
    case 'last_week': return { from: iso(addDays(today, -7)), to: iso(addDays(today, -7)) }
    case 'last_4': return { from: iso(addDays(today, -21)), to: iso(today) }
    case 'last_13': return { from: iso(addDays(today, -84)), to: iso(today) }
    case 'this_month': return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) }
    case 'last_month': return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) }
    case 'this_year': return { from: iso(new Date(y, 0, 1)), to: iso(today) }
    default: return { from: iso(today), to: iso(today) }
  }
}

/** One screen for the owner: the period's numbers, what needs paying now, the trend, and the trucks. */
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
  const periodText = d ? (multi ? `${p!.weeks} weeks · ${p!.label}` : `Week ${p!.label}`) : ''

  return (
    <PageShell
      title="Dashboard"
      subtitle={d ? `${new Date(d.today + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · ${periodText}` : 'Loading…'}
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
        <div className={`mx-auto max-w-[90rem] space-y-4 p-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>

          {/* 1. The four numbers */}
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi label="Gross" value={formatCurrency(p!.gross)} delta={delta(p!.gross, d.previous.gross)} compare={compare} />
            <Kpi label="Net to trucks" value={formatCurrency(p!.net)} delta={delta(p!.net, d.previous.net)} compare={compare} tone={p!.net < 0 ? 'red' : 'teal'} />
            <Kpi label="Driver pay" value={formatCurrency(p!.driver_pay)} sub={`${formatCurrency(p!.driver_payouts)} paid out after deductions`} />
            <Kpi label="Loads" value={String(p!.loads)} sub={p!.rpm != null ? `${p!.miles.toLocaleString()} miles · $${p!.rpm.toFixed(2)} per mile` : `${p!.trucks_with_loads} of ${p!.trucks} trucks moving`} />
          </section>

          {/* 2. What needs doing now */}
          <section>
            <SectionTitle>Needs your attention now</SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Attention to="/weeks" label="Statements to pay" count={a!.statements_ready.count} amount={formatCurrency(a!.statements_ready.driver_payouts)} />
              <Attention to="/dispatchers" label="Dispatchers to pay" count={a!.dispatchers_unpaid.count} amount={formatCurrency(a!.dispatchers_unpaid.amount)} />
              <Attention to="/bills" label="Bills this month" count={a!.bills.unpaid_count} amount={formatCurrency(a!.bills.remaining)} urgent={a!.bills.due_soon.some(b => b.overdue)} />
              <Attention to="/maintenance" label="Service overdue" count={a!.maintenance.due} amount={a!.maintenance.items[0] ? `${a!.maintenance.items[0].unit_number} · ${a!.maintenance.items[0].service_type}` : ''} urgent />
            </div>
          </section>

          {/* 3. Trend and watch list */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
            <Card title="Gross and net by week" hint="Bars are gross, the line is what trucks keep">
              <TrendChart data={d.trend} />
            </Card>
            <Card title="Watch this week">
              <div className="divide-y divide-slate-100">
                <Row label="Trucks with a negative week" value={a!.negative_weeks.count ? `${a!.negative_weeks.count} · ${formatCurrency(a!.negative_weeks.amount)}` : 'None'} tone={a!.negative_weeks.count ? 'red' : undefined} to="/weeks?filter=negative" />
                <Row label="Trucks without a load" value={a!.idle_trucks.count ? String(a!.idle_trucks.count) : 'None'} tone={a!.idle_trucks.count ? 'amber' : undefined} to="/weeks" />
                {a!.bills.due_soon.map(b => <Row key={b.label} label={b.label} value={formatCurrency(b.amount)} detail={b.overdue ? 'overdue' : `due on the ${ordinal(b.due_day)}`} tone={b.overdue ? 'red' : 'amber'} to="/bills" />)}
                {a!.maintenance.items.slice(0, 4).map(m => (
                  <Row key={m.unit_number + m.service_type} label={`${m.unit_number} · ${m.service_type}`} tone={m.status === 'RED' ? 'red' : 'amber'} to="/maintenance"
                    value={m.miles_left != null ? (m.miles_left <= 0 ? `${Math.abs(m.miles_left).toLocaleString()} mi over` : `${m.miles_left.toLocaleString()} mi left`) : m.days_left != null ? (m.days_left <= 0 ? `${-m.days_left} d over` : `${m.days_left} d left`) : ''} />
                ))}
              </div>
            </Card>
          </div>

          {/* 4. Where the gross went */}
          <Card title="Where the gross went" hint={periodText}>
            <Breakdown gross={p!.gross} b={d.breakdown} />
          </Card>

          {/* 5. Trucks */}
          <Card title={multi ? 'Trucks in this period' : 'Trucks this week'} action={<Link to={`/weeks?week=${d.this_week_start}`} className="text-xs font-semibold text-blue-700 hover:underline">Weekly board</Link>} flush>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-200 bg-slate-50/80 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left">Truck</th><th className="px-3 py-2 text-left">Driver</th><th className="px-3 py-2 text-right">Loads</th><th className="px-3 py-2 text-right">Miles</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">RPM</th><th className="px-3 py-2 text-right">Net</th><th className="px-4 py-2 text-left">{multi ? 'Latest week' : 'Status'}</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {d.top_trucks.map(t => (
                  <tr key={t.truck_id} className="hover:bg-blue-50/40">
                    <td className="px-4 py-2.5"><Link to={`/weeks/${p!.to}/trucks/${t.truck_id}`} className="font-bold text-blue-700 hover:underline">{t.unit_number}</Link></td>
                    <td className="px-3 py-2.5 text-slate-700">{t.driver_name || <span className="text-slate-300">No driver</span>}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{t.loads}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{t.miles.toLocaleString()}</td>
                    <td className="px-3 py-2.5 text-right"><Money value={t.gross} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{t.rpm != null ? `$${t.rpm.toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-2.5 text-right"><Money value={t.net} strong /></td>
                    <td className="px-4 py-2.5"><StatusPill status={t.status as StatementStatus} /></td>
                  </tr>
                ))}
                {d.top_trucks.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-slate-400">No loads in this period. <Link to="/weeks" className="font-semibold text-blue-700 hover:underline">Add one</Link></td></tr>}
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

// ── Blocks ────────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 px-0.5 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">{children}</h2>
}

function Kpi({ label, value, sub, delta: pct, compare, tone = 'slate' }: { label: string; value: string; sub?: string; delta?: number | null; compare?: string; tone?: 'slate' | 'teal' | 'red' }) {
  const tones = { slate: 'text-slate-950', teal: 'text-teal-700', red: 'text-red-600' }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
      <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${tones[tone]}`}>{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500">
        {pct !== undefined
          ? pct == null ? 'Nothing before to compare' : <><span className={`font-semibold ${pct >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{pct >= 0 ? '+' : ''}{pct}%</span> {compare}</>
          : sub}
      </div>
    </div>
  )
}

function Attention({ to, label, count, amount, urgent }: { to: string; label: string; count: number; amount: string; urgent?: boolean }) {
  const active = count > 0
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:border-blue-300">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-bold tabular-nums ${!active ? 'bg-emerald-50 text-emerald-700' : urgent ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-700'}`}>{count}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-slate-800">{label}</span>
        <span className="block truncate text-xs text-slate-500">{active ? amount : 'All clear'}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-600" />
    </Link>
  )
}

function Card({ title, hint, action, flush, children }: { title: string; hint?: string; action?: ReactNode; flush?: boolean; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {action || (hint && <span className="text-[0.6875rem] text-slate-400">{hint}</span>)}
      </header>
      <div className={flush ? '' : 'text-xs'}>{children}</div>
    </section>
  )
}

function Row({ label, value, detail, tone, to }: { label: string; value: string; detail?: string; tone?: 'red' | 'amber'; to: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-blue-50/40">
      <span className={`h-2 w-2 shrink-0 rounded-full ${tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
      <span className="min-w-0 flex-1 truncate text-slate-800">{label}{detail && <span className="text-slate-400"> · {detail}</span>}</span>
      <span className={`shrink-0 font-semibold tabular-nums ${tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-700' : 'text-slate-500'}`}>{value}</span>
    </Link>
  )
}

// ── Breakdown as one bar ──────────────────────────────────────────────────────

function Breakdown({ gross, b }: { gross: number; b: DashboardData['breakdown'] }) {
  const parts = [
    { key: 'net', label: 'Net to trucks', value: Math.max(0, b.net) },
    { key: 'driver_pay', label: 'Driver pay', value: b.driver_pay },
    { key: 'fee', label: 'Company fee', value: b.fee },
    { key: 'fixed', label: 'Fixed deductions', value: b.fixed },
    { key: 'fuel', label: 'Fuel', value: b.fuel },
    { key: 'expenses', label: 'Expenses', value: b.expenses },
    { key: 'other', label: 'Other', value: b.other },
  ].filter(p => p.value > 0) as Array<{ key: keyof typeof PART_COLORS; label: string; value: number }>
  const total = parts.reduce((s, p) => s + p.value, 0)
  if (!total) return <div className="px-4 py-8 text-center text-slate-400">Nothing on the statements in this period.</div>
  return (
    <div className="px-4 py-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {parts.map(p => <div key={p.key} title={`${p.label} ${formatCurrency(p.value)}`} style={{ width: `${(p.value / total) * 100}%`, background: PART_COLORS[p.key] }} />)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        {parts.map(p => (
          <div key={p.key} className="flex items-center gap-2">
            <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: PART_COLORS[p.key] }} />
            <span className="min-w-0 flex-1 truncate text-slate-600">{p.label}</span>
            <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(p.value)}</span>
            <span className="w-8 text-right tabular-nums text-slate-400">{Math.round((p.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
        Gross {formatCurrency(gross)}.{' '}
        {b.net < 0
          ? <span className="font-semibold text-red-600">Costs are {formatCurrency(Math.abs(b.net))} more than the gross in this period.</span>
          : <>Trucks keep <span className="font-semibold text-teal-700">{formatCurrency(b.net)}</span>{gross ? ` (${Math.round((b.net / gross) * 100)}%)` : ''}.</>}
      </div>
    </div>
  )
}
