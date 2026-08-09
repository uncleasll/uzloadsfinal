import { useState, useEffect, useRef } from 'react'
import { trucksApi, driversApi } from '@/api/entities'
import type { Truck, TruckDocument } from '@/types'
import type { Driver } from '@/types'
import toast from 'react-hot-toast'

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
const ELD_PROVIDERS = ['','Samsara','KeepTruckin','Omnitracs','PeopleNet','BigRoad','Rand McNally','Other']
const DOC_TYPES = [
  { key: 'annual_inspection', label: 'Annual Inspection', hasNameNotes: false },
  { key: 'registration',      label: 'Registration',      hasNameNotes: false },
  { key: 'repairs',           label: 'Repairs & Maintenance', hasNameNotes: true },
  { key: 'other',             label: 'Other',             hasNameNotes: true },
]

const IcoWarn  = () => <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
const IcoOk    = () => <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
const IcoX     = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const IcoCheck = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
const IcoDn    = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>

const TRUCK_COLUMN_DEFS: { key: string; label: string; sortable?: boolean; width: string }[] = [
  { key: 'unit',      label: 'UNIT',      sortable: true, width: '9%' },
  { key: 'year',      label: 'YEAR',      sortable: true, width: '6%' },
  { key: 'make',      label: 'MAKE',      sortable: true, width: '9%' },
  { key: 'model',     label: 'MODEL',     sortable: true, width: '9%' },
  { key: 'vin',       label: 'VIN',       sortable: true, width: '14%' },
  { key: 'plate',     label: 'PLATE',     sortable: true, width: '9%' },
  { key: 'driver',    label: 'DRIVER',    sortable: true, width: '13%' },
  { key: 'eld',       label: 'ELD',       sortable: true, width: '8%' },
  { key: 'ownership', label: 'OWNERSHIP', sortable: true, width: '8%' },
  { key: 'status',    label: 'STATUS',    sortable: true, width: '7%' },
  { key: 'docs',      label: 'DOCUMENTS', width: '9%' },
]

function truckSortVal(t: Truck, key: string): string | number {
  switch (key) {
    case 'unit':      return t.unit_number || ''
    case 'year':      return t.year ?? 0
    case 'make':      return t.make || ''
    case 'model':     return t.model || ''
    case 'vin':       return t.vin || ''
    case 'plate':     return t.plate || ''
    case 'driver':    return t.driver?.name || ''
    case 'eld':       return t.eld_provider || ''
    case 'ownership': return t.ownership || ''
    case 'status':    return t.is_active ? 'Active' : 'Inactive'
    default:          return ''
  }
}

function RowActionMenu({ onEdit, onDelete, editLabel, deleteLabel }: {
  onEdit: () => void; onDelete: () => void; editLabel: string; deleteLabel: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative flex items-center justify-center">
      <button onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={'inline-flex h-6 w-6 items-center justify-center rounded transition-colors ' +
          (open ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-blue-50 hover:text-blue-700')}>
        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5H7z"/></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-0.5 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-xl shadow-slate-950/10">
          <button role="menuitem" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onEdit() }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50">
            <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            {editLabel}
          </button>
          <button role="menuitem" onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDelete() }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-medium text-red-600 transition-colors hover:bg-red-50">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            {deleteLabel}
          </button>
        </div>
      )}
    </div>
  )
}

function emptyForm(): Partial<Truck> {
  return { unit_number:'', vin:'', eld_provider:'', eld_id:'', year: undefined, make:'', model:'', ownership:'Owned', is_active:true, driver_id:undefined, plate:'', plate_state:'', purchase_date:'', purchase_price:undefined, notes:'' }
}

