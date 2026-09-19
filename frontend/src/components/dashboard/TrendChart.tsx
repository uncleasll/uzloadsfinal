import { useMemo } from 'react'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DashboardData } from '@/api/dashboard'
import { formatCurrency } from '@/utils'

const GROSS = '#2563eb', NET = '#0f766e', LOSS = '#dc2626', MUTED = '#cbd5e1'
type Week = DashboardData['trend'][number]

const short = (v: number) => (Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1)}k` : `$${Math.round(v)}`)

/** Gross as bars, net to trucks as a line, over the selected period and the weeks before it. */
export default function TrendChart({ data }: { data: DashboardData['trend'] }) {
  const rows = useMemo(() => data.map(w => ({ ...w, week: w.label.split('-')[0] })), [data])
  const active = rows.filter(w => w.in_range && w.gross)
  const avgGross = active.length ? active.reduce((s, w) => s + w.gross, 0) / active.length : 0
  const best = active.length ? active.reduce((a, b) => (b.gross > a.gross ? b : a)) : null
  const totalGross = active.reduce((s, w) => s + w.gross, 0)
  const totalNet = active.reduce((s, w) => s + w.net, 0)
  const hasLoss = rows.some(w => w.net < 0)

  return (
    <div>
      <div className="h-64 w-full px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="28%">
            <defs>
              <linearGradient id="grossFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={GROSS} stopOpacity={0.95} />
                <stop offset="100%" stopColor={GROSS} stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="grossFillMuted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={MUTED} stopOpacity={0.9} />
                <stop offset="100%" stopColor={MUTED} stopOpacity={0.5} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="2 4" />
            <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} interval="preserveStartEnd" minTickGap={18} dy={6} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={short} width={52} />
            <Tooltip content={<WeekTooltip />} cursor={{ fill: '#f1f5f9' }} />
            {hasLoss && <ReferenceLine y={0} stroke="#94a3b8" />}
            {avgGross > 0 && <ReferenceLine y={avgGross} stroke={GROSS} strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: `avg ${short(avgGross)}`, position: 'insideTopRight', fontSize: 10, fill: GROSS }} />}
            <Bar dataKey="gross" name="Gross" radius={[5, 5, 0, 0]} maxBarSize={38} isAnimationActive animationDuration={500}>
              {rows.map(w => <Cell key={w.period_start} fill={w.in_range ? 'url(#grossFill)' : 'url(#grossFillMuted)'} />)}
            </Bar>
            <Line type="monotone" dataKey="net" name="Net to trucks" stroke={NET} strokeWidth={2.5} dot={<NetDot />} activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }} isAnimationActive animationDuration={600} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend and period summary */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-2.5 text-xs">
        <Legend color={GROSS} label="Gross" />
        <Legend color={NET} label="Net to trucks" line />
        {hasLoss && <Legend color={LOSS} label="Negative week" line />}
        {active.length > 0 && (
          <span className="ml-auto flex flex-wrap items-center gap-x-4 text-slate-500">
            <span>Total <b className="font-semibold tabular-nums text-slate-900">{formatCurrency(totalGross)}</b></span>
            <span>Net <b className={`font-semibold tabular-nums ${totalNet < 0 ? 'text-red-600' : 'text-teal-700'}`}>{formatCurrency(totalNet)}</b></span>
            <span>Avg / week <b className="font-semibold tabular-nums text-slate-900">{formatCurrency(avgGross)}</b></span>
            {best && <span>Best <b className="font-semibold tabular-nums text-slate-900">{best.week}</b> · {formatCurrency(best.gross)}</span>}
          </span>
        )}
      </div>
    </div>
  )
}

function NetDot(props: { cx?: number; cy?: number; payload?: Week }) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload || (!payload.gross && !payload.net)) return null
  return <circle cx={cx} cy={cy} r={3.5} fill={payload.net < 0 ? LOSS : NET} stroke="#fff" strokeWidth={1.5} />
}

function WeekTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Week }> }) {
  if (!active || !payload?.length) return null
  const w = payload[0].payload
  const margin = w.gross ? Math.round((w.net / w.gross) * 100) : null
  return (
    <div className="w-56 rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-xl shadow-slate-900/10">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-bold text-slate-900">Week {w.label}</span>
        {!w.in_range && <span className="rounded-full bg-slate-100 px-1.5 text-[0.625rem] font-semibold text-slate-500">outside period</span>}
      </div>
      <Line2 color={GROSS} label="Gross" value={formatCurrency(w.gross)} />
      <Line2 label="Deductions" value={`− ${formatCurrency(w.deductions)}`} />
      <Line2 label="Driver pay" value={`− ${formatCurrency(w.driver_pay)}`} />
      <div className="my-1.5 border-t border-slate-100" />
      <Line2 color={w.net < 0 ? LOSS : NET} label="Net to trucks" value={formatCurrency(w.net)} strong />
      <div className="mt-2 text-[0.6875rem] text-slate-500">{w.loads} loads · {w.miles.toLocaleString()} mi{w.rpm != null ? ` · $${w.rpm.toFixed(2)}/mi` : ''}{margin != null ? ` · ${margin}% margin` : ''}</div>
    </div>
  )
}

function Line2({ label, value, color, strong }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className="flex items-center gap-1.5 text-slate-600">{color && <i className="h-2 w-2 rounded-sm" style={{ background: color }} />}{label}</span>
      <span className={`tabular-nums ${strong ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{value}</span>
    </div>
  )
}

function Legend({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-slate-600">
      {line ? <i className="h-0.5 w-3.5 rounded-full" style={{ background: color }} /> : <i className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
      {label}
    </span>
  )
}
