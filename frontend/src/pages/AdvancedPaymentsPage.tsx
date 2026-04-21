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
  if (ap.is_applied) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">Applied</span>
  if (ap.applied_amount > 0) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Partial</span>
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Unapplied</span>
}

export default function AdvancedPaymentsPage() {
  const [items, setItems] = useState<AdvPay[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState<AdvPay | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [filters, setFilters] = useState({ driver_id: '', unapplied_only: false, date_from: '', date_to: '' })

  const load = useCallback(() => {
    setLoading(true)
    const p: Record<string, string | number | boolean> = { page, page_size: pageSize }
    if (filters.driver_id) p.driver_id = filters.driver_id
    if (filters.unapplied_only) p.unapplied_only = true
    if (filters.date_from) p.date_from = filters.date_from
    if (filters.date_to) p.date_to = filters.date_to
    client.get('/api/v1/advanced-payments', { params: p })
      .then(r => { setItems(r.data.items || []); setTotal(r.data.total || 0); setTotalPages(r.data.total_pages || 1) })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [filters, page, pageSize])

  useEffect(() => { load() }, [load])
  useEffect(() => { driversApi.list().then(setDrivers).catch(() => {}) }, [])

  const handleDelete = (ap: AdvPay) => {
    if (ap.applied_amount > 0) { toast.error('Cannot delete: already applied to a settlement'); return }
    if (!confirm(`Delete advanced payment #${ap.payment_number}?`)) return
    client.delete('/api/v1/advanced-payments/' + ap.id)
      .then(() => { toast.success('Deleted'); load() })
      .catch(e => toast.error(e.response?.data?.detail || e.message))
  }

  const totalAmt = items.reduce((a, i) => a + i.amount, 0)
  const totalApp = items.reduce((a, i) => a + (i.applied_amount || 0), 0)
  const totalRem = items.reduce((a, i) => a + i.remaining, 0)
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Advanced Payments</h1>
          <p className="text-xs text-gray-500 mt-0.5">Pre-settlement payments (com-checks, fuel advances) applied to driver settlements</p>
        </div>
        <button onClick={() => { setEditItem(null); setShowModal(true) }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          New Advanced Payment
        </button>
      </div>

      {/* Summary */}
      <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-8 flex-shrink-0">
        {[
          { l: 'Total Issued', v: formatCurrency(totalAmt), c: 'text-gray-900' },
          { l: 'Total Applied', v: formatCurrency(totalApp), c: 'text-green-700' },
          { l: 'Outstanding', v: formatCurrency(totalRem), c: totalRem > 0 ? 'text-amber-700' : 'text-gray-400' },
        ].map((s, i) => (
          <div key={i} className="flex items-center gap-6">
            {i > 0 && <div className="w-px h-7 bg-gray-200" />}
            <div><div className="text-xs text-gray-500 font-medium">{s.l}</div><div className={`text-base font-bold ${s.c}`}>{s.v}</div></div>
          </div>
        ))}
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
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer pb-1.5">
          <input type="checkbox" checked={filters.unapplied_only}
            onChange={e => { setFilters(p => ({ ...p, unapplied_only: e.target.checked })); setPage(1) }}
            className="accent-green-600 w-3.5 h-3.5" />
          Unapplied only
        </label>
        {(filters.driver_id || filters.date_from || filters.date_to || filters.unapplied_only) && (
          <button onClick={() => { setFilters({ driver_id: '', unapplied_only: false, date_from: '', date_to: '' }); setPage(1) }}
            className="text-xs text-gray-500 hover:text-red-500 pb-1.5 underline">Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
            <tr>
              {[['#','6%'],['Date','9%'],['Driver','18%'],['Category','11%'],['Description','22%'],
                ['Amount','9%','r'],['Applied','9%','r'],['Remaining','9%','r'],['Status','11%'],['','4%']
              ].map(([h,w,r]) => (
                <th key={h} style={{ width: w }}
                  className={`px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide ${r ? 'text-right' : 'text-left'}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="py-16 text-center text-gray-400">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                  Loading…
                </div>
              </td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={10} className="py-16 text-center">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                  <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  <span>No advanced payments found</span>
                  <button onClick={() => setShowModal(true)} className="text-green-600 text-sm hover:underline font-medium">+ Create one</button>
                </div>
              </td></tr>
            ) : items.map(ap => (
              <tr key={ap.id} onClick={() => { setEditItem(ap); setShowModal(true) }}
                className="cursor-pointer hover:bg-gray-50 transition-colors group">
                <td className="px-3 py-2.5 text-blue-600 font-semibold text-xs">#{ap.payment_number}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{formatDate(ap.payment_date)}</td>
                <td className="px-3 py-2.5 font-medium text-gray-900 truncate max-w-[180px]">{ap.driver_name || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs">{ap.category || '—'}</td>
                <td className="px-3 py-2.5 text-gray-600 text-xs truncate max-w-[240px]">{ap.description || '—'}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(ap.amount)}</td>
                <td className="px-3 py-2.5 text-right text-green-700 font-medium text-xs">
                  {ap.applied_amount > 0 ? formatCurrency(ap.applied_amount) : '—'}
                </td>
                <td className={`px-3 py-2.5 text-right font-semibold text-xs ${ap.remaining > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                  {formatCurrency(ap.remaining)}
                </td>
                <td className="px-3 py-2.5"><Badge ap={ap} /></td>
                <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                  {!ap.is_applied && ap.applied_amount === 0 && (
                    <button onClick={() => handleDelete(ap)}
                      className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 rounded">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-gray-200 flex-shrink-0 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          {[1, '‹', '›', totalPages].map((p, i) => {
            if (i === 0) return <button key="first" onClick={() => setPage(1)} disabled={page <= 1} className="w-7 h-7 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30">«</button>
            if (p === '‹') return <button key="prev" onClick={() => setPage(q => Math.max(1, q - 1))} disabled={page <= 1} className="w-7 h-7 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30">‹</button>
            if (p === '›') return <button key="next" onClick={() => setPage(q => Math.min(totalPages, q + 1))} disabled={page >= totalPages} className="w-7 h-7 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30">›</button>
            return <button key="last" onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="w-7 h-7 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30">»</button>
          })}
          <span className="ml-2">Showing {start}–{end} of {total}</span>
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
      <div className="relative bg-white rounded-xl shadow-2xl w-[500px] flex flex-col overflow-hidden">
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
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none disabled:bg-gray-50 disabled:text-gray-400">
                  <option value="">Select driver</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date <span className="text-red-500">*</span></label>
              <input type="date" value={form.payment_date} onChange={e => sf('payment_date', e.target.value)} disabled={!canEdit}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500 disabled:bg-gray-50" />
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
                  className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-green-500 disabled:bg-gray-50" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Category</label>
              <div className="relative">
                <select value={form.category} onChange={e => sf('category', e.target.value)} disabled={!canEdit}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none disabled:bg-gray-50">
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-green-500 disabled:bg-gray-50" />
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
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1.5">
              {saving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {saving ? 'Saving…' : item ? 'Save Changes' : 'Create Payment'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
