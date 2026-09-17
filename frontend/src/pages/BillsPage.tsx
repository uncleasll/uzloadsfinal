import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Pencil, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { monthKey, monthLabel, officeApi, shiftMonth, type Bill, type BillInput, type BillsMonth } from '@/api/office'
import { trucksApi } from '@/api/entities'
import type { Truck } from '@/types'
import { formatCurrency } from '@/utils'

const field = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
const label = 'mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400'

/** The Excel "Dues" sheets: fixed monthly bills, what is due on which day, and what has been paid. */
export default function BillsPage() {
  const [params, setParams] = useSearchParams()
  const month = params.get('month') || monthKey(new Date())
  const [data, setData] = useState<BillsMonth | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Bill | 'new' | null>(null)
  const today = new Date()
  const isCurrentMonth = month === monthKey(today)

  const load = useCallback(async () => {
    setLoading(true)
    try { setData(await officeApi.billsMonth(month)) }
    catch (e) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }, [month])
  useEffect(() => { load() }, [load])

  const toggle = async (b: Bill) => {
    try {
      if (b.paid) await officeApi.unpayBill(b.id, month)
      else await officeApi.payBill(b.id, month)
      load()
    } catch (e) { toast.error((e as Error).message) }
  }

  const t = data?.totals
  const status = (b: Bill) => {
    if (b.paid) return 'paid'
    if (isCurrentMonth && b.due_day < today.getDate()) return 'overdue'
    if (isCurrentMonth && b.due_day - today.getDate() <= 3) return 'soon'
    return 'open'
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 px-4 py-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Monthly bills</h1>
              {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />}
            </div>
            <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">Truck leases, rent, software and insurance, by due day</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-200 bg-white shadow-sm">
              <button onClick={() => setParams({ month: shiftMonth(month, -1) })} className="grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-50" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
              <div className="border-x border-slate-200 px-3 text-xs font-semibold text-slate-800">{monthLabel(month)}</div>
              <button onClick={() => setParams({ month: shiftMonth(month, 1) })} className="grid h-9 w-9 place-items-center text-slate-500 hover:bg-slate-50" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <button onClick={() => setParams({ month: monthKey(new Date()) })} className="btn-secondary h-9 rounded-lg px-3 text-xs">This month</button>
            <button onClick={() => setEditing('new')} className="btn-primary h-9 rounded-lg px-4 text-xs"><Plus className="h-4 w-4" />New bill</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {[['Bills', `${t?.paid_count ?? 0} of ${t?.count ?? 0} paid`, ''], ['Due this month', formatCurrency(t?.due ?? 0), ''], ['Paid', formatCurrency(t?.paid ?? 0), 'text-emerald-700'], ['Remaining', formatCurrency(t?.remaining ?? 0), (t?.remaining ?? 0) > 0 ? 'text-amber-700' : 'text-slate-950']].map(([l, v, c]) => (
            <div key={l} className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{l}</div>
              <div className={`mt-0.5 text-sm font-bold tabular-nums ${c || 'text-slate-950'}`}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
              <th className="w-10 px-3 py-2 text-left">Paid</th>
              <th className="px-3 py-2 text-left">Due</th>
              <th className="px-3 py-2 text-left">Bill</th>
              <th className="px-3 py-2 text-left">Vendor</th>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-left">Truck</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {(data?.rows || []).map(b => {
              const st = status(b)
              return (
                <tr key={b.id} className={`hover:bg-blue-50/40 ${st === 'paid' ? 'text-slate-400' : ''}`}>
                  <td className="px-3 py-2">
                    <button onClick={() => toggle(b)} aria-pressed={b.paid} aria-label={b.paid ? 'Mark unpaid' : 'Mark paid'}
                      className={`grid h-6 w-6 place-items-center rounded-md border transition ${b.paid ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-blue-400'}`}>
                      <Check className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex min-w-[2.5rem] justify-center rounded-md px-1.5 py-0.5 font-bold ${st === 'overdue' ? 'bg-red-50 text-red-700' : st === 'soon' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{b.due_day}</span>
                  </td>
                  <td className={`px-3 py-2 font-semibold ${st === 'paid' ? 'line-through' : 'text-slate-900'}`}>{b.label}</td>
                  <td className="px-3 py-2">{b.vendor || '—'}</td>
                  <td className="px-3 py-2">{b.account || '—'}</td>
                  <td className="px-3 py-2">{b.truck_unit || '—'}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${st === 'paid' ? '' : 'text-slate-900'}`}>{formatCurrency(b.paid ? (b.paid_amount ?? b.amount) : b.amount)}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => setEditing(b)} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]"><Pencil className="h-3 w-3" />Edit</button></td>
                </tr>
              )
            })}
            {data && data.rows.length === 0 && <tr><td colSpan={8} className="py-16 text-center text-slate-400">No bills yet. Add the monthly ones once; every month starts unpaid.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <BillModal bill={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function BillModal({ bill, onClose, onSaved }: { bill: Bill | null; onClose: () => void; onSaved: () => void }) {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [f, setF] = useState<BillInput>({ label: bill?.label || '', vendor: bill?.vendor || '', amount: bill?.amount || 0, due_day: bill?.due_day || 1, account: bill?.account || '', truck_id: bill?.truck_id || null, notes: bill?.notes || '' })
  const [saving, setSaving] = useState(false)
  useEffect(() => { trucksApi.list(true).then(setTrucks).catch(() => {}) }, [])
  const save = async () => {
    if (!f.label.trim() || !(f.amount > 0)) { toast.error('Give the bill a name and an amount'); return }
    setSaving(true)
    try {
      const data = { ...f, vendor: f.vendor || null, account: f.account || null, notes: f.notes || null, truck_id: f.truck_id || null }
      if (bill) await officeApi.updateBill(bill.id, data); else await officeApi.createBill(data)
      toast.success('Bill saved'); onSaved()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }
  const archive = async () => {
    if (!bill || !confirm('Archive this bill? Past payments stay on record.')) return
    try { await officeApi.archiveBill(bill.id); onSaved() } catch (e) { toast.error((e as Error).message) }
  }
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-container max-w-lg">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-bold text-slate-950">{bill ? 'Edit bill' : 'New monthly bill'}</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={label}>Bill</label><input value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="Office rent and parking" className={field} /></div>
          <div><label className={label}>Vendor</label><input value={f.vendor || ''} onChange={e => setF({ ...f, vendor: e.target.value })} placeholder="Zeke" className={field} /></div>
          <div><label className={label}>Paid from account</label><input value={f.account || ''} onChange={e => setF({ ...f, account: e.target.value })} placeholder="AFS" className={field} /></div>
          <div><label className={label}>Amount</label><input value={f.amount || ''} onChange={e => setF({ ...f, amount: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} inputMode="decimal" className={`${field} text-right`} /></div>
          <div><label className={label}>Due day of month</label><input value={f.due_day} onChange={e => setF({ ...f, due_day: Math.min(31, Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1)) })} inputMode="numeric" className={`${field} text-right`} /></div>
          <div><label className={label}>Truck (optional)</label>
            <select value={f.truck_id || ''} onChange={e => setF({ ...f, truck_id: e.target.value ? Number(e.target.value) : null })} className={field}><option value="">Not tied to a truck</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}</select></div>
          <div><label className={label}>Notes</label><input value={f.notes || ''} onChange={e => setF({ ...f, notes: e.target.value })} className={field} /></div>
        </div>
        <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <div>{bill && <button onClick={archive} className="btn-ghost h-9 rounded-lg px-3 text-xs text-red-600 hover:bg-red-50 hover:text-red-700">Archive</button>}</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary h-9 rounded-lg px-3 text-xs">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary h-9 rounded-lg px-4 text-xs">{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </footer>
      </div>
    </div>
  )
}
