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

const SETTLEMENT_STATUS_STYLE: Record<string, string> = {
  Preparing: 'bg-slate-100 text-slate-600',
  Ready:     'bg-amber-100 text-amber-700',
  Sent:      'bg-blue-100 text-blue-700',
  Paid:      'bg-emerald-100 text-emerald-700',
  Void:      'bg-red-100 text-red-600',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={'inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold ' + (SETTLEMENT_STATUS_STYLE[status] || 'bg-slate-100 text-slate-500')}>
      {STATUS_LABEL[status] || status}
    </span>
  )
}

function PBtn({onClick,disabled,children}:{onClick:()=>void;disabled:boolean;children:React.ReactNode}) {
  return <button onClick={onClick} disabled={disabled} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">{children}</button>
}

const SETTLE_COLUMN_DEFS: Array<{ key: string; label: string; sortable?: boolean; align?: 'right' | 'center'; width: string }> = [
  { key: 'number',  label: 'NUMBER',           sortable: true, width: '6%' },
  { key: 'date',    label: 'DATE',             sortable: true, width: '7%' },
  { key: 'payable', label: 'PAYABLE TO',       sortable: true, width: '14%' },
  { key: 'driver',  label: 'DRIVER',           sortable: true, width: '15%' },
  { key: 'total',   label: 'SETTLEMENT TOTAL', sortable: true, align: 'right', width: '11%' },
  { key: 'balance', label: 'BALANCE DUE',      sortable: true, align: 'right', width: '10%' },
  { key: 'qb',      label: 'QB',               align: 'center', width: '4%' },
  { key: 'status',  label: 'STATUS',           sortable: true, width: '11%' },
  { key: 'notes',   label: 'NOTES',            width: '11%' },
]

