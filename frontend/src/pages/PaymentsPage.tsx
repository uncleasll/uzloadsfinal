import { useState, useEffect, useCallback } from 'react'
import client from '@/api/client'
import { driversApi } from '@/api/entities'
import type { Driver } from '@/types'
import { formatCurrency, formatDate } from '@/utils'
import toast from 'react-hot-toast'

interface Payment {
  id: number
  payment_number?: number
  payment_type: string
  driver_id?: number
  driver_name?: string
  vendor_id?: number
  vendor_name?: string
  settlement_id?: number
  settlement_number?: number
  payment_date: string
  amount: number
  description?: string
  payable_to?: string
  notes?: string
  is_active: boolean
  created_at?: string
}

const PAYMENT_TYPES = ['advanced_payment', 'settlement_payment', 'other']
const TYPE_LABELS: Record<string, string> = {
  advanced_payment: 'Advanced Payment',
  settlement_payment: 'Settlement Payment',
  other: 'Other',
}

function TypeBadge({ type }: { type: string }) {
  const cls =
    type === 'advanced_payment' ? 'bg-amber-100 text-amber-700' :
    type === 'settlement_payment' ? 'bg-blue-100 text-blue-700' :
    'bg-gray-100 text-gray-600'
  return <span className={`inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{TYPE_LABELS[type] || type}</span>
}

const PAYMENT_COLUMN_DEFS: { key: string; label: string; sortable?: boolean; align?: 'right'; width: string }[] = [
  { key: 'number',      label: '#',             sortable: true, width: '6%' },
  { key: 'date',        label: 'DATE',          sortable: true, width: '9%' },
  { key: 'type',        label: 'TYPE',          sortable: true, width: '13%' },
  { key: 'payee',       label: 'DRIVER / PAYEE', sortable: true, width: '17%' },
  { key: 'description', label: 'DESCRIPTION',   width: '25%' },
  { key: 'amount',      label: 'AMOUNT',        sortable: true, align: 'right', width: '9%' },
  { key: 'settlement',  label: 'SETTLEMENT',    width: '11%' },
]

function paymentSortVal(p: Payment, key: string): string | number {
  switch (key) {
    case 'number': return p.payment_number ?? p.id
    case 'date':   return p.payment_date || ''
    case 'type':   return TYPE_LABELS[p.payment_type] || p.payment_type
    case 'payee':  return p.driver_name || p.vendor_name || p.payable_to || ''
    case 'amount': return p.amount ?? 0
    default:       return ''
  }
}

function RowActionMenu({ onEdit, onDelete, editLabel, deleteLabel }: {
  onEdit: () => void; onDelete: () => void; editLabel: string; deleteLabel: string
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
        <div role="menu" className="absolute right-0 top-full z-50 mt-0.5 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-950/10">
          <button role="menuitem" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onEdit() }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            {editLabel}
          </button>
          <button role="menuitem" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDelete() }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            {deleteLabel}
          </button>
        </div>
      )}
    </div>
  )
}

export default function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Payment | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [filters, setFilters] = useState({ driver_id: '', payment_type: '', date_from: '', date_to: '' })
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
    const p: Record<string, string | number> = { page: 1, page_size: 1000 }
    if (filters.driver_id) p.driver_id = filters.driver_id
    if (filters.payment_type) p.payment_type = filters.payment_type
    if (filters.date_from) p.date_from = filters.date_from
    if (filters.date_to) p.date_to = filters.date_to
    client.get('/api/v1/payments', { params: p })
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (d.items || []))
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])
  useEffect(() => { driversApi.list().then(setDrivers).catch(() => {}) }, [])

  const handleDelete = (p: Payment) => {
    if (!confirm(`Delete payment #${p.payment_number || p.id}?`)) return
    client.delete('/api/v1/payments/' + p.id)
      .then(() => { toast.success('Deleted'); load() })
      .catch(e => toast.error(e.response?.data?.detail || e.message))
  }

  const q = search.trim().toLowerCase()
  const filtered = items.filter(p => !q ||
    [String(p.payment_number || p.id), p.driver_name, p.vendor_name, p.payable_to, p.description]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
  const sortedAll = [...filtered].sort((a, b) => {
    const va = paymentSortVal(a, sortKey), vb = paymentSortVal(b, sortKey)
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
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = Math.min(safePage * pageSize, total)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[11px] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">

      {/* Header */}
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="mr-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Payments</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{total}</span>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">All payment records — settlements and other transactions</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-[220px] flex-1 sm:flex-none">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search payments..." value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-xs text-slate-800 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-64" />
            </div>
            <button onClick={() => { setEditItem(null); setShowModal(true) }} className="btn-primary h-9 rounded-lg px-4 text-xs">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5"/></svg>
              New payment
            </button>
          </div>
        </div>

        {/* Filters + total */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex flex-shrink-0 items-center">
            <select value={filters.driver_id} onChange={e => { setFilters(p => ({ ...p, driver_id: e.target.value })); setPage(1) }}
              className="h-9 appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-[11px] font-semibold text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">All drivers</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-2 w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
          <div className="relative flex flex-shrink-0 items-center">
            <select value={filters.payment_type} onChange={e => { setFilters(p => ({ ...p, payment_type: e.target.value })); setPage(1) }}
              className="h-9 appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-[11px] font-semibold text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">All types</option>
              {PAYMENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-2 w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <input type="date" value={filters.date_from}
              onChange={e => { setFilters(p => ({ ...p, date_from: e.target.value })); setPage(1) }}
              className="h-9 w-28 rounded-md border border-slate-200 px-2 text-[11px] shadow-sm focus:outline-none focus:border-blue-400" />
            <span className="text-gray-300">—</span>
            <input type="date" value={filters.date_to}
              onChange={e => { setFilters(p => ({ ...p, date_to: e.target.value })); setPage(1) }}
              className="h-9 w-28 rounded-md border border-slate-200 px-2 text-[11px] shadow-sm focus:outline-none focus:border-blue-400" />
          </div>
          {(filters.driver_id || filters.payment_type || filters.date_from || filters.date_to) && (
            <button onClick={() => { setFilters({ driver_id: '', payment_type: '', date_from: '', date_to: '' }); setPage(1) }}
              className="rounded px-2 py-1 text-[10px] font-semibold text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600">Clear</button>
          )}
          <div className="flex min-w-0 flex-1 items-center justify-end">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Total</span>
              <span className="whitespace-nowrap text-xs font-bold text-blue-800">{formatCurrency(totalAmt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 11 }}>
          <colgroup>
            {PAYMENT_COLUMN_DEFS.map(c => <col key={c.key} style={{ width: c.width }} />)}
            <col style={{ width: 76 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-200 bg-slate-50/95 shadow-[0_1px_0_rgba(148,163,184,0.12)] backdrop-blur">
              {PAYMENT_COLUMN_DEFS.map(h => (
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
              <tr><td colSpan={PAYMENT_COLUMN_DEFS.length + 1} className="py-20 text-center"><div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />Loading payments...</div></td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={PAYMENT_COLUMN_DEFS.length + 1} className="py-20 text-center"><div className="mx-auto max-w-xs"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg></div><div className="text-sm font-semibold text-slate-700">No payments found</div><p className="mt-1 text-xs text-slate-400">Try adjusting your search or filters.</p></div></td></tr>
            ) : sorted.map(p => (
              <tr key={p.id} onClick={() => { setEditItem(p); setShowModal(true) }}
                className="group cursor-pointer border-l-2 border-l-transparent transition-colors odd:bg-white even:bg-slate-50/30 hover:border-l-blue-500 hover:bg-blue-50/70">
                <td className="px-1.5 py-1 font-semibold text-blue-600">#{p.payment_number || p.id}</td>
                <td className="px-1.5 py-1 text-gray-500 truncate">{formatDate(p.payment_date)}</td>
                <td className="px-1.5 py-1"><TypeBadge type={p.payment_type} /></td>
                <td className="px-1.5 py-1 font-medium text-gray-900 truncate">{p.driver_name || p.vendor_name || p.payable_to || <span className="font-normal text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-gray-500 truncate">{p.description || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(p.amount)}</td>
                <td className="px-1.5 py-1 truncate">
                  {p.settlement_number ? <span className="font-medium text-blue-600">#{p.settlement_number}</span> : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
                  <RowActionMenu
                    onEdit={() => { setEditItem(p); setShowModal(true) }}
                    onDelete={() => handleDelete(p)}
                    editLabel="Edit Payment"
                    deleteLabel="Delete Payment"
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
              <button key={pn} onClick={() => setPage(pn)} className={`w-5 h-5 rounded text-[11px] font-medium transition-colors ${pn === safePage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{pn}</button>
            ))}
            <button onClick={() => setPage(v => Math.min(totalPages, v + 1))} disabled={safePage >= totalPages} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></button>
            <button onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
          </div>
          <span className="text-[11px] text-gray-500">Showing {start}–{end} of {total} entries</span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <span className="px-1.5 text-[10px] font-medium text-slate-400">Rows</span>
          {[10, 25, 50, 100].map(n => (
            <button key={n} onClick={() => { setPageSize(n); setPage(1) }}
              className={`rounded-md px-2 py-1 text-[10px] transition ${pageSize === n ? 'bg-blue-600 font-bold text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {showModal && (
        <PaymentModal item={editItem} drivers={drivers}
          onClose={() => { setShowModal(false); setEditItem(null) }}
          onSaved={() => { setShowModal(false); setEditItem(null); load() }} />
      )}
    </div>
  )
}

function PaymentModal({ item, drivers, onClose, onSaved }: {
  item: Payment | null; drivers: Driver[]; onClose: () => void; onSaved: () => void
}) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    payment_type: item?.payment_type || 'settlement_payment',
    driver_id: item ? String(item.driver_id || '') : '',
    payment_date: item?.payment_date || today,
    amount: item ? String(item.amount) : '',
    description: item?.description || '',
    payable_to: item?.payable_to || '',
  })
  const [saving, setSaving] = useState(false)
  const sf = (k: keyof typeof form, v: string) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Amount must be > 0'); return }
    if (!form.payment_date) { toast.error('Date required'); return }
    const payload = {
      payment_type: form.payment_type,
      driver_id: form.driver_id ? parseInt(form.driver_id) : undefined,
      payment_date: form.payment_date,
      amount: parseFloat(form.amount),
      description: form.description || undefined,
      payable_to: form.payable_to || undefined,
    }
    setSaving(true)
    const req = item
      ? client.put('/api/v1/payments/' + item.id, payload)
      : client.post('/api/v1/payments', payload)
    req.then(() => { toast.success(item ? 'Updated' : 'Payment created'); onSaved() })
      .catch(e => toast.error(e.response?.data?.detail || e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[480px] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{item ? `Payment #${item.payment_number || item.id}` : 'New Payment'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Type</label>
              <div className="relative">
                {/* Advances are created on the Advanced Payments page so settlements can
                    apply and track them — creating them here would make them invisible there. */}
                <select value={form.payment_type} onChange={e => sf('payment_type', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500 appearance-none">
                  {PAYMENT_TYPES.filter(t => t !== 'advanced_payment' || form.payment_type === 'advanced_payment')
                    .map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </div>
              {!item && (
                <p className="mt-1 text-[11px] text-gray-400">
                  Issuing a driver advance? Use{' '}
                  <a href="/payments/advanced" className="font-medium text-blue-600 hover:underline">Advanced Payments</a>
                  {' '}so it can be applied to settlements.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.payment_date} onChange={e => sf('payment_date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Driver</label>
              <div className="relative">
                <select value={form.driver_id} onChange={e => sf('driver_id', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500 appearance-none">
                  <option value="">Select driver</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Amount <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">$</span>
                <input type="number" step="0.01" min="0.01" value={form.amount}
                  onChange={e => sf('amount', e.target.value)} placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payable To</label>
            <input type="text" value={form.payable_to} onChange={e => sf('payable_to', e.target.value)}
              placeholder="Name or company"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => sf('description', e.target.value)}
              rows={3} placeholder="Payment details…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm rounded-lg font-medium">Close</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1.5">
            {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Saving…' : item ? 'Save Changes' : 'Create Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