export default function TrucksPage() {
  const [trucks, setTrucks]     = useState<Truck[]>([])
  const [drivers, setDrivers]   = useState<Driver[]>([])
  const [loading, setLoading]   = useState(true)
  const [editTruck, setEditTruck] = useState<Truck|null>(null)
  const [showNew, setShowNew]   = useState(false)
  const [search, setSearch]     = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [sortKey, setSortKey]   = useState('unit')
  const [sortDir, setSortDir]   = useState<'asc'|'desc'>('asc')

  const load = () => {
    setLoading(true)
    trucksApi.list().then(setTrucks).catch(e=>toast.error(e.message)).finally(()=>setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => { driversApi.list().then(setDrivers).catch(()=>{}) }, [])

  const handleRowClick = (t: Truck) => {
    trucksApi.get(t.id).then(full => { setEditTruck(full); setShowNew(false) }).catch(e=>toast.error(e.message))
  }

  const handleDelete = (t: Truck) => {
    if (!confirm(`Delete truck "${t.unit_number}"?\n\nThe truck will be deactivated and hidden from the list.`)) return
    trucksApi.delete(t.id)
      .then(() => { toast.success('Truck deleted'); load() })
      .catch(e => toast.error(e.message))
  }

  const hasDocWarning = (t: Truck) => {
    const docs = t.documents || []
    const ai = docs.find(d=>d.doc_type==='annual_inspection')
    const reg = docs.find(d=>d.doc_type==='registration')
    return !ai?.exp_date || !reg?.exp_date
  }

  const sortBy = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const q = search.trim().toLowerCase()
  const filtered = trucks
    .filter(t => showInactive || t.is_active)
    .filter(t => !q || [t.unit_number, t.vin, t.make, t.model, t.plate, t.driver?.name]
      .filter(Boolean).some(v => String(v).toLowerCase().includes(q)))
  const sorted = [...filtered].sort((a, b) => {
    const va = truckSortVal(a, sortKey), vb = truckSortVal(b, sortKey)
    const cmp = typeof va === 'number' && typeof vb === 'number'
      ? va - vb
      : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base', numeric: true })
    return sortDir === 'asc' ? cmp : -cmp
  })
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)
  const startEntry = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const endEntry = Math.min(safePage * pageSize, sorted.length)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[11px] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 py-4 lg:px-5">
        <div className="mr-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-950">Trucks</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{filtered.length}</span>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">Fleet units, documents and assignments</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative min-w-[220px] flex-1 sm:flex-none">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35"/></svg>
            <input type="search" placeholder="Search trucks..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-xs text-slate-800 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-64" />
          </div>
          <button onClick={()=>{setShowNew(true);setEditTruck(null)}} className="btn-primary h-9 rounded-lg px-4 text-xs">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5"/></svg>
            New truck
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 11 }}>
          <colgroup>
            {TRUCK_COLUMN_DEFS.map(c => <col key={c.key} style={{ width: c.width }} />)}
            <col style={{ width: 76 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-200 bg-slate-50/95 shadow-[0_1px_0_rgba(148,163,184,0.12)] backdrop-blur">
              {TRUCK_COLUMN_DEFS.map(h => (
                <th key={h.key} className="px-1.5 py-2 text-left font-bold uppercase text-slate-500 whitespace-nowrap" style={{ fontSize: 10 }}>
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
              <tr><td colSpan={TRUCK_COLUMN_DEFS.length + 1} className="py-20 text-center"><div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />Loading trucks...</div></td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={TRUCK_COLUMN_DEFS.length + 1} className="py-20 text-center"><div className="mx-auto max-w-xs"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 7h13l5 5v5a2 2 0 01-2 2H5a2 2 0 01-2-2V7zM16 7v5h5M7 19a2 2 0 104 0m4 0a2 2 0 104 0"/></svg></div><div className="text-sm font-semibold text-slate-700">No trucks found</div><p className="mt-1 text-xs text-slate-400">Try adjusting your search.</p></div></td></tr>
            ) : paged.map(t => {
              const warn = hasDocWarning(t)
              return (
                <tr key={t.id} onClick={()=>handleRowClick(t)}
                  className={'group cursor-pointer border-l-2 border-l-transparent transition-colors odd:bg-white even:bg-slate-50/30 ' + (warn ? 'hover:border-l-amber-400 hover:bg-amber-50/70' : 'hover:border-l-blue-500 hover:bg-blue-50/70')}>
                  <td className="px-1.5 py-1">
                    <div className="flex items-center gap-1 min-w-0">
                      {warn ? <span className="flex-shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5"><IcoWarn/></span> : <span className="flex-shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5"><IcoOk/></span>}
                      <span className="font-semibold text-blue-600 truncate hover:underline text-[11px]">
                        {t.unit_number}
                        {!t.is_active && <span className="ml-1 text-[10px] font-normal text-slate-400">(inactive)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-1.5 py-1 text-gray-600">{t.year || <span className="text-gray-300">—</span>}</td>
                  <td className="px-1.5 py-1 text-gray-600 truncate">{t.make || <span className="text-gray-300">—</span>}</td>
                  <td className="px-1.5 py-1 text-gray-600 truncate">{t.model || <span className="text-gray-300">—</span>}</td>
                  <td className="px-1.5 py-1 font-mono text-gray-600 truncate">{t.vin || <span className="text-gray-300">—</span>}</td>
                  <td className="px-1.5 py-1 font-mono text-gray-600 truncate">{t.plate ? `${t.plate}${t.plate_state ? ` (${t.plate_state})` : ''}` : <span className="text-gray-300">—</span>}</td>
                  <td className="px-1.5 py-1 text-gray-600 truncate">{t.driver?.name || <span className="text-gray-300">—</span>}</td>
                  <td className="px-1.5 py-1 text-gray-600 truncate">{t.eld_provider || <span className="text-gray-300">—</span>}</td>
                  <td className="px-1.5 py-1 text-gray-600">{t.ownership || <span className="text-gray-300">—</span>}</td>
                  <td className="px-1.5 py-1">
                    <span className={'inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-semibold ' + (t.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500')}>
                      {t.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-1.5 py-1">
                    {warn
                      ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-current" />Docs missing</span>
                      : <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-current" />Complete</span>}
                  </td>
                  <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
                    <RowActionMenu
                      onEdit={() => handleRowClick(t)}
                      onDelete={() => handleDelete(t)}
                      editLabel="Edit Truck"
                      deleteLabel="Delete Truck"
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 lg:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-0.5">
            <button onClick={() => setPage(1)} disabled={safePage <= 1} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></button>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage <= 1} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => { const s = Math.max(1, Math.min(safePage - 2, totalPages - 4)); return s + i }).map(p => (
              <button key={p} onClick={() => setPage(p)} className={`w-5 h-5 rounded text-[11px] font-medium transition-colors ${p === safePage ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
            ))}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></button>
            <button onClick={() => setPage(totalPages)} disabled={safePage >= totalPages} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
          </div>
          <span className="text-[11px] text-gray-500">Showing {startEntry}–{endEntry} of {sorted.length} entries</span>
          <button onClick={() => { setShowInactive(v => !v); setPage(1) }}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${showInactive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'}`}>
            {showInactive ? 'Hide inactive trucks' : 'Show inactive trucks'}
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <span className="px-1.5 text-[10px] font-medium text-slate-400">Rows</span>
          {[10, 25, 50, 100].map(n => (
            <button key={n} onClick={() => { setPageSize(n); setPage(1) }}
              className={`rounded-md px-2 py-1 text-[10px] transition ${pageSize === n ? 'bg-blue-600 font-bold text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Slide panel */}
      {(editTruck || showNew) && (
        <TruckPanel
          truck={editTruck}
          drivers={drivers}
          onClose={()=>{setEditTruck(null);setShowNew(false)}}
          onSaved={()=>{load();setEditTruck(null);setShowNew(false)}}
        />
      )}
    </div>
  )
}

// ── Truck Panel (slide from right) ────────────────────────────────────────────
function TruckPanel({ truck, drivers, onClose, onSaved }: {
  truck: Truck|null; drivers: Driver[]; onClose:()=>void; onSaved:()=>void
}) {
  const isNew = !truck
  const [form, setForm] = useState<Partial<Truck>>(truck ? {...truck} : emptyForm())
  const [saving, setSaving] = useState(false)
  const [docs, setDocs] = useState<TruckDocument[]>(truck?.documents||[])

  useEffect(()=>{
    setForm(truck ? {...truck} : emptyForm())
    setDocs(truck?.documents||[])
  },[truck])

  const sf = (k: keyof Truck, v: any) => setForm(p=>({...p,[k]:v}))

  const handleSave = () => {
    if (!form.unit_number?.trim()) { toast.error('Unit number is required'); return }
    if (!form.year) { toast.error('Year is required'); return }
    if (!form.make?.trim()) { toast.error('Make is required'); return }
    setSaving(true)
    const payload = {
      ...form,
      year: form.year ? parseInt(String(form.year)) : undefined,
      purchase_price: form.purchase_price ? parseFloat(String(form.purchase_price)) : undefined,
      purchase_date: form.purchase_date || undefined,
      driver_id: form.driver_id || undefined,
    }
    const p = isNew ? trucksApi.create(payload) : trucksApi.update(truck!.id, payload)
    p.then(()=>{ toast.success(isNew?'Truck created':'Truck saved'); onSaved() })
     .catch(e=>toast.error(e.message))
     .finally(()=>setSaving(false))
  }

  const handleToggleActive = () => {
    if (!truck) return
    trucksApi.update(truck.id, { is_active: !form.is_active })
      .then(()=>{ sf('is_active', !form.is_active); toast.success('Status updated') })
      .catch(e=>toast.error(e.message))
  }

  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose}/>
      <div className="w-[1100px] bg-white flex flex-col h-full shadow-2xl overflow-hidden border-l border-gray-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-bold text-gray-900">{isNew ? 'New Truck' : 'Edit Truck'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"><IcoX/></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Row 1: Unit, Vin, ELD Provider, ELD ID */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Unit <span className="text-red-500">*</span></label>
              <input value={form.unit_number||''} onChange={e=>sf('unit_number',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="TRK001"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Vin <span className="text-red-500">*</span></label>
              <input value={form.vin||''} onChange={e=>sf('vin',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="1HGCM82633A123456"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">ELD Provider</label>
              <div className="relative">
                <select value={form.eld_provider||''} onChange={e=>sf('eld_provider',e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500 appearance-none">
                  {ELD_PROVIDERS.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
                <IcoDn/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">ELD ID</label>
              <input value={form.eld_id||''} onChange={e=>sf('eld_id',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500"/>
            </div>
          </div>

          {/* Row 2: Year, Make, Model | Ownership, Active toggle */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Year <span className="text-red-500">*</span></label>
              <input type="number" value={form.year||''} onChange={e=>sf('year',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="2020"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Make <span className="text-red-500">*</span></label>
              <input value={form.make||''} onChange={e=>sf('make',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="Volvo"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Model</label>
              <input value={form.model||''} onChange={e=>sf('model',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="VNL 760"/>
            </div>
            <div className="flex flex-col gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Ownership</label>
                <div className="relative">
                  <select value={form.ownership||'Owned'} onChange={e=>sf('ownership',e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500 appearance-none">
                    <option>Owned</option><option>Leased</option>
                  </select>
                  <IcoDn/>
                </div>
              </div>
              <div>
                <span className="block text-xs font-semibold text-gray-600 mb-1">{form.is_active ? 'Active' : 'Inactive'}</span>
                <button onClick={handleToggleActive} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  {form.is_active ? 'Make inactive' : 'Make active'}
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                </button>
              </div>
            </div>
          </div>

          {/* Row 3: Driver, Plate, Plate state | Purchase Date, Purchase Price */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Driver</label>
              <div className="relative">
                <select value={form.driver_id||''} onChange={e=>sf('driver_id',e.target.value?parseInt(e.target.value):undefined)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500 appearance-none">
                  <option value=""></option>
                  {drivers.map(d=><option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}
                </select>
                <IcoDn/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Plate</label>
              <input value={form.plate||''} onChange={e=>sf('plate',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-500" placeholder="TX93827"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Plate state</label>
              <div className="relative">
                <select value={form.plate_state||''} onChange={e=>sf('plate_state',e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-500 appearance-none">
                  <option value=""></option>
                  {US_STATES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <IcoDn/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Date</label>
                <div className="flex items-center gap-1 border border-gray-300 rounded px-2 py-2 focus-within:border-blue-500">
                  <input type="date" value={form.purchase_date||''} onChange={e=>sf('purchase_date',e.target.value)}
                    className="flex-1 text-xs focus:outline-none"/>
                  {form.purchase_date && <button onClick={()=>sf('purchase_date','')} className="text-gray-400 hover:text-gray-600"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Price</label>
                <div className="flex items-center border border-gray-300 rounded px-2 py-2 focus-within:border-blue-500">
                  <span className="text-gray-400 text-sm mr-1">$</span>
                  <input type="number" value={form.purchase_price||''} onChange={e=>sf('purchase_price',e.target.value)}
                    className="flex-1 text-sm focus:outline-none" placeholder="0"/>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes||''} onChange={e=>sf('notes',e.target.value)} rows={3}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-500"/>
          </div>

          {/* Documents */}
          <div>
            <h3 className="text-base font-bold text-gray-900 mb-3">Documents</h3>
            <div className="space-y-2">
              {DOC_TYPES.map(dt => (
                <DocSection key={dt.key} docType={dt} docs={docs.filter(d=>d.doc_type===dt.key)}
                  truckId={truck?.id} isNew={isNew}
                  onSaved={(newDoc)=>setDocs(prev=>{const without=prev.filter(d=>d.id!==newDoc.id);return [...without,newDoc]})}
                  onDeleted={(id)=>setDocs(prev=>prev.filter(d=>d.id!==id))}/>
              ))}
            </div>
          </div>

          {/* History */}
          <div>
            <h3 className="text-base font-bold text-gray-900 mb-2">History</h3>
            <div className="border border-gray-200 rounded p-3 text-xs text-gray-400 min-h-[60px]">
              {isNew ? 'History will appear after saving.' : 'No history entries.'}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold rounded">
            <IcoX/> Close
          </button>
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded disabled:opacity-50">
            <IcoCheck/> {saving?'Saving…':'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Document Section ──────────────────────────────────────────────────────────
function DocSection({ docType, docs, truckId, isNew, onSaved, onDeleted }: {
  docType: { key: string; label: string; hasNameNotes: boolean }
  docs: TruckDocument[]; truckId?: number; isNew: boolean
  onSaved: (d: TruckDocument)=>void; onDeleted: (id:number)=>void
}) {
  const [expanded, setExpanded] = useState(true)
  const [rowForm, setRowForm] = useState({ issue_date:'', exp_date:'', name:'', notes:'', attachments:'' })
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const hasDoc = docs.length > 0
  const hasDates = docs.some(d=>d.issue_date||d.exp_date)

  const handleSave = () => {
    if (!truckId) { toast.error('Save the truck first'); return }
    setSaving(true)
    trucksApi.addDocument(truckId, { doc_type: docType.key, ...rowForm, issue_date: rowForm.issue_date||undefined, exp_date: rowForm.exp_date||undefined })
      .then(d=>{ onSaved(d); setRowForm({ issue_date:'', exp_date:'', name:'', notes:'', attachments:'' }); toast.success('Document saved') })
      .catch(e=>toast.error(e.message))
      .finally(()=>setSaving(false))
  }

  return (
    <div className="border border-gray-200 rounded">
      {/* Section header */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-white">
        {hasDoc && hasDates ? <IcoOk/> : <IcoWarn/>}
        <span className="text-sm font-semibold text-gray-800">{docType.label}</span>
        <span className="text-gray-400 text-sm">-</span>
        {!hasDoc && <span className="text-xs text-amber-500">(No documents)</span>}
        <div className="flex-1"/>
        <button onClick={()=>setExpanded(v=>!v)} className="text-gray-400 hover:text-gray-600">
          <svg className={'w-4 h-4 transition-transform '+(expanded?'':'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-3 py-3">
          {/* Existing docs */}
          {docs.map(doc=>(
            <div key={doc.id} className="flex items-center gap-2 mb-2 text-xs text-gray-600 group">
              <span>{doc.issue_date||'—'}</span>
              <span>{doc.exp_date||'—'}</span>
              {docType.hasNameNotes && <span>{doc.name||'—'}</span>}
              {docType.hasNameNotes && <span>{doc.notes||'—'}</span>}
              {doc.original_filename && <span className="text-blue-600 hover:underline cursor-pointer truncate max-w-[200px]">{doc.original_filename}</span>}
              <button onClick={()=>{ if(truckId) trucksApi.deleteDocument(truckId,doc.id).then(()=>onDeleted(doc.id)).catch(e=>toast.error(e.message)) }}
                className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 ml-1">✕</button>
            </div>
          ))}

          {/* Add form row */}
          <div className="flex items-center gap-2 mt-1">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Issue Date</label>
              <input type="date" value={rowForm.issue_date} onChange={e=>setRowForm(p=>({...p,issue_date:e.target.value}))}
                className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 w-32" placeholder="MM/DD/YYYY"/>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Exp Date</label>
              <input type="date" value={rowForm.exp_date} onChange={e=>setRowForm(p=>({...p,exp_date:e.target.value}))}
                className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 w-32" placeholder="MM/DD/YYYY"/>
            </div>
            {docType.hasNameNotes && (
              <>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Name</label>
                  <input value={rowForm.name} onChange={e=>setRowForm(p=>({...p,name:e.target.value}))}
                    className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 w-28"/>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Notes</label>
                  <input value={rowForm.notes} onChange={e=>setRowForm(p=>({...p,notes:e.target.value}))}
                    className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 w-36"/>
                </div>
              </>
            )}
            <div className="flex flex-col gap-0.5 flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Attachments</label>
              <input className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500 w-full" readOnly placeholder=""/>
            </div>
            <input type="file" ref={fileRef} className="hidden"/>
            <button onClick={()=>fileRef.current?.click()} className="text-xs text-gray-400 hover:text-gray-600 mt-4 whitespace-nowrap">upload</button>
            <button onClick={handleSave} disabled={saving||isNew}
              title={isNew?'Save the truck first':''}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded disabled:opacity-40 mt-4 whitespace-nowrap">
              <IcoCheck/> Save
            </button>
            <button onClick={()=>setRowForm({ issue_date:'', exp_date:'', name:'', notes:'', attachments:'' })}
              className="text-xs text-gray-500 hover:text-gray-700 mt-4 whitespace-nowrap">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
