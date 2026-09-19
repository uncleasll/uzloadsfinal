import type { ReactNode } from 'react'

export const control = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400'
export const textarea = `${control} h-auto min-h-[4.5rem] py-2`

export function Field({ label, hint, required, span = 1, children }: { label: string; hint?: string; required?: boolean; span?: 1 | 2 | 3; children: ReactNode }) {
  const cols = { 1: '', 2: 'sm:col-span-2', 3: 'sm:col-span-3' }[span]
  return (
    <label className={`block ${cols}`}>
      <span className="mb-1 block text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-500">
        {label}{required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[0.6875rem] text-slate-400">{hint}</span>}
    </label>
  )
}

/** A titled card that groups related fields inside a drawer or a form. */
export function Section({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <div>
          <h3 className="text-xs font-bold text-slate-900">{title}</h3>
          {description && <p className="text-[0.6875rem] text-slate-400">{description}</p>}
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

export const Grid = ({ cols = 2, children }: { cols?: 2 | 3; children: ReactNode }) => (
  <div className={`grid gap-3 ${cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{children}</div>
)

export const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']
