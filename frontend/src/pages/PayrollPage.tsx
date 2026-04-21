import { useState, useEffect, useCallback, useRef } from 'react'
import { payrollApi } from '@/api/payroll'
import type { Settlement } from '@/api/payroll'
import { driversApi } from '@/api/entities'
import { formatCurrency, formatDate } from '@/utils'
import type { Driver } from '@/types'
import SettlementModal from '@/components/payroll/SettlementModal'
import NewSettlementModal from '@/components/payroll/NewSettlementModal'
import toast from 'react-hot-toast'

const PAGE_SIZES = [10, 25, 50, 100]
const STATUSES   = ['Preparing', 'Ready', 'Sent', 'Paid', 'Void']
const STATUS_LABEL: Record<string,string> = {
  Ready:'Ready for payment', Preparing:'Preparing', Paid:'Paid', Sent:'Sent', Void:'Void'
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'Ready') return (
    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-bold bg-amber-500 text-white">
      Ready for payment
    </span>
  )
  const cls = status==='Paid'      ? 'border border-gray-300 text-gray-600' :
              status==='Preparing' ? 'border border-gray-300 text-gray-600' :
              status==='Sent'      ? 'border border-blue-300 text-blue-600' :
              status==='Void'      ? 'border border-red-300 text-red-600'   :
                                     'border border-gray-300 text-gray-600'
  return <span className={'inline-flex items-center px-2.5 py-1 rounded text-xs font-semibold bg-white '+cls}>{STATUS_LABEL[status]||status}</span>
}

function PBtn({onClick,disabled,children}:{onClick:()=>void;disabled:boolean;children:React.ReactNode}) {
  return <button onClick={onClick} disabled={disabled} className="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">{children}</button>
}

