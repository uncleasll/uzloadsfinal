import { useState, useEffect, useCallback } from 'react'
import client from '@/api/client'
import { driversApi } from '@/api/entities'
import type { Driver } from '@/types'
import { formatCurrency, formatDate } from '@/utils'
import toast from 'react-hot-toast'

interface AdvPay {
  id: number
  payment_number: number
  driver_id: number
  driver_name?: string
  payment_date: string
  amount: number
  applied_amount: number
  remaining: number
  description?: string
  category?: string
  is_applied: boolean
  applied_to_settlement_id?: number
  created_at?: string
}

const CATS = ['Com check','Fuel advance','Pre-payment','Loan','Other','Repair advance','Detention advance','Escrow release']

function Badge({ ap }: { ap: AdvPay }) {
  if (ap.is_applied) return <span className="inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold bg-blue-100 text-blue-700">Applied</span>
  if (ap.applied_amount > 0) return <span className="inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold bg-amber-100 text-amber-700">Partial</span>
  return <span className="inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold bg-gray-100 text-gray-500">Unapplied</span>
}

const AP_COLUMN_DEFS: { key: string; label: string; sortable?: boolean; align?: 'right'; width: string }[] = [
  { key: 'number',      label: '#',           sortable: true, width: '5%' },
  { key: 'date',        label: 'DATE',        sortable: true, width: '8%' },
  { key: 'driver',      label: 'DRIVER',      sortable: true, width: '15%' },
  { key: 'category',    label: 'CATEGORY',    sortable: true, width: '11%' },
  { key: 'description', label: 'DESCRIPTION', width: '20%' },
  { key: 'amount',      label: 'AMOUNT',      sortable: true, align: 'right', width: '8%' },
  { key: 'applied',     label: 'APPLIED',     sortable: true, align: 'right', width: '8%' },
  { key: 'remaining',   label: 'REMAINING',   sortable: true, align: 'right', width: '8%' },
  { key: 'status',      label: 'STATUS',      sortable: true, width: '8%' },
]

function apSortVal(ap: AdvPay, key: string): string | number {
  switch (key) {
    case 'number':    return ap.payment_number ?? ap.id
    case 'date':      return ap.payment_date || ''
    case 'driver':    return ap.driver_name || ''
    case 'category':  return ap.category || ''
    case 'amount':    return ap.amount ?? 0
    case 'applied':   return ap.applied_amount ?? 0
    case 'remaining': return ap.remaining ?? 0
    case 'status':    return ap.is_applied ? 'Applied' : ap.applied_amount > 0 ? 'Partial' : 'Unapplied'
    default:          return ''
  }
}

