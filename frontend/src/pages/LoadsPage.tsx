import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Download, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { loadsApi } from '@/api/loads'
import type { LoadFilters, LoadListItem } from '@/types'
import { useEntities } from '@/hooks/useEntities'
import { formatCurrency, formatDate, getDeliveryStop, getPickupStop, periodToDates, stopLabel, ALL_STATUSES, STATUS_COLORS } from '@/utils'
import LoadModal from '@/components/loads/LoadModal'
import LoadForm from '@/components/loads/LoadForm'
import LoadImportModal from '@/components/loads/LoadImportModal'
import AutoCreateLoadModal from '@/components/loads/AutoCreateLoadModal'
import { documentKind } from '@/components/loads/documents'

const control = 'h-9 rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 text-xs text-slate-800 shadow-sm transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100'
const PERIODS: Array<[string, string]> = [['all', 'All dates'], ['this_week', 'This week'], ['last_week', 'Last week'], ['this_month', 'This month'], ['last_month', 'Last month'], ['this_year', 'This year']]
const PAGE_SIZES = [25, 50, 100]

/** Every load in one table: search, filter, open. Creating and editing both use the same form. */
export default function LoadsPage() {
  const entities = useEntities()
  const [rows, setRows] = useState<LoadListItem[]>([])
  const [totals, setTotals] = useState({ total: 0, pages: 1, rate: 0, pending: 0, invoiced: 0, paid: 0, overdue: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: '', driver_id: '', truck_id: '', period: 'all' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState<'excel' | 'confirmation' | null>(null)
  const [importMenu, setImportMenu] = useState(false)
  const importRef = useRef<HTMLDivElement>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const away = (e: MouseEvent) => { if (importRef.current && !importRef.current.contains(e.target as Node)) setImportMenu(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const query = useMemo<LoadFilters>(() => {
    const dates = filters.period === 'all' ? {} : periodToDates(filters.period)
    return {
      page, page_size: pageSize, sort_by: 'load_number', sort_dir: 'desc',
      search: search.trim() || undefined,
      status: filters.status || undefined,
      driver_id: filters.driver_id ? Number(filters.driver_id) : undefined,
      truck_id: filters.truck_id ? Number(filters.truck_id) : undefined,
      ...dates,
    }
  }, [page, pageSize, search, filters])

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const res = await loadsApi.list(query)
      if (id !== requestId.current) return
      setRows(res.items)
      setTotals({ total: res.total, pages: res.total_pages, rate: res.total_rate, pending: res.total_pending_rate ?? 0, invoiced: res.total_invoiced_rate ?? 0, paid: res.total_paid_rate ?? 0, overdue: res.total_overdue_rate ?? 0 })
    } catch (e) { if (id === requestId.current) toast.error((e as Error).message) }
    finally { if (id === requestId.current) setLoading(false) }
  }, [query])

  // Debounce so typing in search does not fire a request per keystroke
  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t) }, [load, search])
  useEffect(() => { setPage(1) }, [search, filters, pageSize])

  const remove = async (l: LoadListItem) => {
    if (!confirm(`Delete load #${l.po_number || l.load_number}? It will be removed from its weekly statement.`)) return
    try { await loadsApi.delete(l.id); toast.success('Load deleted'); load() }
    catch (e) { toast.error((e as Error).message) }
  }

  const exportCsv = () => {
    const head = ['Load', 'Broker', 'Truck', 'Driver', 'Pickup', 'Pickup date', 'Delivery', 'Delivery date', 'Miles', 'Rate', 'Status']
    const body = rows.map(l => [l.po_number || l.load_number, l.broker?.name || '', l.truck?.unit_number || '', l.driver?.name || '',
      stopLabel(getPickupStop(l.stops)), getPickupStop(l.stops)?.stop_date || '', stopLabel(getDeliveryStop(l.stops)), getDeliveryStop(l.stops)?.stop_date || '',
      l.total_miles || 0, l.rate || 0, l.status])
    const csv = [head, ...body].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `karvan-loads-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const filtered = !!(search || filters.status || filters.driver_id || filters.truck_id || filters.period !== 'all')

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 px-4 py-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Loads</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-bold text-slate-500">{totals.total}</span>
              {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />}
            </div>
            <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">Every load, and the week it belongs to</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Load #, broker or PO…"
                className={`${control} w-56 pl-9`} />
            </div>
            <button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
            <div className="relative" ref={importRef}>
              <button onClick={() => setImportMenu(v => !v)} aria-expanded={importMenu} className="btn-secondary h-9 rounded-lg px-3 text-xs">Import<ChevronDown className="h-3.5 w-3.5" /></button>
              {importMenu && (
                <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-950/10">
                  <button role="menuitem" onClick={() => { setImportMenu(false); setImporting('confirmation') }} className="block w-full px-3 py-2 text-left text-[0.6875rem] font-medium text-slate-700 hover:bg-slate-50">From a rate confirmation</button>
                  <button role="menuitem" onClick={() => { setImportMenu(false); setImporting('excel') }} className="block w-full px-3 py-2 text-left text-[0.6875rem] font-medium text-slate-700 hover:bg-slate-50">From a spreadsheet</button>
                </div>
              )}
            </div>
            <button onClick={() => setCreating(true)} className="btn-primary h-9 rounded-lg px-4 text-xs"><Plus className="h-4 w-4" />New load</button>
          </div>
        </div>

        {/* Money strip */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          <Stat label="Total" value={formatCurrency(totals.rate)} tone="slate" />
          <Stat label="Pending" value={formatCurrency(totals.pending)} tone="amber" />
          <Stat label="Invoiced" value={formatCurrency(totals.invoiced)} tone="blue" />
          <Stat label="Paid" value={formatCurrency(totals.paid)} tone="emerald" />
          <Stat label="Overdue" value={formatCurrency(totals.overdue)} tone={totals.overdue > 0 ? 'red' : 'slate'} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Status" value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })} className={control}>
            <option value="">Every status</option>{ALL_STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select aria-label="Period" value={filters.period} onChange={e => setFilters({ ...filters, period: e.target.value })} className={control}>
            {PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select aria-label="Driver" value={filters.driver_id} onChange={e => setFilters({ ...filters, driver_id: e.target.value })} className={`${control} max-w-[11rem]`}>
            <option value="">All drivers</option>{entities.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select aria-label="Truck" value={filters.truck_id} onChange={e => setFilters({ ...filters, truck_id: e.target.value })} className={control}>
            <option value="">All trucks</option>{entities.trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}
          </select>
          {filtered && <button onClick={() => { setSearch(''); setFilters({ status: '', driver_id: '', truck_id: '', period: 'all' }) }} className="btn-ghost h-9 rounded-lg px-2.5 text-xs">Clear</button>}
          <button onClick={exportCsv} disabled={!rows.length} className="btn-secondary ml-auto h-9 rounded-lg px-3 text-xs"><Download className="h-3.5 w-3.5" />Export</button>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50">
            <tr className="border-b border-slate-200 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">Load</th>
              <th className="px-3 py-2 text-left">Broker</th>
              <th className="px-3 py-2 text-left">Truck / driver</th>
              <th className="px-3 py-2 text-left">Pickup</th>
              <th className="px-3 py-2 text-left">Delivery</th>
              <th className="px-3 py-2 text-right">Miles</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-center">POD</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && rows.length === 0 ? (
              <tr><td colSpan={10} className="py-16 text-center text-slate-400">Loading loads…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="py-16 text-center">
                <div className="text-sm font-semibold text-slate-700">{filtered ? 'No loads match' : 'No loads yet'}</div>
                <p className="mt-1 text-slate-400">{filtered ? 'Try a wider period or clear the filters.' : 'Add the first one to start a weekly statement.'}</p>
              </td></tr>
            ) : rows.map(l => {
              const pu = getPickupStop(l.stops), del = getDeliveryStop(l.stops)
              const pod = (l.documents || []).some(d => documentKind(d) === 'POD')
              return (
                <tr key={l.id} onClick={() => setOpenId(l.id)} className="cursor-pointer transition-colors hover:bg-blue-50/60">
                  <td className="px-3 py-2.5 font-bold text-blue-700">#{l.po_number || l.load_number}</td>
                  <td className="max-w-[12rem] truncate px-3 py-2.5 text-slate-700">{l.broker?.name || <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-slate-900">{l.truck?.unit_number || <span className="font-normal text-slate-300">No truck</span>}</div>
                    <div className="text-[0.6875rem] text-slate-500">{l.driver?.name || 'No driver'}</div>
                  </td>
                  <td className="px-3 py-2.5"><Place label={stopLabel(pu)} date={pu?.stop_date} /></td>
                  <td className="px-3 py-2.5"><Place label={stopLabel(del)} date={del?.stop_date} /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{l.total_miles ? l.total_miles.toLocaleString() : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(l.rate)}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold ${STATUS_COLORS[l.status] || 'bg-slate-100 text-slate-500'}`}>{l.status}</span></td>
                  <td className="px-3 py-2.5 text-center">{pod ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={e => { e.stopPropagation(); remove(l) }} aria-label={`Delete load ${l.po_number || l.load_number}`}
                      className="text-slate-300 transition hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-2.5">
        <span className="text-slate-500">{totals.total === 0 ? 'No loads' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totals.total)} of ${totals.total}`}</span>
        <div className="flex items-center gap-2">
          <select aria-label="Rows per page" value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className={`${control} h-8`}>
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} per page</option>)}
          </select>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="btn-secondary h-8 rounded-lg px-3 text-[0.6875rem]">Previous</button>
          <span className="tabular-nums text-slate-600">{page} / {totals.pages}</span>
          <button onClick={() => setPage(p => Math.min(totals.pages, p + 1))} disabled={page >= totals.pages} className="btn-secondary h-8 rounded-lg px-3 text-[0.6875rem]">Next</button>
        </div>
      </div>

      {openId != null && <LoadModal loadId={openId} entities={entities} onClose={() => setOpenId(null)} onSaved={load} />}
      {creating && <LoadForm entities={entities} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />}
      {importing === 'excel' && <LoadImportModal onClose={() => setImporting(null)} onImported={() => { setImporting(null); load() }} />}
      {importing === 'confirmation' && <AutoCreateLoadModal entities={entities} onClose={() => setImporting(null)} onSaved={() => { setImporting(null); load() }} />}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'slate' | 'amber' | 'blue' | 'emerald' | 'red' }) {
  const tones = { slate: 'text-slate-950', amber: 'text-amber-700', blue: 'text-blue-700', emerald: 'text-emerald-700', red: 'text-red-600' }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-sm font-bold tabular-nums ${tones[tone]}`}>{value}</div>
    </div>
  )
}

function Place({ label, date }: { label: string; date?: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-slate-800">{label}</span>
      <span className="text-[0.6875rem] text-slate-400">{date ? formatDate(date) : '—'}</span>
    </span>
  )
}
