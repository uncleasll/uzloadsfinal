import { useState, useEffect, useCallback } from 'react'
import client from '@/api/client'
import { vendorsApi } from '@/api/vendors'
import { trucksApi, driversApi } from '@/api/entities'
import type { Driver, Truck } from '@/types'
import { formatCurrency, formatDate } from '@/utils'
import toast from 'react-hot-toast'

interface Vendor { id: number; name: string }

interface Expense {
  id: number
  expense_date: string
  category: string
  amount: number
  description?: string
  vendor_id?: number
  vendor?: { id: number; name: string }
  truck_id?: number
  truck?: { id: number; unit_number: string }
  driver_id?: number
  driver?: { id: number; name: string }
}

const EXPENSE_COLUMN_DEFS: { key: string; label: string; sortable?: boolean; align?: 'right'; width: string }[] = [
  { key: 'date',        label: 'DATE',        sortable: true, width: '9%' },
  { key: 'category',    label: 'CATEGORY',    sortable: true, width: '14%' },
  { key: 'vendor',      label: 'VENDOR',      sortable: true, width: '14%' },
  { key: 'driver',      label: 'DRIVER',      sortable: true, width: '13%' },
  { key: 'truck',       label: 'TRUCK',       sortable: true, width: '8%' },
  { key: 'description', label: 'DESCRIPTION', width: '25%' },
  { key: 'amount',      label: 'AMOUNT',      sortable: true, align: 'right', width: '10%' },
]