export default function PayrollPage() {
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [drivers, setDrivers]         = useState<Driver[]>([])
  const [loading, setLoading]         = useState(true)
  const [selected, setSelected]       = useState<number[]>([])
  const [showFilter, setShowFilter]   = useState(false)
  const [showNew, setShowNew]         = useState(false)
  const [editId, setEditId]           = useState<number|null>(null)
  const [fromNew, setFromNew]         = useState(false)
  const [page, setPage]               = useState(1)
  const [pageSize, setPageSize]       = useState(50)
  const [total, setTotal]             = useState(0)
  const [totalPages, setTotalPages]   = useState(1)
  const [search, setSearch]           = useState('')
  const [batchOpen, setBatchOpen]     = useState(false)
  const batchRef = useRef<HTMLDivElement>(null)

  const [filters, setFilters] = useState({ status:'', driver_id:'', date_from:'', date_to:'', payable_to:'' })
  const [applied, setApplied] = useState(filters)

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string,string|number> = { page, page_size: pageSize }
    if (applied.status)    params.status    = applied.status
    if (applied.driver_id) params.driver_id = applied.driver_id
    if (applied.date_from) params.date_from = applied.date_from
    if (applied.date_to)   params.date_to   = applied.date_to
    if (applied.payable_to) params.payable_to = applied.payable_to
    payrollApi.list(params)
      .then(data => {
        let items: Settlement[] = data.items || data
        if (search) {
          const q = search.toLowerCase()
          items = items.filter(s =>
            String(s.settlement_number).includes(q) ||
            s.payable_to?.toLowerCase().includes(q) ||
            s.driver?.name?.toLowerCase().includes(q)
          )
        }
        setSettlements(items)
        setTotal(data.total ?? items.length)
        setTotalPages(data.total_pages ?? Math.max(1, Math.ceil((data.total ?? items.length) / pageSize)))
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [applied, page, pageSize, search])

  useEffect(() => { load() }, [load])
  useEffect(() => { driversApi.list().then(setDrivers).catch(()=>{}) }, [])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (batchRef.current && !batchRef.current.contains(e.target as Node)) setBatchOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const start = total===0 ? 0 : (page-1)*pageSize+1
  const end   = Math.min(page*pageSize, total)

  const toggleOne = (id: number) => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s,id])
  const toggleAll = () => setSelected(s => s.length===settlements.length && settlements.length>0 ? [] : settlements.map(x=>x.id))

  const selItems   = settlements.filter(s => selected.includes(s.id))
  const selTotal   = selItems.reduce((a,s) => a+s.settlement_total, 0)
  const selBalance = selItems.reduce((a,s) => a+s.balance_due, 0)

  const sf = (k: keyof typeof filters, v: string) => setFilters(p=>({...p,[k]:v}))
  const handleApply = () => { setApplied(filters); setPage(1); setShowFilter(false) }
  const handleClear = () => {
    const b = {status:'',driver_id:'',date_from:'',date_to:'',payable_to:''}
    setFilters(b); setApplied(b); setPage(1)
  }

  const handleDelete = (id: number, num: number) => {
    if (!confirm('Delete settlement #'+num+'?')) return
    payrollApi.delete(id).then(()=>{ toast.success('Deleted'); load() }).catch(e=>toast.error(e.message))
  }

  const handleBatch = (action: string) => {
    setBatchOpen(false)
    if (!selected.length) return
    if (action === 'Export to QuickBooks') {
      Promise.all(selected.map(id => payrollApi.exportQB(id).catch(()=>{})))
        .then(() => { toast.success('Exported '+selected.length+' settlement(s)'); load() })
    } else {
      toast(action+' — coming soon', { icon: 'ℹ️' })
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Driver Payroll</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            </span>
            <input type="text" placeholder="Search" value={search}
              onChange={e=>{setSearch(e.target.value);setPage(1)}}
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-green-500 w-48"/>
          </div>
          <button onClick={()=>setShowFilter(v=>!v)}
            className={'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded font-medium transition-colors '+(showFilter?'border-green-500 text-green-600 bg-green-50':'border-gray-300 text-gray-600 hover:bg-gray-50')}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 10h10M11 16h2"/></svg>
            Extended Filter
          </button>
          <button onClick={()=>setShowNew(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            New
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilter && (
        <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="grid grid-cols-4 gap-3 mb-3">
            {[
              {l:'Status', el:<select value={filters.status} onChange={e=>sf('status',e.target.value)} className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-green-500"><option value=""></option>{STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]||s}</option>)}</select>},
              {l:'Driver', el:<select value={filters.driver_id} onChange={e=>sf('driver_id',e.target.value)} className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:border-green-500"><option value=""></option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}</select>},
              {l:'Date From', el:<input type="date" value={filters.date_from} onChange={e=>sf('date_from',e.target.value)} className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-green-500"/>},
              {l:'Date To',   el:<input type="date" value={filters.date_to}   onChange={e=>sf('date_to',e.target.value)}   className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-green-500"/>},
            ].map(({l,el})=>(
              <div key={l}><label className="block text-xs font-medium text-gray-600 mb-1">{l}</label>{el}</div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handleApply} className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg> Apply
            </button>
            <button onClick={handleClear} className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium rounded">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> Clear All
            </button>
          </div>
        </div>
      )}

      {/* Batch bar */}
      <div className="flex items-center gap-3 px-5 py-1.5 border-b border-gray-100 flex-shrink-0 min-h-[36px]">
        <div className="relative" ref={batchRef}>
          <button onClick={()=>selected.length>0 && setBatchOpen(v=>!v)}
            className={'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors '+(selected.length>0?'bg-green-600 hover:bg-green-700 text-white':'bg-gray-100 text-gray-400 cursor-not-allowed')}>
            Batch actions
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </button>
          {batchOpen && selected.length>0 && (
            <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-30 py-1 w-52">
              {['Email settlements','Change status','Export to QuickBooks','Download attachments','Download Excel'].map(a=>(
                <button key={a} onClick={()=>handleBatch(a)} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{a}</button>
              ))}
            </div>
          )}
        </div>
        {selected.length>0 && <span className="text-xs text-gray-500">{selected.length} selected</span>}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm" style={{tableLayout:'fixed',minWidth:960}}>
          <colgroup>
            <col style={{width:36}}/><col style={{width:'7%'}}/><col style={{width:'8%'}}/>
            <col style={{width:'14%'}}/><col style={{width:'18%'}}/><col style={{width:'11%'}}/>
            <col style={{width:'10%'}}/><col style={{width:'6%'}}/><col style={{width:'5%'}}/>
            <col style={{width:'13%'}}/><col style={{width:'6%'}}/><col style={{width:'6%'}}/>
          </colgroup>
          <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
            <tr>
              <th className="px-3 py-2.5 text-center">
                <input type="checkbox" className="w-3.5 h-3.5 rounded accent-green-600"
                  checked={selected.length===settlements.length && settlements.length>0} onChange={toggleAll}/>
              </th>
              {[['NUMBER',''],['DATE',''],['PAYABLE TO',''],['DRIVER',''],
                ['SETTLEMENT TOTAL','text-right'],['BALANCE DUE','text-right'],
                ['QB STATUS','text-center'],['EMAIL','text-center'],['STATUS',''],['NOTES',''],['','']
              ].map(([h,cls],i)=>(
                <th key={i} className={'px-2 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide '+cls}>
                  {h}{h && <span className="ml-0.5 opacity-30 text-[10px]">⇅</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={12} className="py-16 text-center text-gray-400">Loading...</td></tr>
            ) : settlements.length===0 ? (
              <tr><td colSpan={12} className="py-16 text-center text-gray-400">No settlements found</td></tr>
            ) : settlements.map(s => {
              const isSel = selected.includes(s.id)
              return (
                <tr key={s.id} onClick={()=>setEditId(s.id)}
                  className={'cursor-pointer transition-colors '+(isSel?'bg-green-50':'hover:bg-gray-50')}>
                  <td className="px-3 py-2.5 text-center" onClick={e=>e.stopPropagation()}>
                    <input type="checkbox" className="w-3.5 h-3.5 rounded accent-green-600" checked={isSel} onChange={()=>toggleOne(s.id)}/>
                  </td>
                  <td className="px-2 py-2.5">
                    <button onClick={e=>{e.stopPropagation();setEditId(s.id)}} className="text-blue-600 hover:underline font-semibold">
                      {s.settlement_number}
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-gray-600 text-xs">{formatDate(s.date)}</td>
                  <td className="px-2 py-2.5 font-medium text-gray-900 truncate text-sm">{s.payable_to}</td>
                  <td className="px-2 py-2.5 text-gray-600 truncate text-xs">
                    {s.driver ? s.driver.name+' ['+s.driver.driver_type+']' : '—'}
                  </td>
                  <td className="px-2 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(s.settlement_total)}</td>
                  <td className={'px-2 py-2.5 text-right font-semibold '+(s.balance_due<0?'text-red-600':'text-gray-900')}>{formatCurrency(s.balance_due)}</td>
                  <td className="px-2 py-2.5 text-center">
                    <div className={'w-4 h-4 rounded-full border-2 mx-auto '+(s.qb_exported?'border-green-500 bg-green-500':'border-gray-300')}/>
                  </td>
                  <td className="px-2 py-2.5 text-center text-gray-400 text-xs">—</td>
                  <td className="px-2 py-2.5"><StatusBadge status={s.status}/></td>
                  <td className="px-2 py-2.5 text-gray-400 text-xs truncate">{s.notes||'—'}</td>
                  <td className="px-2 py-2.5" onClick={e=>e.stopPropagation()}>
                    <RowActions onEdit={()=>setEditId(s.id)} onDelete={()=>handleDelete(s.id,s.settlement_number)}/>
                  </td>
                </tr>
              )
            })}
            {selected.length>0 && (
              <tr className="bg-blue-50 border-t-2 border-blue-200">
                <td colSpan={5} className="px-3 py-2 text-sm font-semibold text-blue-700">Total ({selected.length}):</td>
                <td className="px-2 py-2 text-right font-bold text-blue-700">{formatCurrency(selTotal)}</td>
                <td className="px-2 py-2 text-right font-bold text-blue-700">{formatCurrency(selBalance)}</td>
                <td colSpan={5}/>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-2 border-t border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5">
            <PBtn onClick={()=>setPage(1)} disabled={page<=1}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></PBtn>
            <PBtn onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page<=1}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></PBtn>
            {Array.from({length:Math.min(totalPages,5)},(_,i)=>{const s=Math.max(1,Math.min(page-2,totalPages-4));return s+i}).map(p=>(
              <button key={p} onClick={()=>setPage(p)} className={'w-7 h-7 text-xs rounded font-medium '+(p===page?'bg-green-600 text-white':'text-gray-600 hover:bg-gray-100')}>{p}</button>
            ))}
            <PBtn onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page>=totalPages}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></PBtn>
            <PBtn onClick={()=>setPage(totalPages)} disabled={page>=totalPages}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></PBtn>
          </div>
          <span className="text-xs text-gray-500">Showing {start} to {end} of {total} entries</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Show records</span>
          {PAGE_SIZES.map(n=>(
            <button key={n} onClick={()=>{setPageSize(n);setPage(1)}} className={'text-xs px-1.5 py-0.5 rounded '+(pageSize===n?'text-green-600 font-bold underline':'text-gray-500 hover:text-gray-700')}>{n}</button>
          ))}
          <span className="text-xs text-gray-500">on page</span>
        </div>
      </div>

      {showNew && (
        <NewSettlementModal drivers={drivers} onClose={()=>setShowNew(false)}
          onSaved={id=>{setShowNew(false); if(id){setEditId(id);setFromNew(true)}; load()}}/>
      )}
      {editId!==null && (
        <SettlementModal settlementId={editId} drivers={drivers}
          onClose={()=>{setEditId(null);setFromNew(false)}}
          onSaved={()=>{setEditId(null);setFromNew(false);load()}}
          onBackToOpenBalance={fromNew?()=>{setEditId(null);setFromNew(false);setShowNew(true)}:undefined}/>
      )}
    </div>
  )
}

function RowActions({onEdit,onDelete}:{onEdit:()=>void;onDelete:()=>void}) {
  const [open,setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const h=(e:MouseEvent)=>{if(ref.current&&!ref.current.contains(e.target as Node))setOpen(false)}
    document.addEventListener('mousedown',h)
    return ()=>document.removeEventListener('mousedown',h)
  },[])
  return (
    <div className="flex items-center gap-1" ref={ref}>
      <button onClick={e=>{e.stopPropagation();onEdit()}} className="p-1.5 border border-green-200 text-green-600 rounded hover:bg-green-50 transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
      </button>
      <div className="relative">
        <button onClick={e=>{e.stopPropagation();setOpen(v=>!v)}} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 py-1 w-28">
            <button onClick={e=>{e.stopPropagation();setOpen(false);onEdit()}} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Edit</button>
            <button onClick={e=>{e.stopPropagation();setOpen(false);onDelete()}} className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Delete</button>
          </div>
        )}
      </div>
    </div>
  )
}