function RowActionMenu({ onEdit, onDelete, editLabel, deleteLabel, deleteDisabled }: {
  onEdit: () => void; onDelete: () => void; editLabel: string; deleteLabel: string; deleteDisabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex items-center justify-center">
      <button onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={'inline-flex h-6 w-6 items-center justify-center rounded transition-colors ' +
          (open ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-blue-50 hover:text-blue-700')}>
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-0.5 w-48 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-950/10">
          <button role="menuitem" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onEdit() }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.6875rem] font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            {editLabel}
          </button>
          {deleteDisabled ? (
            <div className="flex w-full cursor-not-allowed items-center gap-2 px-3 py-2 text-left text-[0.6875rem] font-medium text-slate-300" title="Already applied to a settlement">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              {deleteLabel}
            </div>
          ) : (
            <button role="menuitem" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDelete() }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.6875rem] font-medium text-red-600 transition-colors hover:bg-red-50">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              {deleteLabel}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdvancedPaymentsPage() {
  const [items, setItems] = useState<AdvPay[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<AdvPay | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [filters, setFilters] = useState({ driver_id: '', unapplied_only: false, date_from: '', date_to: '' })
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState('number')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const sortBy = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // Fetch the full filtered set once; search/sort/pagination happen client-side
  const load = useCallback(() => {
    setLoading(true)
    const p: Record<string, string | number | boolean> = { page: 1, page_size: 1000 }
    if (filters.driver_id) p.driver_id = filters.driver_id
    if (filters.unapplied_only) p.unapplied_only = true
    if (filters.date_from) p.date_from = filters.date_from
    if (filters.date_to) p.date_to = filters.date_to
    client.get('/api/v1/advanced-payments', { params: p })
      .then(r => setItems(r.data.items || []))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])
  useEffect(() => { driversApi.list().then(setDrivers).catch(() => {}) }, [])

  const handleDelete = (ap: AdvPay) => {
    if (ap.applied_amount > 0) { toast.error('Cannot delete: already applied to a settlement'); return }
    if (!confirm(`Delete advanced payment #${ap.payment_number}?`)) return
    client.delete('/api/v1/advanced-payments/' + ap.id)
      .then(() => { toast.success('Deleted'); load() })
      .catch(e => toast.error(e.response?.data?.detail || e.message))
  }

  const q = search.trim().toLowerCase()
  const filtered = items.filter(ap => !q ||
    [String(ap.payment_number), ap.driver_name, ap.category, ap.description]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
  const sortedAll = [...filtered].sort((a, b) => {
    const va = apSortVal(a, sortKey), vb = apSortVal(b, sortKey)
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' })
    return sortDir === 'asc' ? cmp : -cmp
  })
  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const sorted = sortedAll.slice((safePage - 1) * pageSize, safePage * pageSize)
  const totalAmt = filtered.reduce((a, i) => a + i.amount, 0)
  const totalApp = filtered.reduce((a, i) => a + (i.applied_amount || 0), 0)
  const totalRem = filtered.reduce((a, i) => a + i.remaining, 0)
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = Math.min(safePage * pageSize, total)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">

      {/* Header */}
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="mr-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Advanced Payments</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.625rem] font-bold text-slate-500">{total}</span>
            </div>
            <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">Com-checks and fuel advances applied to driver settlements</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-[13.75rem] flex-1 sm:flex-none">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search advances..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-xs text-slate-800 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-64" />
            </div>
            <button onClick={() => { setEditItem(null); setShowModal(true) }} className="btn-primary h-9 rounded-lg px-4 text-xs">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5"/></svg>
              New advance
            </button>
          </div>
        </div>

        {/* Filters + summary */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex flex-shrink-0 items-center">
            <select value={filters.driver_id} onChange={e => { setFilters(p => ({ ...p, driver_id: e.target.value })); setPage(1) }}
              className="h-9 appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-[0.6875rem] font-semibold text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">All drivers</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-2 w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <input type="date" value={filters.date_from}
              onChange={e => { setFilters(p => ({ ...p, date_from: e.target.value })); setPage(1) }}
              className="h-9 w-28 rounded-md border border-slate-200 px-2 text-[0.6875rem] shadow-sm focus:outline-none focus:border-blue-400" />
            <span className="text-gray-300">—</span>
            <input type="date" value={filters.date_to}
              onChange={e => { setFilters(p => ({ ...p, date_to: e.target.value })); setPage(1) }}
              className="h-9 w-28 rounded-md border border-slate-200 px-2 text-[0.6875rem] shadow-sm focus:outline-none focus:border-blue-400" />
          </div>
          <button onClick={() => { setFilters(p => ({ ...p, unapplied_only: !p.unapplied_only })); setPage(1) }}
            className={`rounded-full border px-2.5 py-1 text-[0.625rem] font-semibold transition ${filters.unapplied_only ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'}`}>
            Unapplied only
          </button>
          {(filters.driver_id || filters.date_from || filters.date_to || filters.unapplied_only) && (
            <button onClick={() => { setFilters({ driver_id: '', unapplied_only: false, date_from: '', date_to: '' }); setPage(1) }}
              className="rounded px-2 py-1 text-[0.625rem] font-semibold text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600">Clear</button>
          )}
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 shadow-sm">
              <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-blue-500">Issued</span>
              <span className="whitespace-nowrap text-xs font-bold text-blue-800">{formatCurrency(totalAmt)}</span>
            </div>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm">
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />
              <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-slate-400">Applied</span>
              <span className="whitespace-nowrap text-xs font-bold text-slate-800">{formatCurrency(totalApp)}</span>
            </div>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm">
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" />
              <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-slate-400">Outstanding</span>
              <span className="whitespace-nowrap text-xs font-bold text-slate-800">{formatCurrency(totalRem)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 11 }}>
          <colgroup>
            {AP_COLUMN_DEFS.map(c => <col key={c.key} style={{ width: c.width }} />)}
            <col style={{ width: 76 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-200 bg-slate-50/95 shadow-[0_1px_0_rgba(148,163,184,0.12)] backdrop-blur">
              {AP_COLUMN_DEFS.map(h => (
                <th key={h.key} className={`px-1.5 py-2 font-bold uppercase text-slate-500 whitespace-nowrap ${h.align === 'right' ? 'text-right' : 'text-left'}`} style={{ fontSize: 10 }}>
                  {h.sortable ? (
                    <button onClick={() => sortBy(h.key)} className="inline-flex items-center gap-0.5 hover:text-blue-700">
                      {h.label}
                      <span className={sortKey === h.key ? 'opacity-100 text-blue-600' : 'opacity-30'}>
                        {sortKey === h.key && sortDir === 'asc' ? '↑' : '↓'}
                      </span>
                    </button>
                  ) : h.label}
                </th>
              ))}
              <th className="px-1.5 py-2 text-center font-bold uppercase text-slate-500 whitespace-nowrap" style={{ fontSize: 10 }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr><td colSpan={AP_COLUMN_DEFS.length + 1} className="py-20 text-center"><div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />Loading advances...</div></td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={AP_COLUMN_DEFS.length + 1} className="py-20 text-center"><div className="mx-auto max-w-xs"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg></div><div className="text-sm font-semibold text-slate-700">No advanced payments found</div><button onClick={() => setShowModal(true)} className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700">+ Create one</button></div></td></tr>
            ) : sorted.map(ap => (
              <tr key={ap.id} onClick={() => { setEditItem(ap); setShowModal(true) }}
                className="group cursor-pointer border-l-2 border-l-transparent transition-colors odd:bg-white even:bg-slate-50/30 hover:border-l-blue-500 hover:bg-blue-50/70">
                <td className="px-1.5 py-1 font-semibold text-blue-600">#{ap.payment_number}</td>
                <td className="px-1.5 py-1 text-gray-500 truncate">{formatDate(ap.payment_date)}</td>
                <td className="px-1.5 py-1 font-medium text-gray-900 truncate">{ap.driver_name || <span className="font-normal text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-gray-600 truncate">{ap.category || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-gray-500 truncate">{ap.description || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(ap.amount)}</td>
                <td className="px-1.5 py-1 text-right font-medium text-blue-700 whitespace-nowrap">
                  {ap.applied_amount > 0 ? formatCurrency(ap.applied_amount) : <span className="font-normal text-gray-300">—</span>}
                </td>
                <td className={`px-1.5 py-1 text-right font-semibold whitespace-nowrap ${ap.remaining > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                  {formatCurrency(ap.remaining)}
                </td>
                <td className="px-1.5 py-1"><Badge ap={ap} /></td>
                <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
                  <RowActionMenu
                    onEdit={() => { setEditItem(ap); setShowModal(true) }}
                    onDelete={() => handleDelete(ap)}
                    editLabel="Edit Advance"
                    deleteLabel="Delete Advance"
                    deleteDisabled={ap.is_applied || ap.applied_amount > 0}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 lg:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-0.5">
            <button onClick={() => setPage(1)} disabled={safePage <= 1} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></button>
            <button onClick={() => setPage(v => Math.max(1, v - 1))} disabled={safePage <= 1} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => { const s = Math.max(1, Math.min(safePage - 2, totalPages - 4)); return s + i }).map(pn => (
              <button key={pn} onClick={() => setPage(pn)} className={`w-5 h-5 rounded text-[0.6875rem] font-medium transition-colors ${pn === safePage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{pn}</button>
            ))}
            <button onClick={() => setPage(v => Math.min(totalPages, v + 1))} disabled={safePage >= totalPages} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></button>
            <button onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
          </div>
          <span className="text-[0.6875rem] text-gray-500">Showing {start}–{end} of {total} entries</span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <span className="px-1.5 text-[0.625rem] font-medium text-slate-400">Rows</span>
          {[10, 25, 50, 100].map(n => (
            <button key={n} onClick={() => { setPageSize(n); setPage(1) }}
              className={`rounded-md px-2 py-1 text-[0.625rem] transition ${pageSize === n ? 'bg-blue-600 font-bold text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {showModal && (
        <APModal item={editItem} drivers={drivers}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSaved={() => { setShowModal(false); setEditItem(null); load() }} />
      )}
    </div>
  )
}

function APModal({ item, drivers, onClose, onSaved }: {
  item: AdvPay | null; drivers: Driver[]; onClose: () => void; onSaved: () => void
}) {
  const canEdit = !item || (item.applied_amount === 0 && !item.is_applied)
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    driver_id: item ? String(item.driver_id) : '',
    payment_date: item ? item.payment_date : today,
    amount: item ? String(item.amount) : '',
    category: item ? (item.category || 'Com check') : 'Com check',
    description: item ? (item.description || '') : '',
  })
  const [saving, setSaving] = useState(false)
  const sf = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.driver_id) { toast.error('Select a driver'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Amount must be > 0'); return }
    if (!form.payment_date) { toast.error('Date required'); return }
    const payload = {
      driver_id: parseInt(form.driver_id),
      payment_date: form.payment_date,
      amount: parseFloat(form.amount),
      category: form.category || undefined,
      description: form.description || undefined,
    }
    setSaving(true)
    const req = item && canEdit
      ? client.put('/api/v1/advanced-payments/' + item.id, payload)
      : client.post('/api/v1/advanced-payments', payload)
    req.then(() => { toast.success(item ? 'Updated' : 'Advanced payment created'); onSaved() })
      .catch(e => toast.error(e.response?.data?.detail || e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[31.25rem] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="font-bold text-gray-900 text-base">{item ? `Advanced Payment #${item.payment_number}` : 'New Advanced Payment'}</h3>
            {item && <p className="text-xs text-gray-400 mt-0.5">Created {formatDate(item.created_at)}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {item && !canEdit && (
          <div className="mx-5 mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
            <p className="font-semibold text-amber-800">⚠ Already applied to a settlement</p>
            <p className="text-amber-700 mt-0.5">Applied: {formatCurrency(item.applied_amount)} · Remaining: {formatCurrency(item.remaining)}</p>
            <p className="text-amber-600 mt-1">To edit, remove it from the settlement first.</p>
          </div>
        )}

        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Driver <span className="text-red-500">*</span></label>
              <div className="relative">
                <select value={form.driver_id} onChange={e => sf('driver_id', e.target.value)} disabled={!canEdit}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500 appearance-none disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">Select driver</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.payment_date} onChange={e => sf('payment_date', e.target.value)} disabled={!canEdit}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:bg-gray-50" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Amount <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">$</span>
                <input type="number" step="0.01" min="0.01" value={form.amount}
                  onChange={e => sf('amount', e.target.value)} disabled={!canEdit}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500 disabled:bg-gray-50" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Category</label>
              <div className="relative">
                <select value={form.category} onChange={e => sf('category', e.target.value)} disabled={!canEdit}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500 appearance-none disabled:bg-gray-50">
                  {CATS.map(c => <option key={c}>{c}</option>)}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => sf('description', e.target.value)} disabled={!canEdit}
              rows={3} placeholder="e.g. Com check for truck repairs — Load #1045"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500 disabled:bg-gray-50" />
          </div>
          {!item && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-700">
              <strong>💡 How it works:</strong> After saving, this payment will appear in the driver's settlement under <em>Advanced Payments</em>. Click <strong>+</strong> to apply and deduct it from the settlement total.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm rounded-lg font-medium">
            Close
          </button>
          {canEdit && (
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Saving…' : item ? 'Save Changes' : 'Create Payment'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