function expenseSortVal(e: Expense, key: string): string | number {
  switch (key) {
    case 'date':     return e.expense_date || ''
    case 'category': return e.category || ''
    case 'vendor':   return e.vendor?.name || ''
    case 'driver':   return e.driver?.name || ''
    case 'truck':    return e.truck?.unit_number || ''
    case 'amount':   return e.amount ?? 0
    default:         return ''
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

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [loading, setLoading] = useState(true)
  const [editId, setEditId] = useState<number|null>(null)
  const [showNew, setShowNew] = useState(false)
  const [totalAmount, setTotalAmount] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const [filters, setFilters] = useState({ category:'', date_from:'', date_to:'' })

  const load = useCallback(() => {
    setLoading(true)
    const params: any = { page_size: 500 }
    if (filters.category)  params.category  = filters.category
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to)   params.date_to   = filters.date_to
    client.get('/api/v1/expenses', { params })
      .then(r => { setExpenses(r.data.items || []); setTotalAmount(r.data.total_amount || 0) })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [filters])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    client.get('/api/v1/expenses/categories').then(r => setCategories(r.data)).catch(()=>{})
    vendorsApi.list().then(data => setVendors(data.map(v => ({ id: v.id, name: v.company_name })))).catch(()=>{})
    driversApi.list().then(setDrivers).catch(()=>{})
    trucksApi.list().then(setTrucks).catch(()=>{})
  }, [])

  const handleDelete = (id: number) => {
    if (!confirm('Delete this expense?\n\nThis action cannot be undone.')) return
    client.delete('/api/v1/expenses/' + id)
      .then(() => { toast.success('Expense deleted'); load() })
      .catch(e => toast.error(e.message))
  }

  const sortBy = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const q = search.trim().toLowerCase()
  const filtered = expenses.filter(e => !q ||
    [e.category, e.vendor?.name, e.driver?.name, e.truck?.unit_number, e.description]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
  const sorted = [...filtered].sort((a, b) => {
    const va = expenseSortVal(a, sortKey), vb = expenseSortVal(b, sortKey)
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' })
    return sortDir === 'asc' ? cmp : -cmp
  })
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)
  const startEntry = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endEntry = Math.min(safePage * pageSize, sorted.length)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[11px] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">

      {/* Header */}
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="mr-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Expenses</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{filtered.length}</span>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">Track and categorize company spending</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-[220px] flex-1 sm:flex-none">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search expenses..." value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-xs text-slate-800 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-64" />
            </div>
            <button onClick={() => setShowNew(true)} className="btn-primary h-9 rounded-lg px-4 text-xs">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5"/></svg>
              New expense
            </button>
          </div>
        </div>

        {/* Filters + total */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex flex-shrink-0 items-center">
            <select value={filters.category} onChange={e=>{setFilters(p=>({...p,category:e.target.value})); setPage(1)}}
              className="h-9 appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-[11px] font-semibold text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
              <option value="">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-2 w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <input type="date" value={filters.date_from}
              onChange={e=>{setFilters(p=>({...p,date_from:e.target.value})); setPage(1)}}
              className="h-9 w-28 rounded-md border border-slate-200 px-2 text-[11px] shadow-sm focus:outline-none focus:border-blue-400" />
            <span className="text-gray-300">—</span>
            <input type="date" value={filters.date_to}
              onChange={e=>{setFilters(p=>({...p,date_to:e.target.value})); setPage(1)}}
              className="h-9 w-28 rounded-md border border-slate-200 px-2 text-[11px] shadow-sm focus:outline-none focus:border-blue-400" />
          </div>
          {(filters.category || filters.date_from || filters.date_to) && (
            <button onClick={() => { setFilters({ category:'', date_from:'', date_to:'' }); setPage(1) }}
              className="rounded px-2 py-1 text-[10px] font-semibold text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600">Clear</button>
          )}
          <div className="flex min-w-0 flex-1 items-center justify-end">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-500">Total</span>
              <span className="whitespace-nowrap text-xs font-bold text-blue-800">{formatCurrency(totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 11 }}>
          <colgroup>
            {EXPENSE_COLUMN_DEFS.map(c => <col key={c.key} style={{ width: c.width }} />)}
            <col style={{ width: 76 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-200 bg-slate-50/95 shadow-[0_1px_0_rgba(148,163,184,0.12)] backdrop-blur">
              {EXPENSE_COLUMN_DEFS.map(h => (
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
              <tr><td colSpan={EXPENSE_COLUMN_DEFS.length + 1} className="py-20 text-center"><div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />Loading expenses...</div></td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={EXPENSE_COLUMN_DEFS.length + 1} className="py-20 text-center"><div className="mx-auto max-w-xs"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg></div><div className="text-sm font-semibold text-slate-700">No expenses found</div><p className="mt-1 text-xs text-slate-400">Try adjusting your search or filters.</p></div></td></tr>
            ) : paged.map(e => (
              <tr key={e.id} onClick={()=>setEditId(e.id)}
                className="group cursor-pointer border-l-2 border-l-transparent transition-colors odd:bg-white even:bg-slate-50/30 hover:border-l-blue-500 hover:bg-blue-50/70">
                <td className="px-1.5 py-1 text-gray-500 truncate">{formatDate(e.expense_date)}</td>
                <td className="px-1.5 py-1">
                  <span className="inline-block whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">{e.category}</span>
                </td>
                <td className="px-1.5 py-1 text-gray-600 truncate">{e.vendor?.name || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-gray-600 truncate">{e.driver?.name || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 font-mono text-gray-600 truncate">{e.truck?.unit_number || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-gray-500 truncate">{e.description || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(e.amount)}</td>
                <td className="px-1 py-1" onClick={ev=>ev.stopPropagation()}>
                  <RowActionMenu
                    onEdit={() => setEditId(e.id)}
                    onDelete={() => handleDelete(e.id)}
                    editLabel="Edit Expense"
                    deleteLabel="Delete Expense"
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
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => { const s = Math.max(1, Math.min(safePage - 2, totalPages - 4)); return s + i }).map(p => (
              <button key={p} onClick={() => setPage(p)} className={`w-5 h-5 rounded text-[11px] font-medium transition-colors ${p === safePage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></button>
            <button onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
          </div>
          <span className="text-[11px] text-gray-500">Showing {startEntry}–{endEntry} of {sorted.length} entries</span>
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

      {(showNew || editId!==null) && (
        <ExpenseModal
          expenseId={editId}
          categories={categories}
          vendors={vendors}
          drivers={drivers}
          trucks={trucks}
          onClose={()=>{setShowNew(false); setEditId(null)}}
          onSaved={()=>{setShowNew(false); setEditId(null); load()}}
        />
      )}
    </div>
  )
}

// ── Expense Modal ─────────────────────────────────────────────────────────────
function ExpenseModal({ expenseId, categories, vendors, drivers, trucks, onClose, onSaved }: {
  expenseId: number|null
  categories: string[]
  vendors: Vendor[]
  drivers: Driver[]
  trucks: Truck[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    expense_date: new Date().toISOString().slice(0,10),
    category: categories[0] || 'Other',
    amount: '',
    description: '',
    vendor_id: '',
    driver_id: '',
    truck_id: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (expenseId === null) return
    client.get('/api/v1/expenses/' + expenseId)
      .then(r => {
        const e = r.data
        setForm({
          expense_date: e.expense_date || '',
          category: e.category || '',
          amount: String(e.amount || ''),
          description: e.description || '',
          vendor_id: e.vendor_id ? String(e.vendor_id) : '',
          driver_id: e.driver_id ? String(e.driver_id) : '',
          truck_id: e.truck_id ? String(e.truck_id) : '',
        })
      })
      .catch(err => toast.error(err.message))
  }, [expenseId])

  const sf = (k: keyof typeof form, v: string) => setForm(p => ({...p, [k]: v}))

  const handleSave = () => {
    if (!form.expense_date) { toast.error('Date required'); return }
    if (!form.category) { toast.error('Category required'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Amount must be > 0'); return }

    const payload = {
      expense_date: form.expense_date,
      category: form.category,
      amount: parseFloat(form.amount),
      description: form.description || undefined,
      vendor_id: form.vendor_id ? parseInt(form.vendor_id) : undefined,
      driver_id: form.driver_id ? parseInt(form.driver_id) : undefined,
      truck_id: form.truck_id ? parseInt(form.truck_id) : undefined,
    }
    setSaving(true)
    const p = expenseId === null
      ? client.post('/api/v1/expenses', payload)
      : client.put('/api/v1/expenses/' + expenseId, payload)
    p.then(() => { toast.success(expenseId ? 'Saved' : 'Created'); onSaved() })
     .catch(e => toast.error(e.message))
     .finally(() => setSaving(false))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="relative bg-white rounded-xl shadow-2xl w-[560px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">{expenseId === null ? 'New Expense' : 'Edit Expense'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.expense_date} onChange={e=>sf('expense_date',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Category <span className="text-red-500">*</span></label>
              <select value={form.category} onChange={e=>sf('category',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Amount <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input type="number" step="0.01" value={form.amount} onChange={e=>sf('amount',e.target.value)}
                className="w-full border border-gray-300 rounded pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Vendor</label>
              <select value={form.vendor_id} onChange={e=>sf('vendor_id',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500">
                <option value=""></option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Driver</label>
              <select value={form.driver_id} onChange={e=>sf('driver_id',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500">
                <option value=""></option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Truck</label>
              <select value={form.truck_id} onChange={e=>sf('truck_id',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500">
                <option value=""></option>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={e=>sf('description',e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500"/>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm rounded font-medium">Close</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
