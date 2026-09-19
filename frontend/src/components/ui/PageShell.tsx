import type { ReactNode } from 'react'

/** The frame every list page shares: white card, header with title and actions, optional toolbar, body. */
export default function PageShell({ title, subtitle, count, actions, toolbar, footer, children }: {
  title: string
  subtitle?: string
  count?: number
  actions?: ReactNode
  toolbar?: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-xs shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex-shrink-0 border-b border-slate-200/80 px-4 pt-4 lg:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">{title}</h1>
              {count != null && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-bold tabular-nums text-slate-600">{count}</span>}
            </div>
            {subtitle && <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        {toolbar && <div className="flex flex-wrap items-center gap-2 pb-3">{toolbar}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70">{children}</div>
      {footer && <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5 text-slate-500">{footer}</div>}
    </div>
  )
}

export function Th({ children, align = 'left', className = '' }: { children?: ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  return <th className={`px-3 py-2 text-${align} text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500 ${className}`}>{children}</th>
}

export function EmptyRow({ colSpan, title, hint }: { colSpan: number; title: string; hint?: string }) {
  return (
    <tr><td colSpan={colSpan} className="py-16 text-center">
      <div className="text-sm font-semibold text-slate-700">{title}</div>
      {hint && <p className="mt-1 text-slate-400">{hint}</p>}
    </td></tr>
  )
}

export const Pill = ({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'slate' | 'blue'; children: ReactNode }) => {
  const t = { green: 'bg-emerald-50 text-emerald-700', amber: 'bg-amber-50 text-amber-700', red: 'bg-red-50 text-red-700', slate: 'bg-slate-100 text-slate-500', blue: 'bg-blue-50 text-blue-700' }[tone]
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-bold ${t}`}>{children}</span>
}
