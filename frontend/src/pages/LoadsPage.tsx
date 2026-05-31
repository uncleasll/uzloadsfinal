import { useState, useEffect, useCallback, useRef } from 'react'
import { loadsApi } from '@/api/loads'
import type { LoadListItem, LoadFilters } from '@/types'
import {
  formatCurrency, formatDate,
  getPickupStop, getDeliveryStop, stopLabel,
  PERIOD_OPTIONS, periodToDates,
} from '@/utils'
import LoadModal from '@/components/loads/LoadModal'
import LoadImportModal from '@/components/loads/LoadImportModal'
import NewLoadModal from '@/components/loads/NewLoadModal'
import FilterDrawer from '@/components/loads/FilterDrawer'
import { useEntities } from '@/hooks/useEntities'
import toast from 'react-hot-toast'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

const STATUS_STYLE: Record<string, string> = {
  'New':        'bg-blue-100 text-blue-700',
  'Canceled':   'bg-red-100 text-red-600',
  'TONU':       'bg-red-100 text-red-600',
  'Dispatched': 'bg-blue-100 text-blue-700',
  'En Route':   'bg-cyan-100 text-cyan-700',
  'Picked-up':  'bg-amber-100 text-amber-700',
  'Delivered':  'bg-purple-100 text-purple-700',
  'Closed':     'bg-gray-100 text-gray-500',
}

