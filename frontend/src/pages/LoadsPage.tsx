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
import { useEntities } from '@/hooks/useEntities'
import type { Driver, Broker, Dispatcher, Truck, Trailer } from '@/types'
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
  const [showFilterPanel, setShowFilterPanel] = useState(false)
  const [showNewMenu, setShowNewMenu] = useState(false)
  const newMenuRef = useRef<HTMLDivElement>(null)

  // Table actions menu + column customization
  const [attachmentType, setAttachmentType] = useState('')
  const [showActionsMenu, setShowActionsMenu] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem(HIDDEN_COLS_KEY) || '[]')) } catch { return new Set<string>() }
  })
  const actionsMenuRef = useRef<HTMLDivElement>(null)
  const [rowMenuId, setRowMenuId] = useState<number | null>(null)

  useEffect(() => {
    if (rowMenuId == null) return
    const handle = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('[data-row-menu]')) setRowMenuId(null)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [rowMenuId])

  useEffect(() => {
    if (!showNewMenu) return
    const handle = (e: MouseEvent) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) setShowNewMenu(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showNewMenu])

  const entities = useEntities()
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!showActionsMenu) return
    const handle = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false)
        setShowCustomize(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showActionsMenu])

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
    setAttachmentType('')
    if (searchRef.current) searchRef.current.value = ''
  }

  const visible = (key: string) => !hiddenCols.has(key)
  const visibleDefs = COLUMN_DEFS.filter(c => visible(c.key))

  const toggleCol = (key: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      localStorage.setItem(HIDDEN_COLS_KEY, JSON.stringify([...next]))
      return next
    })
  }

  const applyDefaults = () => {
    setActiveFilters({})
    setFilters({ page: 1, page_size: 50, sort_by: 'load_number', sort_dir: 'desc' })
    setPeriod('all')
    setCustomFrom('')
    setCustomTo('')
    setAttachmentType('')
    setShowOnlyActive(false)
    setHiddenCols(new Set())
    localStorage.removeItem(HIDDEN_COLS_KEY)
    if (searchRef.current) searchRef.current.value = ''
    toast.success('Loadlist reset to default settings')
  }

  const displayLoads = attachmentType
    ? loads.filter(l => l.documents.some(d => (d.document_type || '').toLowerCase() === attachmentType.toLowerCase()))
    : loads

  const exportLoads = () => {
    if (!displayLoads.length) { toast.error('Nothing to export'); return }
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['Load #', 'Date', 'Driver', 'Broker', 'PO #', 'Pickup', 'Delivery', 'Rate', 'Completed', 'Status', 'Billing', 'Attachments']
    const lines = displayLoads.map(l => [
      l.load_number, l.load_date, l.driver?.name || '', l.broker?.name || '', l.po_number || '',
      stopLabel(getPickupStop(l.stops)), stopLabel(getDeliveryStop(l.stops)),
      l.rate, l.actual_delivery_date || '', l.status, l.billing_status, l.documents.length,
    ].map(esc).join(','))
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loads-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${displayLoads.length} load(s)`)
    setShowActionsMenu(false)
  }

  const handleLoadSaved = () => {
    setShowNewForm(false)
    fetchLoads({ ...activeFilters, ...filters })
  }

  const handleCopyLoad = async (load: LoadListItem) => {
    if (!confirm(`Copy load #${load.load_number}?\n\nA new load will be created with the same broker, driver, route and rate.`)) return
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

  const showOnMap = (load: LoadListItem) => {
    const pickup = getPickupStop(load.stops)
    const delivery = getDeliveryStop(load.stops)
    const origin = stopLabel(pickup)
    const destination = stopLabel(delivery)
    if (!origin || !destination || origin === '—' || destination === '—') {
      toast.error('This load has no route to show')
      return
    }
    window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`, '_blank', 'noopener')
  }

  const handleDeleteLoad = async (load: LoadListItem) => {
    if (!confirm(`Delete load #${load.load_number}?\n\nThis action cannot be undone.`)) return
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[11px] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">

      {/* ── Top bar ── */}
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-4 lg:px-5">

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="mr-1 flex-shrink-0">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Loads</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{total}</span>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-slate-400">Manage, track and invoice every shipment</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="relative order-1 min-w-[240px] flex-1 sm:flex-none">
              <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
              <input ref={searchRef} type="search" placeholder="Search load, broker or PO..." onChange={handleSearch}
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-10 text-xs text-slate-800 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-72" />
              <button
                onClick={() => setShowFilterPanel(v => !v)}
                title="Advanced filters"
                aria-expanded={showFilterPanel}
                className={`absolute right-1.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md transition-colors ${showFilterPanel || filterChips.length > 0 ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-slate-200/70 hover:text-slate-600'}`}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4"/></svg>
                {filterChips.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-600 px-0.5 text-[8px] font-bold text-white">{filterChips.length}</span>
                )}
              </button>
            </div>
            <div ref={newMenuRef} className="relative order-3">
              <button onClick={() => setShowNewMenu(v => !v)} aria-haspopup="menu" aria-expanded={showNewMenu}
                className="btn-primary h-9 rounded-lg px-4 text-xs">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5"/></svg>
                New load
                <svg className={`h-3 w-3 transition-transform ${showNewMenu ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
              </button>
              {showNewMenu && (
                <div role="menu" className="absolute right-0 top-full z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1.5 shadow-xl shadow-slate-950/10">
                  <button role="menuitem" onClick={() => { setShowNewMenu(false); setShowNewForm(true) }}
                    className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-blue-50/60">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                    </span>
                    <span>
                      <span className="block text-xs font-bold text-slate-800">Manual entry</span>
                      <span className="block text-[10px] text-slate-400">Fill in the load details yourself</span>
                    </span>
                  </button>
                  <button role="menuitem" onClick={() => { setShowNewMenu(false); setShowImport(true) }}
                    className="flex w-full items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-blue-50/60">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                    </span>
                    <span>
                      <span className="block text-xs font-bold text-slate-800">Import spreadsheet</span>
                      <span className="block text-[10px] text-slate-400">Add many loads at once from a file</span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Period */}
          <div className="relative flex flex-shrink-0 items-center">
            <select
              value={period}
              onChange={e => { setPeriod(e.target.value); setFilters(p => ({ ...p, page: 1 })) }}
              className="h-9 appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-3 pr-8 text-[11px] font-semibold text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-2 w-2.5 h-2.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
          </div>

          {period === 'custom' && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <input type="date" value={customFrom}
                onChange={e => { setCustomFrom(e.target.value); setFilters(p => ({ ...p, page: 1 })) }}
                className="h-9 w-28 rounded-md border border-slate-200 px-2 text-[11px] shadow-sm focus:outline-none focus:border-blue-400" />
              <span className="text-gray-300">—</span>
              <input type="date" value={customTo}
                onChange={e => { setCustomTo(e.target.value); setFilters(p => ({ ...p, page: 1 })) }}
                className="h-9 w-28 rounded-md border border-slate-200 px-2 text-[11px] shadow-sm focus:outline-none focus:border-blue-400" />
            </div>
          )}

          {/* Revenue summary — one glance: total + where the money is */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <SummaryStat label="Total" value={totalRate} strong />
            <SummaryStat label="Paid" value={rateSummary.paid} dot="bg-emerald-500" />
            <SummaryStat label="Invoiced" value={rateSummary.invoiced} dot="bg-amber-400" />
            <SummaryStat label="Pending" value={rateSummary.pending} dot="bg-slate-400" />
            <SummaryStat label="Overdue" value={rateSummary.overdue} dot="bg-red-500" />
          </div>
        </div>
      </div>

      {/* ── Inline filter panel ── */}
      {showFilterPanel && (
        <FilterPanel
          initial={activeFilters}
          entities={entities}
          onApply={f => { handleApplyFilters(f); setShowFilterPanel(false) }}
          onReset={() => { clearAllFilters(); setShowFilterPanel(false) }}
          onClose={() => setShowFilterPanel(false)}
        />
      )}

      {/* ── Filter chips ── */}
      {filterChips.length > 0 && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-blue-100 bg-blue-50/40 px-4 py-2.5 lg:px-5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Active filters</span>
          {filterChips.map(chip => (
            <span key={chip.key} className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-white px-2.5 py-1 text-[10px] font-semibold text-blue-700 shadow-sm">
              {chip.label}
              <button onClick={() => removeFilter(chip.key)} className="hover:text-sky-900 ml-0.5">
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </span>
          ))}
          <button onClick={clearAllFilters} className="ml-1 rounded px-1.5 py-1 text-[10px] font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600">Clear all</button>
        </div>
      )}

      {/* ── New Load inline form ── */}
      {showNewForm && (
        <div className="flex-shrink-0 border-b border-gray-200">
          <NewLoadModal onClose={() => setShowNewForm(false)} onSaved={handleLoadSaved} entities={entities} />
        </div>
      )}

      {/* ── Table ── */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 11 }}>
          <colgroup>
            <col style={{ width: 26 }} />
            <col style={{ width: 14 }} />
            {visibleDefs.map(c => <col key={c.key} style={{ width: c.width }} />)}
            <col style={{ width: 76 }} />
          </colgroup>

          <thead className="sticky top-0 z-10">
            {/* Header */}
            <tr className="border-b border-slate-200 bg-slate-50/95 shadow-[0_1px_0_rgba(148,163,184,0.12)] backdrop-blur">
              <th className="px-1 py-1.5 text-center">
                <input type="checkbox" className="w-3 h-3 rounded" />
              </th>
              <th className="px-0 py-1.5" />
              {visibleDefs.map(h => (
                <th key={h.key} className="px-1.5 py-2 text-left font-bold uppercase text-slate-500 whitespace-nowrap" style={{ fontSize: 10 }}>
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
              <th className="relative px-1.5 py-2 text-center font-bold uppercase text-slate-500 whitespace-nowrap" style={{ fontSize: 10 }}>
                <div ref={actionsMenuRef} className="inline-flex items-center justify-center gap-1">
                  ACTIONS
                  <button
                    onClick={() => { setShowActionsMenu(v => !v); setShowCustomize(false) }}
                    title="Table actions"
                    aria-expanded={showActionsMenu}
                    aria-haspopup="menu"
                    className="rounded p-0.5 text-slate-400 transition-colors hover:bg-slate-200/70 hover:text-slate-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  {showActionsMenu && (
                    <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white text-left font-medium normal-case tracking-normal shadow-xl shadow-slate-950/10">
                      {showCustomize ? (
                        <div>
                          <div className="border-b border-slate-100 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Customize loadlist</div>
                          <div className="max-h-56 overflow-auto py-1">
                            {COLUMN_DEFS.map(c => (
                              <label key={c.key} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50">
                                <input type="checkbox" checked={visible(c.key)} onChange={() => toggleCol(c.key)} className="h-3 w-3 rounded" />
                                {c.label}
                              </label>
                            ))}
                          </div>
                          <button onClick={() => setShowCustomize(false)} className="block w-full border-t border-slate-100 px-3 py-2 text-left text-[11px] font-bold text-blue-600 hover:bg-blue-50">Done</button>
                        </div>
                      ) : (
                        <div className="py-1">
                          <MenuItem onClick={() => { clearAllFilters(); setShowActionsMenu(false) }}>Clear All Filters</MenuItem>
                          <MenuItem onClick={() => { applyDefaults(); setShowActionsMenu(false) }}>Default Settings</MenuItem>
                          <MenuItem onClick={() => setShowCustomize(true)}>Customize Loadlist</MenuItem>
                          <MenuItem onClick={exportLoads}>Export Loads</MenuItem>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </th>
            </tr>

            {/* Inline filters */}
            <tr className="border-b border-slate-100 bg-white">
              <td className="px-1 py-0.5" />
              <td className="px-0 py-0.5" />
              {visible('load') && (
                <td className="px-1 py-0.5">
                  <input type="text"
                    onChange={e => {
                      const v = e.target.value; const num = parseInt(v)
                      setFilters(p => ({ ...p, page: 1, load_number: !isNaN(num) && v ? num : undefined }))
                    }}
                    className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:border-blue-400"
                  />
                </td>
              )}
              {visible('date') && (
                <td className="px-1 py-0.5">
                  <input type="date"
                    value={activeFilters.date_from || ''}
                    onChange={e => { setActiveFilters(p => ({ ...p, date_from: e.target.value || undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                    className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:border-blue-400"
                  />
                </td>
              )}
              {visible('driver') && (
                <td className="px-1 py-0.5">
                  <select value={activeFilters.driver_id || ''}
                    onChange={e => { setActiveFilters(p => ({ ...p, driver_id: e.target.value ? parseInt(e.target.value) : undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                    className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none bg-white">
                    <option value="">Choose</option>
                    {entities.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </td>
              )}
              {visible('broker') && (
                <td className="px-1 py-0.5">
                  <select value={activeFilters.broker_id || ''}
                    onChange={e => { setActiveFilters(p => ({ ...p, broker_id: e.target.value ? parseInt(e.target.value) : undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                    className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none bg-white">
                    <option value=""></option>
                    {entities.brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </td>
              )}
              {visible('po') && (
                <td className="px-1 py-0.5">
                  <input type="text"
                    onChange={e => setFilters(p => ({ ...p, page: 1, search: e.target.value || undefined }))}
                    className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:border-blue-400"
                  />
                </td>
              )}
              {visible('pickup') && <td className="px-1 py-0.5"><input readOnly className="w-full border border-gray-100 rounded px-1 py-0.5 text-[11px] bg-gray-50 cursor-not-allowed" /></td>}
              {visible('delivery') && <td className="px-1 py-0.5"><input readOnly className="w-full border border-gray-100 rounded px-1 py-0.5 text-[11px] bg-gray-50 cursor-not-allowed" /></td>}
              {visible('rate') && <td className="px-1 py-0.5"><input readOnly className="w-full border border-gray-100 rounded px-1 py-0.5 text-[11px] bg-gray-50 cursor-not-allowed" /></td>}
              {visible('completed') && (
                <td className="px-1 py-0.5">
                  <input type="date"
                    value={activeFilters.date_to || ''}
                    onChange={e => { setActiveFilters(p => ({ ...p, date_to: e.target.value || undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                    className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none focus:border-blue-400"
                  />
                </td>
              )}
              {visible('status') && (
                <td className="px-1 py-0.5">
                  <select value={activeFilters.status || ''}
                    onChange={e => { setActiveFilters(p => ({ ...p, status: e.target.value || undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                    className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none bg-white">
                    <option value=""></option>
                    {['New','Canceled','TONU','Dispatched','En Route','Picked-up','Delivered','Closed'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
              )}
              {visible('billing') && (
                <td className="px-1 py-0.5">
                  <select value={activeFilters.billing_status || ''}
                    onChange={e => { setActiveFilters(p => ({ ...p, billing_status: e.target.value || undefined })); setFilters(p => ({ ...p, page: 1 })) }}
                    className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none bg-white">
                    <option value=""></option>
                    {['Pending','Canceled','BOL received','Invoiced','Sent to factoring','Funded','Paid'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </td>
              )}
              {visible('notes') && (
                <td className="px-1 py-0.5">
                  <input readOnly className="w-full border border-gray-100 rounded px-1 py-0.5 text-[11px] bg-gray-50 cursor-not-allowed" />
                </td>
              )}
              {visible('attachments') && (
                <td className="px-1 py-0.5">
                  <select value={attachmentType}
                    onChange={e => setAttachmentType(e.target.value)}
                    className="w-full border border-gray-200 rounded px-1 py-0.5 text-[11px] focus:outline-none bg-white">
                    <option value=""></option>
                    {ATTACHMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
              )}
              <td className="px-1 py-0.5 text-center">
                <button onClick={() => setShowFilterPanel(v => !v)} title="More filters" className="text-gray-400 hover:text-gray-600">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4"/></svg>
                </button>
              </td>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={3 + visibleDefs.length} className="py-20 text-center"><div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />Loading loads...</div></td></tr>
            ) : displayLoads.length === 0 ? (
              <tr><td colSpan={3 + visibleDefs.length} className="py-20 text-center"><div className="mx-auto max-w-xs"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h13l5 5v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM16 7v5h5M7 19a2 2 0 104 0m4 0a2 2 0 104 0"/></svg></div><div className="text-sm font-semibold text-slate-700">No loads found</div><p className="mt-1 text-xs text-slate-400">Try adjusting your search or filters.</p><button onClick={clearAllFilters} className="mt-3 text-xs font-semibold text-blue-600 hover:text-blue-700">Clear all filters</button></div></td></tr>
            ) : displayLoads.map(load => {
              const pickup = getPickupStop(load.stops)
              const delivery = getDeliveryStop(load.stops)
              const svcLabel = load.services[0]?.service_type
              const svcAmt = load.services.reduce((s, v) => s + v.invoice_amount, 0)

              return (
                <tr key={load.id} onClick={() => setSelectedLoad(load)}
                  className="group cursor-pointer border-l-2 border-l-transparent transition-colors odd:bg-white even:bg-slate-50/30 hover:border-l-blue-500 hover:bg-blue-50/70">
                  <td className="px-1 py-1 text-center" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" className="w-3 h-3 rounded" />
                  </td>
                  <td className="px-0 py-1">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                  </td>
                  {visible('load') && (
                    <td className="px-1.5 py-1">
                      <button onClick={e => { e.stopPropagation(); setSelectedLoad(load) }}
                        className="text-blue-600 hover:underline font-semibold text-[11px]">
                        {load.load_number}
                      </button>
                    </td>
                  )}
                  {visible('date') && <td className="px-1.5 py-1 text-gray-500 truncate">{formatDate(load.load_date)}</td>}
                  {visible('driver') && (
                    <td className="px-1.5 py-1 text-gray-800 truncate">
                      {load.driver?.name || <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {visible('broker') && (
                    <td className="px-1.5 py-1 truncate">
                      {load.broker
                        ? <button onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline text-left truncate max-w-full">{load.broker.name}</button>
                        : <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {visible('po') && (
                    <td className="px-1.5 py-1 text-gray-500 truncate">
                      {load.po_number || <span className="text-gray-300">—</span>}
                    </td>
                  )}
                  {visible('pickup') && <td className="px-1.5 py-1 text-gray-700 truncate">{stopLabel(pickup)}</td>}
                  {visible('delivery') && <td className="px-1.5 py-1 text-gray-700 truncate">{stopLabel(delivery)}</td>}
                  {visible('rate') && <td className="px-1.5 py-1 font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(load.rate)}</td>}
                  {visible('completed') && <td className="px-1.5 py-1 text-gray-500 truncate">{formatDate(load.actual_delivery_date) || '—'}</td>}
                  {visible('status') && (
                    <td className="px-1.5 py-1">
                      <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${STATUS_STYLE[load.status] || 'bg-gray-100 text-gray-500'}`}>
                        {load.status}
                      </span>
                    </td>
                  )}
                  {visible('billing') && <td className="px-1.5 py-1 text-gray-500 truncate">{load.billing_status}</td>}
                  {visible('notes') && (
                    <td className="px-1.5 py-1 text-gray-400 truncate">
                      {svcAmt > 0 && svcLabel ? `${svcLabel}: ${formatCurrency(svcAmt)}` : <span className="text-gray-200">—</span>}
                    </td>
                  )}
                  {visible('attachments') && (
                    <td className="px-1 py-1 text-center" onClick={e => e.stopPropagation()}>
                      {load.documents.length > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700"
                          title={load.documents.map(d => d.document_type).join(', ')}
                        >
                          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>
                          {load.documents.length}
                        </span>
                      ) : <span className="text-gray-200">—</span>}
                    </td>
                  )}
                  <td className="relative px-0.5 py-1" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-0.5" data-row-menu>
                      {svcLabel && <span className="text-gray-400 truncate text-[10px]">{svcLabel}</span>}
                      <button
                        title="Load actions"
                        aria-haspopup="menu"
                        aria-expanded={rowMenuId === load.id}
                        onClick={() => setRowMenuId(prev => prev === load.id ? null : load.id)}
                        className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${rowMenuId === load.id ? 'bg-blue-100 text-blue-700' : 'text-gray-400 hover:bg-blue-50 hover:text-blue-700'}`}
                      >
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>
                      </button>
                      {rowMenuId === load.id && (
                        <div role="menu" className="absolute right-1 top-full z-20 mt-0.5 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-left shadow-xl shadow-slate-950/10">
                          <MenuItem onClick={() => { setRowMenuId(null); setSelectedLoad(load) }}>Edit Load</MenuItem>
                          <MenuItem onClick={() => { setRowMenuId(null); handleCopyLoad(load) }}>Copy Load</MenuItem>
                          <MenuItem onClick={() => { setRowMenuId(null); showOnMap(load) }}>Show on Map</MenuItem>
                          <button role="menuitem" onClick={() => { setRowMenuId(null); handleDeleteLoad(load) }}
                            className="block w-full px-3 py-2 text-left text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50">
                            Delete Load
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 lg:px-5">
        <div className="flex flex-wrap items-center gap-3">
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
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${showOnlyActive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'}`}>
            {showOnlyActive ? 'Show all loads' : 'Show only active loads'}
          </button>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <span className="px-1.5 text-[10px] font-medium text-slate-400">Rows</span>
          {PAGE_SIZE_OPTIONS.map(n => (
            <button key={n} onClick={() => setFilters(p => ({ ...p, page: 1, page_size: n }))}
              className={`rounded-md px-2 py-1 text-[10px] transition ${(filters.page_size || 50) === n ? 'bg-blue-600 font-bold text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
              {n}
            </button>
          ))}
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

const HIDDEN_COLS_KEY = 'karvan.loads.hiddenCols'

const ATTACHMENT_TYPES = [
  'Confirmation', 'BOL', 'Invoice', 'Merged documents', 'Lumper', 'Receipt', 'Document',
]

const COLUMN_DEFS: { key: string; label: string; sort?: string; align?: 'center'; width: number | string }[] = [
  { key: 'load', label: 'LOAD', sort: 'load_number', width: '5%' },
  { key: 'date', label: 'DATE', sort: 'date', width: '6%' },
  { key: 'driver', label: 'DRIVER', width: '9%' },
  { key: 'broker', label: 'BROKER', width: '8%' },
  { key: 'po', label: 'PO #', sort: 'po_number', width: '5%' },
  { key: 'pickup', label: 'PICKUP', width: '9%' },
  { key: 'delivery', label: 'DELIVERY', width: '9%' },
  { key: 'rate', label: 'RATE', sort: 'rate', width: '6%' },
  { key: 'completed', label: 'COMPLETED', sort: 'completed', width: '6%' },
  { key: 'status', label: 'STATUS', sort: 'status', width: '6%' },
  { key: 'billing', label: 'BILLING', sort: 'billing', width: '6%' },
  { key: 'notes', label: 'NOTES', width: '6%' },
  { key: 'attachments', label: 'ATTACHMENTS', align: 'center', width: '8%' },
]

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button role="menuitem" onClick={onClick}
      className="block w-full px-3 py-2 text-left text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50">
      {children}
    </button>
  )
}

interface FilterPanelEntities {
  drivers: Driver[]
  brokers: Broker[]
  dispatchers: Dispatcher[]
  trucks: Truck[]
  trailers: Trailer[]
}

function FilterPanel({ initial, entities, onApply, onReset, onClose }: {
  initial: LoadFilters
  entities: FilterPanelEntities
  onApply: (f: LoadFilters) => void
  onReset: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<LoadFilters>(initial)
  const set = (patch: Partial<LoadFilters>) => setDraft(p => ({ ...p, ...patch }))
  const num = (v: string) => (v ? parseInt(v) : undefined)

  return (
    <div className="flex-shrink-0 border-b border-slate-200/80 bg-slate-50/60 px-4 py-3.5 lg:px-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Advanced filters</span>
        <button onClick={onClose} aria-label="Close filters" className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200/60 hover:text-slate-600">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        <PanelSelect label="Broker" value={draft.broker_id} onChange={v => set({ broker_id: num(v) })}
          options={entities.brokers.map(b => [String(b.id), b.name])} />
        <PanelSelect label="Driver" value={draft.driver_id} onChange={v => set({ driver_id: num(v) })}
          options={entities.drivers.map(d => [String(d.id), d.name])} />
        <PanelSelect label="Dispatcher" value={draft.dispatcher_id} onChange={v => set({ dispatcher_id: num(v) })}
          options={entities.dispatchers.map(d => [String(d.id), d.name])} />
        <PanelSelect label="Truck" value={draft.truck_id} onChange={v => set({ truck_id: num(v) })}
          options={entities.trucks.map(t => [String(t.id), t.unit_number])} />
        <PanelSelect label="Trailer" value={draft.trailer_id} onChange={v => set({ trailer_id: num(v) })}
          options={entities.trailers.map(t => [String(t.id), t.unit_number])} />
        <PanelSelect label="Status" value={draft.status} onChange={v => set({ status: v || undefined })}
          options={['New','Canceled','TONU','Dispatched','En Route','Picked-up','Delivered','Closed'].map(s => [s, s])} />
        <PanelSelect label="Billing status" value={draft.billing_status} onChange={v => set({ billing_status: v || undefined })}
          options={['Pending','Canceled','BOL received','Invoiced','Sent to factoring','Funded','Paid'].map(s => [s, s])} />
        <PanelSelect label="Direct billing" value={draft.direct_billing === undefined ? '' : String(draft.direct_billing)}
          onChange={v => set({ direct_billing: v === '' ? undefined : v === 'true' })}
          options={[['true', 'Yes'], ['false', 'No']]} />
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Date from</label>
          <input type="date" value={draft.date_from || ''} onChange={e => set({ date_from: e.target.value || undefined })}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Date to</label>
          <input type="date" value={draft.date_to || ''} onChange={e => set({ date_to: e.target.value || undefined })}
            className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200" />
        </div>
      </div>

      <div className="mt-3.5 flex items-center justify-end gap-2">
        <button onClick={onReset}
          className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-semibold text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-700">
          Reset all
        </button>
        <button onClick={onClose}
          className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3.5 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
          Cancel
        </button>
        <button onClick={() => onApply(draft)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-[11px] font-bold text-white shadow-sm transition-colors hover:bg-blue-700">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
          Apply filters
        </button>
      </div>
    </div>
  )
}

function PanelSelect({ label, value, onChange, options }: {
  label: string
  value: string | number | undefined
  onChange: (v: string) => void
  options: Array<[string, string]>
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <select value={value === undefined ? '' : String(value)} onChange={e => onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200">
        <option value="">All</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  )
}

function SummaryStat({ label, value, dot, strong }: { label: string; value: number; dot?: string; strong?: boolean }) {
  return (
    <div className={`flex h-9 items-center gap-2 rounded-lg border px-3 shadow-sm ${strong ? 'border-blue-100 bg-blue-50' : 'border-slate-200 bg-white'}`}>
      {dot && <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />}
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${strong ? 'text-blue-500' : 'text-slate-400'}`}>{label}</span>
      <span className={`whitespace-nowrap text-xs font-bold ${strong ? 'text-blue-800' : 'text-slate-800'}`}>{formatCurrency(value)}</span>
    </div>
  )
}
