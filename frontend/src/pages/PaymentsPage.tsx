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
    type === 'settlement_payment' ? 'bg-green-100 text-green-700' :
    'bg-gray-100 text-gray-600'
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>{TYPE_LABELS[type] || type}</span>
}

export default function PaymentsPage() {
  const [items, setItems] = useState<Payment[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<Payment | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState({ driver_id: '', payment_type: '', date_from: '', date_to: '' })

  const load = useCallback(() => {
    setLoading(true)
    const p: Record<string, string | number> = { page, page_size: pageSize }
    if (filters.driver_id) p.driver_id = filters.driver_id
    if (filters.payment_type) p.payment_type = filters.payment_type
    if (filters.date_from) p.date_from = filters.date_from
    if (filters.date_to) p.date_to = filters.date_to
    client.get('/api/v1/payments', { params: p })
      .then(r => {
        const d = r.data
        setItems(Array.isArray(d) ? d : (d.items || []))
        setTotal(d.total || (Array.isArray(d) ? d.length : 0))
        setTotalPages(d.total_pages || 1)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [filters, page, pageSize])

  useEffect(() => { load() }, [load])
  useEffect(() => { driversApi.list().then(setDrivers).catch(() => {}) }, [])

  const handleDelete = (p: Payment) => {
    if (!confirm(`Delete payment #${p.payment_number || p.id}?`)) return
    client.delete('/api/v1/payments/' + p.id)
      .then(() => { toast.success('Deleted'); load() })
      .catch(e => toast.error(e.response?.data?.detail || e.message))
  }

  const totalAmt = items.reduce((a, i) => a + i.amount, 0)
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Payments</h1>
          <p className="text-xs text-gray-500 mt-0.5">All payment records — settlement payments and other transactions</p>
        </div>
        <button onClick={() => { setEditItem(null); setShowModal(true) }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          New Payment
        </button>
      </div>

      {/* Summary */}
      <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-6 flex-shrink-0">
        <div><div className="text-xs text-gray-500 font-medium">Total Payments ({items.length})</div><div className="text-base font-bold text-gray-900">{formatCurrency(totalAmt)}</div></div>
      </div>

      {/* Filters */}
      <div className="px-5 py-2 border-b border-gray-200 flex items-end gap-3 flex-wrap flex-shrink-0">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Driver</label>
          <select value={filters.driver_id} onChange={e => { setFilters(p => ({ ...p, driver_id: e.target.value })); setPage(1) }}
            className="border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-green-500 w-44">
            <option value="">All drivers</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
          <select value={filters.payment_type} onChange={e => { setFilters(p => ({ ...p, payment_type: e.target.value })); setPage(1) }}
            className="border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-green-500 w-44">
            <option value="">All types</option>
            {PAYMENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input type="date" value={filters.date_from}
            onChange={e => { setFilters(p => ({ ...p, date_from: e.target.value })); setPage(1) }}
            className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-green-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input type="date" value={filters.date_to}
            onChange={e => { setFilters(p => ({ ...p, date_to: e.target.value })); setPage(1) }}
            className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-green-500" />
        </div>
        {(filters.driver_id || filters.payment_type || filters.date_from || filters.date_to) && (
          <button onClick={() => { setFilters({ driver_id: '', payment_type: '', date_from: '', date_to: '' }); setPage(1) }}
            className="text-xs text-gray-500 hover:text-red-500 pb-1.5 underline">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
            <tr>
              {[['#','6%'],['Date','9%'],['Type','14%'],['Driver / Payee','18%'],['Description','25%'],['Amount','9%','r'],['Settlement','13%'],['','5%']].map(([h, w, r]) => (
                <th key={h} style={{ width: w }}
                  className={`px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide ${r ? 'text-right' : 'text-left'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="py-16 text-center text-gray-400">Loading…</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={8} className="py-16 text-center text-gray-400">No payments found</td></tr>
            ) : items.map(p => (
              <tr key={p.id} onClick={() => { setEditItem(p); setShowModal(true) }}
                className="cursor-pointer hover:bg-gray-50 transition-colors group">
                <td className="px-3 py-2.5 text-blue-600 font-semibold text-xs">#{p.payment_number || p.id}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{formatDate(p.payment_date)}</td>
                <td className="px-3 py-2.5"><TypeBadge type={p.payment_type} /></td>
                <td className="px-3 py-2.5 font-medium text-gray-900 truncate">{p.driver_name || p.vendor_name || p.payable_to || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs truncate max-w-[240px]">{p.description || '—'}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(p.amount)}</td>
                <td className="px-3 py-2.5 text-xs text-gray-500">
                  {p.settlement_number ? <span className="text-blue-600 font-medium">#{p.settlement_number}</span> : '—'}
                </td>
                <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleDelete(p)}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 rounded">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-gray-200 flex-shrink-0 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <button onClick={() => setPage(1)} disabled={page <= 1} className="w-7 h-7 rounded hover:bg-gray-100 disabled:opacity-30">«</button>
          <button onClick={() => setPage(q => Math.max(1, q - 1))} disabled={page <= 1} className="w-7 h-7 rounded hover:bg-gray-100 disabled:opacity-30">‹</button>
          <button onClick={() => setPage(q => Math.min(totalPages, q + 1))} disabled={page >= totalPages} className="w-7 h-7 rounded hover:bg-gray-100 disabled:opacity-30">›</button>
          <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="w-7 h-7 rounded hover:bg-gray-100 disabled:opacity-30">»</button>
          <span className="ml-2">Showing {start}–{end} of {total}</span>
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
                <select value={form.payment_type} onChange={e => sf('payment_type', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none">
                  {PAYMENT_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.payment_date} onChange={e => sf('payment_date', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Driver</label>
              <div className="relative">
                <select value={form.driver_id} onChange={e => sf('driver_id', e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none">
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
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-green-500" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Payable To</label>
            <input type="text" value={form.payable_to} onChange={e => sf('payable_to', e.target.value)}
              placeholder="Name or company"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description</label>
            <textarea value={form.description} onChange={e => sf('description', e.target.value)}
              rows={3} placeholder="Payment details…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-green-500" />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm rounded-lg font-medium">Close</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1.5">
            {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Saving…' : item ? 'Save Changes' : 'Create Payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