export default function LoadsPage() {
  const [loads, setLoads] = useState<LoadListItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalRate, setTotalRate] = useState(0)
  const [rateSummary, setRateSummary] = useState({
    pending: 0,
    invoiced: 0,
    paid: 0,
    overdue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [showImport, setShowImport] = useState(false)

  const [filters, setFilters] = useState<LoadFilters>({ page: 1, page_size: 50, sort_by: 'load_number', sort_dir: 'desc' })
  const [period, setPeriod] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [showOnlyActive, setShowOnlyActive] = useState(false)
  const [activeFilters, setActiveFilters] = useState<LoadFilters>({})

  const [selectedLoad, setSelectedLoad] = useState<LoadListItem | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  const [showFilterDrawer, setShowFilterDrawer] = useState(false)

  const entities = useEntities()
  const searchRef = useRef<HTMLInputElement>(null)

  const fetchLoads = useCallback(async (f: LoadFilters) => {
    setLoading(true)
    try {
      const res = await loadsApi.list({ ...f, show_only_active: showOnlyActive })
      setLoads(res.items)
      setTotal(res.total)
      setTotalPages(res.total_pages)
      setTotalRate(res.total_rate)
      setRateSummary({
        pending: res.total_pending_rate ?? 0,
        invoiced: res.total_invoiced_rate ?? 0,
        paid: res.total_paid_rate ?? 0,
        overdue: res.total_overdue_rate ?? 0,
      })
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [showOnlyActive])

  useEffect(() => {
    let periodDates: { date_from?: string; date_to?: string } = {}
    if (period === 'custom') {
      periodDates = { date_from: customFrom || undefined, date_to: customTo || undefined }
    } else if (period !== 'all') {
      periodDates = periodToDates(period)
    }
    fetchLoads({ ...activeFilters, ...filters, ...periodDates })
  }, [filters, activeFilters, period, customFrom, customTo, showOnlyActive, fetchLoads])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.trim()
    const isNum = /^\d+$/.test(v)
    setFilters(prev => ({
      ...prev, page: 1,
      search: isNum ? undefined : (v || undefined),
      load_number: isNum ? parseInt(v) : undefined,
    }))
  }

  const handleApplyFilters = (f: LoadFilters) => {
    setActiveFilters(f)
    setFilters(prev => ({ ...prev, page: 1 }))
    setShowFilterDrawer(false)
  }

  const removeFilter = (key: keyof LoadFilters) => {
    if (key === 'load_number' || key === 'search') {
      setFilters(prev => { const n = { ...prev }; delete n[key]; return n })
      if (searchRef.current) searchRef.current.value = ''
    } else {
      setActiveFilters(prev => { const n = { ...prev }; delete n[key]; return n })
    }
  }

  const clearAllFilters = () => {
    setActiveFilters({})
    setFilters({ page: 1, page_size: filters.page_size || 50, sort_by: 'load_number', sort_dir: 'desc' })
    setPeriod('all')
    setCustomFrom('')
    setCustomTo('')
    if (searchRef.current) searchRef.current.value = ''
  }

  const handleLoadSaved = () => {
    setShowNewForm(false)
    fetchLoads({ ...activeFilters, ...filters })
  }

  const handleCopyLoad = async (load: LoadListItem) => {
    const pickup = load.stops.find(s => s.stop_type === 'pickup')
    const delivery = load.stops.find(s => s.stop_type === 'delivery')
    try {
      await loadsApi.create({
        status: 'New',
        billing_status: 'Pending',
        load_date: new Date().toISOString().slice(0, 10),
        rate: load.rate,
        loaded_miles: load.loaded_miles,
        empty_miles: load.empty_miles,
        total_miles: load.total_miles,
        broker_id: load.broker?.id,
        driver_id: load.driver?.id,
        truck_id: load.truck?.id,
        trailer_id: load.trailer?.id,
        dispatcher_id: load.dispatcher?.id,
        stops: [
          ...(pickup ? [{
            stop_type: 'pickup' as const,
            stop_order: 1,
            city: pickup.city,
            state: pickup.state,
            zip_code: pickup.zip_code,
            country: pickup.country || 'US',
          }] : []),
          ...(delivery ? [{
            stop_type: 'delivery' as const,
            stop_order: 2,
            city: delivery.city,
            state: delivery.state,
            zip_code: delivery.zip_code,
            country: delivery.country || 'US',
          }] : []),
        ],
      })
      toast.success(`Load #${load.load_number} copied`)
      fetchLoads({ ...activeFilters, ...filters })
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
  }

  const handleDeleteLoad = async (load: LoadListItem) => {
    if (!confirm(`Delete load #${load.load_number}?`)) return
    try {
      await loadsApi.delete(load.id)
      toast.success(`Load #${load.load_number} deleted`)
      fetchLoads({ ...activeFilters, ...filters })
    } catch (e: unknown) {
      toast.error((e as Error).message)
    }
  }

  const sortBy = (key: string) => {
    setFilters(prev => ({
      ...prev,
      page: 1,
      sort_by: key,
      sort_dir: prev.sort_by === key && prev.sort_dir === 'asc' ? 'desc' : 'asc',
    }))
  }

  const filterChips: { label: string; key: keyof LoadFilters }[] = []
  if (filters.load_number) filterChips.push({ label: `#${filters.load_number}`, key: 'load_number' })
  if (filters.search) filterChips.push({ label: `"${filters.search}"`, key: 'search' })
  if (activeFilters.driver_id) {
    const drv = entities.drivers.find(d => d.id === activeFilters.driver_id)
    if (drv) filterChips.push({ label: drv.name, key: 'driver_id' })
  }
  if (activeFilters.broker_id) {
    const brk = entities.brokers.find(b => b.id === activeFilters.broker_id)
    if (brk) filterChips.push({ label: brk.name, key: 'broker_id' })
  }
  if (activeFilters.status) filterChips.push({ label: activeFilters.status, key: 'status' })
  if (activeFilters.billing_status) filterChips.push({ label: activeFilters.billing_status, key: 'billing_status' })

  const startEntry = ((filters.page || 1) - 1) * (filters.page_size || 50) + 1
  const endEntry = Math.min((filters.page || 1) * (filters.page_size || 50), total)
  const summaryTotal = Math.max(totalRate, 0)
  const pct = (value: number) => summaryTotal > 0 ? `${Math.min((value / summaryTotal) * 100, 100)}%` : '0%'

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white text-[11px] shadow-sm">

      {/* ── Top bar ── */}
      <div className="flex min-h-[54px] flex-shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5">

        <div className="mr-1 flex-shrink-0">
          <div className="text-[15px] font-bold leading-tight text-slate-950">Loads</div>
          <div className="text-[10px] font-medium text-slate-400">{total} records</div>
        </div>

        {/* Period */}
        <div className="relative flex items-center flex-shrink-0">
          <select
            value={period}
            onChange={e => { setPeriod(e.target.value); setFilters(p => ({ ...p, page: 1 })) }}
            className="appearance-none rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-2.5 pr-7 text-[11px] font-semibold text-slate-600 shadow-sm focus:outline-none focus:border-blue-400 focus:bg-white"
          >
            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <svg className="pointer-events-none absolute right-2 w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </div>

        {period === 'custom' && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <input type="date" value={customFrom}
              onChange={e => { setCustomFrom(e.target.value); setFilters(p => ({ ...p, page: 1 })) }}
              className="w-28 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] shadow-sm focus:outline-none focus:border-blue-400" />
            <span className="text-gray-300">—</span>
            <input type="date" value={customTo}
              onChange={e => { setCustomTo(e.target.value); setFilters(p => ({ ...p, page: 1 })) }}
              className="w-28 rounded-md border border-slate-200 px-2 py-1.5 text-[11px] shadow-sm focus:outline-none focus:border-blue-400" />
          </div>
        )}

        {/* Total bar */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[11px] text-slate-600 whitespace-nowrap font-bold flex-shrink-0">
            TOTAL: {formatCurrency(totalRate)}
          </span>
          <div className="relative flex-1 h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner">
            <div className="absolute left-0 top-0 h-full bg-blue-500 transition-all"
              title={`Paid: ${formatCurrency(rateSummary.paid)}`}
              style={{ width: pct(rateSummary.paid) }} />
            <div className="absolute top-0 h-full bg-amber-400 transition-all"
              title={`Invoiced/funded: ${formatCurrency(rateSummary.invoiced)}`}
              style={{
                left: pct(rateSummary.paid),
                width: pct(rateSummary.invoiced),
              }} />
            <div className="absolute top-0 h-full bg-gray-300 transition-all"
              title={`Pending: ${formatCurrency(rateSummary.pending)}`}
              style={{
                left: pct(rateSummary.paid + rateSummary.invoiced),
                width: pct(rateSummary.pending),
              }} />
            <div className="absolute right-0 top-0 h-full bg-red-400 transition-all"
              title={`Overdue unpaid: ${formatCurrency(rateSummary.overdue)}`}
              style={{ width: pct(rateSummary.overdue) }} />
          </div>
          <div className="hidden xl:flex items-center gap-2 text-[10px] text-gray-500 flex-shrink-0">
            <LegendDot color="bg-blue-500" label="Paid" />
            <LegendDot color="bg-amber-400" label="Invoiced" />
            <LegendDot color="bg-gray-300" label="Pending" />
            <LegendDot color="bg-red-400" label="Overdue" />
          </div>
        </div>

        {/* Search */}
        <div className="relative flex-shrink-0">
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
          <input
            ref={searchRef}
            type="text"
            placeholder="Search..."
            onChange={handleSearch}
            className="w-44 rounded-md border border-slate-200 py-1.5 pl-7 pr-7 text-[11px] shadow-sm focus:outline-none focus:border-blue-400"
          />
          <button onClick={() => setShowFilterDrawer(true)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 10h10M11 16h2"/></svg>
          </button>
        </div>

        {/* Import */}
        <button onClick={() => setShowImport(true)}
          className="btn-secondary text-[12px]">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
          Import
        </button>
        {/* New Load */}
        <button
          onClick={() => setShowNewForm(v => !v)}
          className="btn-primary flex-shrink-0 text-[12px]"
        >
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
          New Load
          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </button>
      </div>

      {/* ── Filter chips ── */}
      {filterChips.length > 0 && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2">
          <span className="text-[11px] text-gray-400">Filtered by:</span>
          {filterChips.map(chip => (
            <span key={chip.key} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-sky-50 text-sky-600 text-[11px] rounded">
              {chip.label}
              <button onClick={() => removeFilter(chip.key)} className="hover:text-sky-900 ml-0.5">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </span>
          ))}
          <button onClick={clearAllFilters} className="text-[11px] text-gray-400 hover:text-red-500 ml-1">clear all</button>
        </div>
      )}

      {/* ── New Load inline form ── */}
      {showNewForm && (
        <div className="flex-shrink-0 border-b border-gray-200">
          <NewLoadModal onClose={() => setShowNewForm(false)} onSaved={handleLoadSaved} entities={entities} />
        </div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 11 }}>
          <colgroup>{TABLE_COLUMNS.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>

          <thead className="sticky top-0 z-10">
            {/* Header */}
            <tr className="border-b border-slate-200 bg-slate-50/95">
              <th className="px-1 py-1.5 text-center">
                <input type="checkbox" className="w-3 h-3 rounded" />
              </th>
              <th className="px-0 py-1.5" />
              {LOAD_HEADERS.map((h, i) => (
                <th key={i} className="px-1.5 py-2 text-left font-bold uppercase text-slate-500 whitespace-nowrap" style={{ fontSize: 10 }}>
                  {h.sort ? (
                    <button onClick={() => sortBy(h.sort!)} className="inline-flex items-center gap-0.5 hover:text-blue-700">
                      {h.label}
                      <span className={filters.sort_by === h.sort ? 'opacity-100 text-blue-600' : 'opacity-30'}>
                        {filters.sort_by === h.sort && filters.sort_dir === 'asc' ? '↑' : '↓'}
                      </span>
                    </button>
                  ) : <span className={h.align === 'center' ? 'block text-center' : ''}>{h.label}</span>}
                </th>
              ))}
              {false && [
                'LOAD','DATE','DRIVER','BROKER','PO #',
                'PICKUP','DELIVERY','RATE','COMPLETED',
                'STATUS','BILLING','NOTES','ATTACHMENTS','','ACTIONS',
              ].map((h, i) => (
                <th key={i} className="px-1.5 py-1.5 text-left font-semibold text-gray-500 whitespace-nowrap" style={{ fontSize: 10 }}>
                  {h}{h && <span className="ml-0.5 opacity-30">⇅</span>}
                </th>
              ))}
            </tr>

            {/* Inline filters */}
            <tr className="bg-white border-b border-slate-100">
              <td className="px-1 py-0.5" />
              <td className="px-0 py-0.5" />
              {/* Load # */}
              <td className="px-1 py-0.5">
                <input type="text"
                  onChange={e => {
                    const v = e.target.value; const num = parseInt(v)
                    setFilters(p => ({ ...p, page: 1, load_number: !isNaN(num) && v ? num : undefined }))
                  }}
                  className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:border-blue-400"
                />
              </td>
              {/* Date from */}
              <td className="px-1 py-0.5">
                <input type="date"
                  value={activeFilters.date_from || ''}
                  onChange={e => { setActiveFilters(p => ({ ...p, date_from: e.target.value || undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                  className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:border-blue-400"
                />
              </td>
              {/* Driver */}
              <td className="px-1 py-0.5">
                <select value={activeFilters.driver_id || ''}
                  onChange={e => { setActiveFilters(p => ({ ...p, driver_id: e.target.value ? parseInt(e.target.value) : undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                  className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none bg-white">
                  <option value="">Choose</option>
                  {entities.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </td>
              {/* Broker */}
              <td className="px-1 py-0.5">
                <select value={activeFilters.broker_id || ''}
                  onChange={e => { setActiveFilters(p => ({ ...p, broker_id: e.target.value ? parseInt(e.target.value) : undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                  className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none bg-white">
                  <option value=""></option>
                  {entities.brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </td>
              {/* PO */}
              <td className="px-1 py-0.5">
                <input type="text"
                  onChange={e => setFilters(p => ({ ...p, page: 1, search: e.target.value || undefined }))}
                  className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:border-blue-400"
                />
              </td>
              {/* Pickup, Delivery, Rate — readonly */}
              <td className="px-1 py-0.5"><input readOnly className="w-full border border-gray-100 rounded px-1 py-0.5 text-[11px] bg-gray-50 cursor-not-allowed" /></td>
              <td className="px-1 py-0.5"><input readOnly className="w-full border border-gray-100 rounded px-1 py-0.5 text-[11px] bg-gray-50 cursor-not-allowed" /></td>
              <td className="px-1 py-0.5"><input readOnly className="w-full border border-gray-100 rounded px-1 py-0.5 text-[11px] bg-gray-50 cursor-not-allowed" /></td>
              {/* Date to (Completed) */}
              <td className="px-1 py-0.5">
                <input type="date"
                  value={activeFilters.date_to || ''}
                  onChange={e => { setActiveFilters(p => ({ ...p, date_to: e.target.value || undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                  className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:border-blue-400"
                />
              </td>
              {/* Status */}
              <td className="px-1 py-0.5">
                <select value={activeFilters.status || ''}
                  onChange={e => { setActiveFilters(p => ({ ...p, status: e.target.value || undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                  className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none bg-white">
                  <option value=""></option>
                  {['New','Canceled','TONU','Dispatched','En Route','Picked-up','Delivered','Closed'].map(s => <option key={s}>{s}</option>)}
                </select>
              </td>
              {/* Billing */}
              <td className="px-1 py-0.5">
                <select value={activeFilters.billing_status || ''}
                  onChange={e => { setActiveFilters(p => ({ ...p, billing_status: e.target.value || undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                  className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none bg-white">
                  <option value=""></option>
                  {['Pending','Canceled','BOL received','Invoiced','Sent to factoring','Funded','Paid'].map(s => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td className="px-1 py-0.5" />
              <td className="px-1 py-0.5" />
              <td className="px-1 py-0.5">
                <button onClick={() => setShowFilterDrawer(true)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </td>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={16} className="py-16 text-center text-slate-400 text-[12px]">Loading loads...</td></tr>
            ) : loads.length === 0 ? (
              <tr><td colSpan={16} className="py-16 text-center text-slate-400 text-[12px]">No loads match the current filters</td></tr>
            ) : loads.map(load => {
              const pickup = getPickupStop(load.stops)
              const delivery = getDeliveryStop(load.stops)
              const svcLabel = load.services[0]?.service_type
              const svcAmt = load.services.reduce((s, v) => s + v.invoice_amount, 0)

              return (
                <tr key={load.id} onClick={() => setSelectedLoad(load)}
                  className="cursor-pointer transition-colors odd:bg-white even:bg-slate-50/35 hover:bg-blue-50/70">
                  <td className="px-1 py-1 text-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="w-3 h-3 rounded" />
                  </td>
                  <td className="px-0 py-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                  </td>
                  <td className="px-1.5 py-1">
                    <button onClick={e => { e.stopPropagation(); setSelectedLoad(load) }}
                      className="text-blue-600 hover:underline font-semibold text-[11px]">
                      {load.load_number}
                    </button>
                  </td>
                  <td className="px-1.5 py-1 text-gray-500 truncate">{formatDate(load.load_date)}</td>
                  <td className="px-1.5 py-1 text-gray-800 truncate">
                    {load.driver?.name || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-1.5 py-1 truncate">
                    {load.broker
                      ? <button onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline text-left truncate max-w-full">{load.broker.name}</button>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-1.5 py-1 text-gray-500 truncate">
                    {load.po_number || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-1.5 py-1 text-gray-700 truncate">{stopLabel(pickup)}</td>
                  <td className="px-1.5 py-1 text-gray-700 truncate">{stopLabel(delivery)}</td>
                  <td className="px-1.5 py-1 font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(load.rate)}</td>
                  <td className="px-1.5 py-1 text-gray-500 truncate">{formatDate(load.actual_delivery_date) || '—'}</td>
                  <td className="px-1.5 py-1">
                    <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${STATUS_STYLE[load.status] || 'bg-gray-100 text-gray-500'}`}>
                      {load.status}
                    </span>
                  </td>
                  <td className="px-1.5 py-1 text-gray-500 truncate">{load.billing_status}</td>
                  <td className="px-1.5 py-1 text-gray-400 truncate">
                    {svcAmt > 0 && svcLabel ? `${svcLabel}: ${formatCurrency(svcAmt)}` : <span className="text-gray-200">—</span>}
                  </td>
                  <td className="px-1 py-1 text-center" onClick={e => e.stopPropagation()}>
                    {load.documents.length > 0 && (
                      <span className="inline-block w-2 h-2 rounded-full bg-blue-500" title={`${load.documents.length} doc(s)`} />
                    )}
                  </td>
                  <td className="px-0.5 py-1" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-0.5">
                      {svcLabel && <span className="text-gray-400 truncate text-[10px]">{svcLabel}</span>}
                      <button
                        title="Copy load"
                        onClick={() => handleCopyLoad(load)}
                        className="inline-flex h-5 w-4 items-center justify-center rounded text-gray-400 hover:bg-blue-50 hover:text-blue-700"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 8h10v10H8z"/><path strokeLinecap="round" strokeLinejoin="round" d="M6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                      </button>
                      <button
                        title="Delete load"
                        onClick={() => handleDeleteLoad(load)}
                        className="inline-flex h-5 w-4 items-center justify-center rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V5h6v2m-7 3v8m4-8v8m4-8v8M8 7l1 13h6l1-13"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <PagBtn onClick={() => setFilters(p => ({ ...p, page: 1 }))} disabled={(filters.page || 1) <= 1}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
            </PagBtn>
            <PagBtn onClick={() => setFilters(p => ({ ...p, page: Math.max(1, (p.page || 1) - 1) }))} disabled={(filters.page || 1) <= 1}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </PagBtn>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const cur = filters.page || 1
              const start = Math.max(1, Math.min(cur - 2, totalPages - 4))
              return start + i
            }).map(p => (
              <button key={p} onClick={() => setFilters(prev => ({ ...prev, page: p }))}
                className={`w-5 h-5 rounded text-[11px] font-medium transition-colors ${
                  p === (filters.page || 1) ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                {p}
              </button>
            ))}
            <PagBtn onClick={() => setFilters(p => ({ ...p, page: Math.min(totalPages, (p.page || 1) + 1) }))} disabled={(filters.page || 1) >= totalPages}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </PagBtn>
            <PagBtn onClick={() => setFilters(p => ({ ...p, page: totalPages }))} disabled={(filters.page || 1) >= totalPages}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
            </PagBtn>
          </div>

          <span className="text-[11px] text-gray-500">
            Showing {total === 0 ? 0 : startEntry}–{endEntry} of {total} entries
          </span>

          <button onClick={() => setShowOnlyActive(p => !p)}
            className={`text-[11px] underline ${showOnlyActive ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
            {showOnlyActive ? 'Show all loads' : 'Show only active loads'}
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[11px] text-gray-400">Show records</span>
          {PAGE_SIZE_OPTIONS.map(n => (
            <button key={n} onClick={() => setFilters(p => ({ ...p, page: 1, page_size: n }))}
              className={`text-[11px] px-1 rounded ${(filters.page_size || 50) === n ? 'text-blue-600 font-bold underline' : 'text-gray-400 hover:text-gray-700'}`}>
              {n}
            </button>
          ))}
          <span className="text-[11px] text-gray-400">on page</span>
        </div>
      </div>

      {/* Modals */}
      {selectedLoad && (
        <LoadModal loadId={selectedLoad.id} onClose={() => setSelectedLoad(null)}
          onSaved={() => fetchLoads({ ...activeFilters, ...filters })} entities={entities} />
      )}
      {showImport && (
        <LoadImportModal onClose={()=>setShowImport(false)} onImported={()=>{setShowImport(false); fetchLoads({ ...activeFilters, ...filters })}}/>
      )}
      {showFilterDrawer && (
        <FilterDrawer initial={activeFilters} entities={entities}
          onApply={handleApplyFilters} onClose={() => setShowFilterDrawer(false)} />
      )}
    </div>
  )
}

function PagBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">
      {children}
    </button>
  )
}

const LOAD_HEADERS: { label: string; sort?: string; align?: 'center' }[] = [
  { label: 'LOAD', sort: 'load_number' },
  { label: 'DATE', sort: 'date' },
  { label: 'DRIVER' },
  { label: 'BROKER' },
  { label: 'PO #', sort: 'po_number' },
  { label: 'PICKUP' },
  { label: 'DELIVERY' },
  { label: 'RATE', sort: 'rate' },
  { label: 'COMPLETED', sort: 'completed' },
  { label: 'STATUS', sort: 'status' },
  { label: 'BILLING', sort: 'billing' },
  { label: 'NOTES' },
  { label: 'DOCS', align: 'center' },
  { label: 'ACTIONS', align: 'center' },
]

const TABLE_COLUMNS: Array<number | string> = [
  26,
  14,
  '5%',
  '6%',
  '10%',
  '8%',
  '5%',
  '9%',
  '9%',
  '6%',
  '6%',
  '7%',
  '6%',
  '7%',
  34,
  42,
]

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  )
}
