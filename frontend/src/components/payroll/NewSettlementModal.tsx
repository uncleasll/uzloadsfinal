import { useState, useEffect, useCallback } from 'react'
import { payrollApi } from '@/api/payroll'
import type { OpenBalance } from '@/api/payroll'
import { formatCurrency, formatDate } from '@/utils'
import type { Driver } from '@/types'
import toast from 'react-hot-toast'

interface Props {
  drivers: Driver[]
  onClose: () => void
  onSaved: (newId?: number) => void
}

const IcoX     = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const IcoCheck = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>

export default function NewSettlementModal({ drivers, onClose, onSaved }: Props) {
  const [driverId, setDriverId]   = useState('')
  const [payableTo, setPayableTo] = useState('')
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [dateType, setDateType]   = useState<'pickup'|'delivery'>('pickup')
  const [balances, setBalances]   = useState<OpenBalance[]>([])
  const [loading, setLoading]     = useState(true)
  const [creating, setCreating]   = useState<number|null>(null)

  const fetchBalances = useCallback(() => {
    setLoading(true)
    const params: Parameters<typeof payrollApi.getOpenBalances>[0] = { date_type: dateType }
    if (driverId) params.driver_id = parseInt(driverId)
    if (dateFrom) params.date_from = dateFrom
    if (dateTo)   params.date_to   = dateTo
    payrollApi.getOpenBalances(params)
      .then(data => setBalances(data))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [driverId, dateFrom, dateTo, dateType])

  useEffect(() => { fetchBalances() }, [fetchBalances])

  const handleCreate = (b: OpenBalance) => {
    setCreating(b.driver_id)
    const today = new Date().toISOString().slice(0,10)
    payrollApi.create({ driver_id: b.driver_id, payable_to: b.payable_to, status: 'Preparing', date: today })
      .then(s => { toast.success('Settlement #'+s.settlement_number+' created'); onSaved(s.id) })
      .catch(e => toast.error(e.message))
      .finally(() => setCreating(null))
  }

  const updatedField = (b: any) => b.updated || b.last_load_date

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/40"/>
      <div className="w-[1000px] bg-white flex flex-col h-full shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">New Settlement</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"><IcoX/></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Info banner */}
          <div className="flex items-start gap-2.5 px-4 py-3 bg-purple-50 border border-purple-100 rounded-lg mb-6">
            <svg className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
            <p className="text-sm text-gray-600">
              Need Help? Watch our quick video tutorial on{' '}
              <a href="#" className="text-green-600 font-medium hover:underline">How to create and manage driver payroll settlements.</a>
            </p>
          </div>

          {/* Driver + Payable to */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Driver</label>
              <div className="relative">
                <select value={driverId}
                  onChange={e=>{
                    const v=e.target.value; setDriverId(v)
                    const d=drivers.find(x=>String(x.id)===v)
                    setPayableTo(d ? d.name : '')
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none">
                  <option value=""></option>
                  {drivers.map(d=><option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Payable to <span className="text-red-500">*</span></label>
              <div className="relative">
                <select value={payableTo} onChange={e=>setPayableTo(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none">
                  <option value=""></option>
                  {drivers.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
                <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </div>
            </div>
          </div>

          {/* Open Balance */}
          <div>
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <h3 className="text-base font-bold text-gray-900 flex-shrink-0">Open Balance</h3>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500 whitespace-nowrap">Date Range: From</label>
                <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500"/>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-500 whitespace-nowrap">Date Range: To</label>
                <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500"/>
              </div>
              <div className="flex flex-col gap-1">
                {[{v:'pickup',l:'by Pickup Date'},{v:'delivery',l:'by Delivery Date'}].map(o=>(
                  <label key={o.v} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="dt_new" value={o.v} checked={dateType===o.v}
                      onChange={()=>setDateType(o.v as 'pickup'|'delivery')}
                      className="accent-green-600 w-3.5 h-3.5"/>
                    <span className="text-xs text-gray-600">{o.l}</span>
                  </label>
                ))}
              </div>
              <button onClick={fetchBalances}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded flex-shrink-0">
                <IcoCheck/> Apply
              </button>
            </div>

            <div className="border border-gray-200 rounded overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-white border-b border-gray-200">
                  <tr>
                    {['DRIVER','PAYABLE TO','BALANCE','UPDATED','ACTIONS'].map(h=>(
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {h} {h!=='ACTIONS' && <span className="opacity-40">⇅</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    <tr><td colSpan={5} className="py-10 text-center text-gray-400 text-sm">Loading open balances…</td></tr>
                  ) : balances.length===0 ? (
                    <tr><td colSpan={5} className="py-10 text-center text-gray-400 text-sm">
                      No open balances found{driverId?' for this driver':''}
                    </td></tr>
                  ) : balances.map(b=>(
                    <tr key={b.driver_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{b.driver_name} [{b.driver_type}]</td>
                      <td className="px-4 py-3 text-gray-600">{b.payable_to}</td>
                      <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(b.balance)}</td>
                      <td className="px-4 py-3 text-gray-500">{updatedField(b) ? formatDate(updatedField(b)) : '—'}</td>
                      <td className="px-4 py-3">
                        <button disabled={creating===b.driver_id} onClick={()=>handleCreate(b)}
                          className="text-green-600 font-medium text-sm hover:underline disabled:opacity-50">
                          {creating===b.driver_id ? 'Creating…' : 'Create Settlement'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded hover:bg-gray-900">
            <IcoX/> Close
          </button>
          <button disabled className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-400 text-white text-sm font-medium rounded opacity-50 cursor-not-allowed">
            <IcoCheck/> Save
          </button>
        </div>
      </div>
    </div>
  )
}
