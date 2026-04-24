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
    if (!confirm('Delete this expense?')) return
    client.delete('/api/v1/expenses/' + id)
      .then(() => { toast.success('Deleted'); load() })
      .catch(e => toast.error(e.message))
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Expenses</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded">
            + New Expense
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-end gap-3 flex-shrink-0">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
          <select value={filters.category} onChange={e=>setFilters(p=>({...p,category:e.target.value}))}
            className="border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-green-500 w-40">
            <option value="">All</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
          <input type="date" value={filters.date_from} onChange={e=>setFilters(p=>({...p,date_from:e.target.value}))}
            className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-green-500"/>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
          <input type="date" value={filters.date_to} onChange={e=>setFilters(p=>({...p,date_to:e.target.value}))}
            className="border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-green-500"/>
        </div>
        <div className="flex-1"/>
        <div className="text-right">
          <div className="text-xs text-gray-500">Total</div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(totalAmount)}</div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
            <tr>
              {['DATE','CATEGORY','VENDOR','DRIVER','TRUCK','DESCRIPTION','AMOUNT',''].map((h,i)=>(
                <th key={i} className={'px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide '+(h==='AMOUNT'?'text-right':'')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="py-16 text-center text-gray-400">Loading…</td></tr>
            ) : expenses.length===0 ? (
              <tr><td colSpan={8} className="py-16 text-center text-gray-400">No expenses found</td></tr>
            ) : expenses.map(e => (
              <tr key={e.id} onClick={()=>setEditId(e.id)} className="cursor-pointer hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-600 text-xs">{formatDate(e.expense_date)}</td>
                <td className="px-4 py-2.5 text-gray-900 font-medium">{e.category}</td>
                <td className="px-4 py-2.5 text-gray-600">{e.vendor?.name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{e.driver?.name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{e.truck?.unit_number || '—'}</td>
                <td className="px-4 py-2.5 text-gray-500 truncate max-w-[260px]">{e.description || '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(e.amount)}</td>
                <td className="px-4 py-2.5" onClick={ev=>ev.stopPropagation()}>
                  <button onClick={()=>handleDelete(e.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Category <span className="text-red-500">*</span></label>
              <select value={form.category} onChange={e=>sf('category',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500">
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Amount <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input type="number" step="0.01" value={form.amount} onChange={e=>sf('amount',e.target.value)}
                className="w-full border border-gray-300 rounded pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Vendor</label>
              <select value={form.vendor_id} onChange={e=>sf('vendor_id',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500">
                <option value=""></option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Driver</label>
              <select value={form.driver_id} onChange={e=>sf('driver_id',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500">
                <option value=""></option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Truck</label>
              <select value={form.truck_id} onChange={e=>sf('truck_id',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500">
                <option value=""></option>
                {trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Description</label>
            <textarea value={form.description} onChange={e=>sf('description',e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-green-500"/>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm rounded font-medium">Close</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded font-semibold disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