function settlementSortVal(s: Settlement, key: string): string | number {
  switch (key) {
    case 'number':  return s.settlement_number ?? 0
    case 'date':    return s.date || ''
    case 'payable': return s.payable_to || ''
    case 'driver':  return s.driver?.name || ''
    case 'total':   return s.settlement_total ?? 0
    case 'balance': return s.balance_due ?? 0
    case 'status':  return s.status || ''
    default:        return ''
  }
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
  const [search, setSearch]           = useState('')
  const [batchOpen, setBatchOpen]     = useState(false)
  const batchRef = useRef<HTMLDivElement>(null)

  const [filters, setFilters] = useState({ status:'', driver_id:'', date_from:'', date_to:'' })
  const [applied, setApplied] = useState(filters)
  const [sortKey, setSortKey] = useState('number')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')

  const sortBy = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'payable' || key === 'driver' || key === 'status' ? 'asc' : 'desc') }
  }

  // Fetch the full filtered set once; search/sort/pagination happen client-side
  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string,string|number> = { page: 1, page_size: 1000 }
    if (applied.status)    params.status    = applied.status
    if (applied.driver_id) params.driver_id = applied.driver_id
    if (applied.date_from) params.date_from = applied.date_from
    if (applied.date_to)   params.date_to   = applied.date_to
    payrollApi.list(params)
      .then(data => setSettlements(data.items || data))
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [applied])

  useEffect(() => { load() }, [load])
  useEffect(() => { driversApi.list().then(setDrivers).catch(()=>{}) }, [])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (batchRef.current && !batchRef.current.contains(e.target as Node)) setBatchOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  // Search across the full set, then sort, then paginate
  const q = search.trim().toLowerCase()
  const searched = q
    ? settlements.filter(s =>
        String(s.settlement_number).includes(q) ||
        s.payable_to?.toLowerCase().includes(q) ||
        s.driver?.name?.toLowerCase().includes(q))
    : settlements
  const sortedAll = [...searched].sort((a, b) => {
    const va = settlementSortVal(a, sortKey), vb = settlementSortVal(b, sortKey)
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' })
    return sortDir === 'asc' ? cmp : -cmp
  })
  const total = searched.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const sortedSettlements = sortedAll.slice((safePage-1)*pageSize, safePage*pageSize)
  const start = total===0 ? 0 : (safePage-1)*pageSize+1
  const end   = Math.min(safePage*pageSize, total)

  const toggleOne = (id: number) => setSelected(s => s.includes(id) ? s.filter(x=>x!==id) : [...s,id])
  const toggleAll = () => setSelected(s => s.length===sortedSettlements.length && sortedSettlements.length>0 ? [] : sortedSettlements.map(x=>x.id))

  const selItems   = settlements.filter(s => selected.includes(s.id))
  const selTotal   = selItems.reduce((a,s) => a+s.settlement_total, 0)
  const selBalance = selItems.reduce((a,s) => a+s.balance_due, 0)
  const pageTotal   = searched.reduce((a,s) => a+s.settlement_total, 0)
  const pageBalance = searched.reduce((a,s) => a+s.balance_due, 0)

  const sf = (k: keyof typeof filters, v: string) => setFilters(p=>({...p,[k]:v}))
  const handleApply = () => { setApplied(filters); setPage(1); setShowFilter(false) }
  const handleClear = () => {
    const b = {status:'',driver_id:'',date_from:'',date_to:''}
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
    } else if (action === 'Change status') {
      const next = prompt('New status: Preparing, Ready, Sent, Paid, Void')
      if (!next) return
      const status = next.trim()
      Promise.all(selected.map(id => payrollApi.changeStatus(id, status)))
        .then(() => { toast.success('Status changed for '+selected.length+' settlement(s)'); setSelected([]); load() })
        .catch(e => toast.error(e.message))
    } else if (action === 'Download attachments') {
      selected.forEach(id => window.open(payrollApi.getPdfUrl(id), '_blank'))
      toast.success('Opened '+selected.length+' settlement PDF(s)')
    } else if (action === 'Download Excel') {
      const rows = selItems.map(s => ({
        number: s.settlement_number,
        date: s.date,
        payable_to: s.payable_to,
        driver: s.driver?.name || '',
        settlement_total: s.settlement_total,
        balance_due: s.balance_due,
        status: s.status,
        notes: s.notes || '',
      }))
      const header = Object.keys(rows[0] || {})
      const csv = [
        header.join(','),
        ...rows.map(row => header.map(key => {
          const value = String((row as Record<string, unknown>)[key] ?? '')
          return `"${value.replace(/"/g, '""')}"`
        }).join(',')),
      ].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'selected_settlements.csv'
      a.click()
      URL.revokeObjectURL(url)
      toast.success('CSV downloaded')
    } else if (action === 'Email settlements') {
      selected.forEach(id => window.open(payrollApi.getPdfUrl(id), '_blank'))
      toast('PDFs opened. Email sending needs SMTP settings.', { icon: 'i' })
    } else {
      toast('Unknown batch action: '+action, { icon: 'i' })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">

      {/* Header */}
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="mr-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Driver Payroll</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.625rem] font-bold text-slate-500">{total}</span>
            </div>
            <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">Driver settlements, balances and payments</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative min-w-[13.75rem] flex-1 sm:flex-none">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
              <input type="search" placeholder="Search settlements..." value={search}
                onChange={e=>{setSearch(e.target.value);setPage(1)}}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-10 text-xs text-slate-800 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-64" />
              <button onClick={()=>setShowFilter(v=>!v)}
                title="Advanced filters"
                aria-expanded={showFilter}
                className={`absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md transition-colors ${showFilter || applied.status || applied.driver_id || applied.date_from || applied.date_to ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-600'}`}>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4"/></svg>
              </button>
            </div>
            <button onClick={()=>setShowNew(true)} className="btn-primary h-9 rounded-lg px-4 text-xs">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5"/></svg>
              New settlement
            </button>
          </div>
        </div>

        {/* Batch actions + summary */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative" ref={batchRef}>
            <button onClick={()=>selected.length>0 && setBatchOpen(v=>!v)}
              aria-haspopup="menu"
              aria-expanded={batchOpen}
              className={'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[0.6875rem] font-semibold shadow-sm transition-colors ' + (selected.length>0 ? 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'cursor-not-allowed border border-slate-200 bg-slate-50 text-slate-400')}>
              Batch actions
              {selected.length>0 && <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-600 px-1 text-[0.5625rem] font-bold text-white">{selected.length}</span>}
              <svg className={`h-3 w-3 transition-transform ${batchOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
            </button>
            {batchOpen && selected.length>0 && (
              <div role="menu" className="absolute left-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-950/10">
                {['Email settlements','Change status','Export to QuickBooks','Download attachments','Download Excel'].map(a=>(
                  <button key={a} role="menuitem" onClick={()=>handleBatch(a)}
                    className="block w-full px-3 py-2 text-left text-[0.6875rem] font-medium text-slate-700 transition-colors hover:bg-slate-50">{a}</button>
                ))}
              </div>
            )}
          </div>
          {selected.length>0 && (
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[0.625rem] font-semibold text-blue-700">
              Selected: {formatCurrency(selTotal)} · Due {formatCurrency(selBalance)}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 shadow-sm">
              <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-blue-500">Total</span>
              <span className="whitespace-nowrap text-xs font-bold text-blue-800">{formatCurrency(pageTotal)}</span>
            </div>
            <div className="flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm">
              <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" />
              <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-slate-400">Balance due</span>
              <span className={`whitespace-nowrap text-xs font-bold ${pageBalance < 0 ? 'text-red-600' : 'text-slate-800'}`}>{formatCurrency(pageBalance)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <div className="flex-shrink-0 border-b border-slate-200/80 bg-slate-50/60 px-4 py-3.5 lg:px-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">Advanced filters</span>
            <button onClick={()=>setShowFilter(false)} aria-label="Close filters" className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-[0.625rem] font-semibold uppercase tracking-wide text-slate-400">Status</label>
              <select value={filters.status} onChange={e=>sf('status',e.target.value)}
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[0.6875rem] text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200">
                <option value="">All</option>
                {STATUSES.map(s=><option key={s} value={s}>{STATUS_LABEL[s]||s}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[0.625rem] font-semibold uppercase tracking-wide text-slate-400">Driver</label>
              <select value={filters.driver_id} onChange={e=>sf('driver_id',e.target.value)}
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[0.6875rem] text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200">
                <option value="">All</option>
                {drivers.map(d=><option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[0.625rem] font-semibold uppercase tracking-wide text-slate-400">Date from</label>
              <input type="date" value={filters.date_from} onChange={e=>sf('date_from',e.target.value)}
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[0.6875rem] text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
            </div>
            <div>
              <label className="mb-1 block text-[0.625rem] font-semibold uppercase tracking-wide text-slate-400">Date to</label>
              <input type="date" value={filters.date_to} onChange={e=>sf('date_to',e.target.value)}
                className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[0.6875rem] text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
            </div>
          </div>
          <div className="mt-3.5 flex items-center justify-end gap-2">
            <button onClick={handleClear}
              className="inline-flex h-8 items-center rounded-lg px-3 text-[0.6875rem] font-semibold text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-700">
              Reset all
            </button>
            <button onClick={handleApply}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[0.6875rem] font-bold text-white shadow-sm transition-colors hover:bg-blue-700">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              Apply filters
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 11 }}>
          <colgroup>
            <col style={{ width: 30 }} />
            {SETTLE_COLUMN_DEFS.map(c => <col key={c.key} style={{ width: c.width }} />)}
            <col style={{ width: 76 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-200 bg-slate-50/95 shadow-[0_1px_0_rgba(148,163,184,0.12)] backdrop-blur">
              <th className="px-1 py-2 text-center">
                <input type="checkbox" className="h-3 w-3 rounded accent-blue-600"
                  checked={selected.length===sortedSettlements.length && sortedSettlements.length>0} onChange={toggleAll}/>
              </th>
              {SETTLE_COLUMN_DEFS.map(h => (
                <th key={h.key} className={`px-1.5 py-2 font-bold uppercase text-slate-500 whitespace-nowrap ${h.align === 'right' ? 'text-right' : h.align === 'center' ? 'text-center' : 'text-left'}`} style={{ fontSize: 10 }}>
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
              <tr><td colSpan={SETTLE_COLUMN_DEFS.length + 2} className="py-20 text-center"><div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />Loading settlements...</div></td></tr>
            ) : sortedSettlements.length===0 ? (
              <tr><td colSpan={SETTLE_COLUMN_DEFS.length + 2} className="py-20 text-center"><div className="mx-auto max-w-xs"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg></div><div className="text-sm font-semibold text-slate-700">No settlements found</div><p className="mt-1 text-xs text-slate-400">Try adjusting your search or filters.</p></div></td></tr>
            ) : sortedSettlements.map(s => {
              const isSel = selected.includes(s.id)
              return (
                <tr key={s.id} onClick={()=>setEditId(s.id)}
                  className={'group cursor-pointer border-l-2 transition-colors ' + (isSel ? 'border-l-blue-500 bg-blue-50/70' : 'border-l-transparent odd:bg-white even:bg-slate-50/30 hover:border-l-blue-500 hover:bg-blue-50/70')}>
                  <td className="px-1 py-1 text-center" onClick={e=>e.stopPropagation()}>
                    <input type="checkbox" className="h-3 w-3 rounded accent-blue-600" checked={isSel} onChange={()=>toggleOne(s.id)}/>
                  </td>
                  <td className="px-1.5 py-1">
                    <button onClick={e=>{e.stopPropagation();setEditId(s.id)}} className="font-semibold text-blue-600 hover:underline text-[0.6875rem]">
                      {s.settlement_number}
                    </button>
                  </td>
                  <td className="px-1.5 py-1 text-gray-500 truncate">{formatDate(s.date)}</td>
                  <td className="px-1.5 py-1 font-medium text-gray-900 truncate">{s.payable_to}</td>
                  <td className="px-1.5 py-1 text-gray-600 truncate">
                    {s.driver ? s.driver.name+' ['+s.driver.driver_type+']' : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-1.5 py-1 text-right font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(s.settlement_total)}</td>
                  <td className={'px-1.5 py-1 text-right font-semibold whitespace-nowrap '+(s.balance_due<0?'text-red-600':'text-gray-900')}>{formatCurrency(s.balance_due)}</td>
                  <td className="px-1.5 py-1 text-center">
                    {s.qb_exported
                      ? <svg className="mx-auto h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-1.5 py-1"><StatusBadge status={s.status}/></td>
                  <td className="px-1.5 py-1 text-gray-400 truncate">{s.notes||<span className="text-gray-300">—</span>}</td>
                  <td className="px-1 py-1" onClick={e=>e.stopPropagation()}>
                    <RowActions onEdit={()=>setEditId(s.id)} onDelete={()=>handleDelete(s.id,s.settlement_number)}/>
                  </td>
                </tr>
              )
            })}
            {selected.length>0 && (
              <tr className="border-t-2 border-blue-200 bg-blue-50/80 font-bold">
                <td colSpan={5} className="px-1.5 py-2 text-blue-700">Selected total ({selected.length}):</td>
                <td className="px-1.5 py-2 text-right text-blue-700 whitespace-nowrap">{formatCurrency(selTotal)}</td>
                <td className="px-1.5 py-2 text-right text-blue-700 whitespace-nowrap">{formatCurrency(selBalance)}</td>
                <td colSpan={4}/>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 lg:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-0.5">
            <PBtn onClick={()=>setPage(1)} disabled={safePage<=1}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></PBtn>
            <PBtn onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={safePage<=1}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></PBtn>
            {Array.from({length:Math.min(totalPages,5)},(_,i)=>{const s=Math.max(1,Math.min(safePage-2,totalPages-4));return s+i}).map(p=>(
              <button key={p} onClick={()=>setPage(p)} className={'w-5 h-5 rounded text-[0.6875rem] font-medium transition-colors '+(p===safePage?'bg-blue-600 text-white':'text-gray-600 hover:bg-gray-100')}>{p}</button>
            ))}
            <PBtn onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={safePage>=totalPages}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></PBtn>
            <PBtn onClick={()=>setPage(totalPages)} disabled={safePage>=totalPages}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></PBtn>
          </div>
          <span className="text-[0.6875rem] text-gray-500">Showing {start}–{end} of {total} entries</span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <span className="px-1.5 text-[0.625rem] font-medium text-slate-400">Rows</span>
          {PAGE_SIZES.map(n=>(
            <button key={n} onClick={()=>{setPageSize(n);setPage(1)}}
              className={`rounded-md px-2 py-1 text-[0.625rem] transition ${pageSize===n ? 'bg-blue-600 font-bold text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
              {n}
            </button>
          ))}
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
    <div className="relative flex items-center justify-center" ref={ref}>
      <button onClick={e=>{e.stopPropagation();setOpen(v=>!v)}}
        title="Settlement actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={'inline-flex h-6 w-6 items-center justify-center rounded transition-colors ' + (open ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-blue-50 hover:text-blue-700')}>
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-0.5 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-950/10">
          <button role="menuitem" onClick={e=>{e.stopPropagation();setOpen(false);onEdit()}}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.6875rem] font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            Edit Settlement
          </button>
          <button role="menuitem" onClick={e=>{e.stopPropagation();setOpen(false);onDelete()}}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[0.6875rem] font-medium text-red-600 transition-colors hover:bg-red-50">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            Delete Settlement
          </button>
        </div>
      )}
    </div>
  )
}
