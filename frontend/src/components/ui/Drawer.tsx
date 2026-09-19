import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

/** Right-hand panel for viewing or editing one record. Escape and the backdrop both close it. */
export default function Drawer({ title, subtitle, badge, actions, tabs, footer, width = 640, onClose, children }: {
  title: ReactNode
  subtitle?: ReactNode
  badge?: ReactNode
  actions?: ReactNode
  tabs?: ReactNode
  footer?: ReactNode
  width?: number
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel text-xs" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <header className="flex-shrink-0 border-b border-slate-200 px-5 pt-4">
          <div className="flex items-start justify-between gap-3 pb-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-bold tracking-tight text-slate-950">{title}</h2>
                {badge}
              </div>
              {subtitle && <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {actions}
              <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
          </div>
          {tabs}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-5">{children}</div>
        {footer && <footer className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">{footer}</footer>}
      </div>
    </>,
    document.body,
  )
}

export function DrawerTabs<T extends string>({ value, onChange, items }: { value: T; onChange: (t: T) => void; items: Array<{ key: T; label: string; count?: number }> }) {
  return (
    <div className="-mb-px flex gap-4">
      {items.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)} aria-pressed={value === t.key}
          className={`flex items-center gap-1.5 border-b-2 pb-2.5 text-xs font-semibold transition ${value === t.key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
          {t.label}
          {t.count != null && <span className={`rounded-full px-1.5 text-[0.6875rem] ${value === t.key ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{t.count}</span>}
        </button>
      ))}
    </div>
  )
}
