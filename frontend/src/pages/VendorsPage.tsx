import { useState, useEffect, useCallback } from 'react'
import { vendorsApi } from '@/api/vendors'
import type { Vendor } from '@/api/vendors'
import toast from 'react-hot-toast'

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'
]

function clsx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

// Icons
const IcoPlus  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
const IcoEdit  = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
const IcoX     = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const IcoChk   = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
const IcoSearch = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
const PhoneIcon = () => <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
const InfoIcon = () => <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-[#3b82f6]"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 11v4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>

function PagBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={disabled} className="flex h-5 w-5 items-center justify-center rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">{children}</button>
}

const VENDOR_COLUMN_DEFS: { key: string; label: string; sortable?: boolean; width: string }[] = [
  { key: 'company', label: 'COMPANY NAME', sortable: true, width: '18%' },
  { key: 'type',    label: 'TYPE',         sortable: true, width: '10%' },
  { key: 'phone',   label: 'PHONE',        sortable: true, width: '9%' },
  { key: 'email',   label: 'EMAIL',        sortable: true, width: '14%' },
  { key: 'address', label: 'ADDRESS',      sortable: true, width: '13%' },
  { key: 'city',    label: 'CITY',         sortable: true, width: '8%' },
  { key: 'state',   label: 'STATE',        sortable: true, width: '6%' },
  { key: 'eq',      label: 'EQ. OWNER',    width: '7%' },
  { key: 'payee',   label: 'ADD. PAYEE',   width: '7%' },
]

function vendorSortVal(v: Vendor, key: string): string {
  switch (key) {
    case 'company': return v.company_name || ''
    case 'type':    return v.vendor_type || ''
    case 'phone':   return v.phone || ''
    case 'email':   return v.email || ''
    case 'address': return v.address || ''
    case 'city':    return v.city || ''
    case 'state':   return v.state || ''
    default:        return ''
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
        className={clsx('inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
          open ? 'bg-blue-100 text-blue-700' : 'text-slate-400 hover:bg-blue-50 hover:text-blue-700')}>
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

type VendorForm = {
  company_name: string; vendor_type: string
  address: string; address2: string; city: string; state: string; zip_code: string
  phone: string; email: string; fid_ein: string; mc_number: string; notes: string
  is_equipment_owner: boolean; is_additional_payee: boolean
  additional_payee_rate_pct: string; settlement_template_type: string
}

function emptyVendorForm(): VendorForm {
  return {
    company_name: '', vendor_type: '',
    address: '', address2: '', city: '', state: '', zip_code: '',
    phone: '', email: '', fid_ein: '', mc_number: '', notes: '',
    is_equipment_owner: false, is_additional_payee: false,
    additional_payee_rate_pct: '', settlement_template_type: '',
  }
}

function vendorToForm(v: Vendor): VendorForm {
  return {
    company_name: v.company_name,
    vendor_type: v.vendor_type || '',
    address: v.address || '', address2: v.address2 || '',
    city: v.city || '', state: v.state || '', zip_code: v.zip_code || '',
    phone: v.phone || '', email: v.email || '',
    fid_ein: v.fid_ein || '', mc_number: v.mc_number || '', notes: v.notes || '',
    is_equipment_owner: v.is_equipment_owner,
    is_additional_payee: v.is_additional_payee,
    additional_payee_rate_pct: v.additional_payee_rate_pct ? String(v.additional_payee_rate_pct) : '',
    settlement_template_type: v.settlement_template_type || '',
  }
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editVendor, setEditVendor] = useState<Vendor | 'new' | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [sortKey, setSortKey] = useState('company')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const sortBy = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: { search?: string; is_active?: boolean } = {}
      if (search) params.search = search
      if (!showInactive) params.is_active = true
      const data = await vendorsApi.list(params)
      setVendors(data)
    } catch (e: unknown) { toast.error((e as Error).message) }
    finally { setLoading(false) }
  }, [search, showInactive])

  useEffect(() => { load() }, [load])

  const total = vendors.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const sortedVendors = [...vendors].sort((a, b) => {
    const cmp = vendorSortVal(a, sortKey).localeCompare(vendorSortVal(b, sortKey), undefined, { sensitivity: 'base' })
    return sortDir === 'asc' ? cmp : -cmp
  })
  const paged = sortedVendors.slice((page - 1) * pageSize, page * pageSize)
  const startEntry = total === 0 ? 0 : (page - 1) * pageSize + 1
  const endEntry = Math.min(page * pageSize, total)

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Deactivate vendor "${name}"?`)) return
    try {
      await vendorsApi.delete(id)
      toast.success('Vendor deactivated')
      load()
    } catch (e: unknown) { toast.error((e as Error).message) }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[11px] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 py-4 lg:px-5">
        <div className="mr-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-950">Vendors</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{total}</span>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">Repair shops, payees and other service providers</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="relative min-w-[220px] flex-1 sm:flex-none">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><IcoSearch /></span>
            <input type="search" placeholder="Search vendors..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-xs text-slate-800 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-64" />
          </div>
          <button onClick={() => setEditVendor('new')} className="btn-primary h-9 rounded-lg px-4 text-xs">
            <IcoPlus /> New vendor
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 11 }}>
          <colgroup>
            {VENDOR_COLUMN_DEFS.map(c => <col key={c.key} style={{ width: c.width }} />)}
            <col style={{ width: 76 }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-200 bg-slate-50/95 shadow-[0_1px_0_rgba(148,163,184,0.12)] backdrop-blur">
              {VENDOR_COLUMN_DEFS.map(h => (
                <th key={h.key} className={`px-1.5 py-2 font-bold uppercase text-slate-500 whitespace-nowrap ${h.key === 'eq' || h.key === 'payee' ? 'text-center' : 'text-left'}`} style={{ fontSize: 10 }}>
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
              <tr><td colSpan={VENDOR_COLUMN_DEFS.length + 1} className="py-20 text-center"><div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />Loading vendors...</div></td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={VENDOR_COLUMN_DEFS.length + 1} className="py-20 text-center"><div className="mx-auto max-w-xs"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg></div><div className="text-sm font-semibold text-slate-700">No vendors found</div><p className="mt-1 text-xs text-slate-400">Try adjusting your search.</p></div></td></tr>
            ) : paged.map(v => (
              <tr key={v.id}
                className="group cursor-pointer border-l-2 border-l-transparent transition-colors odd:bg-white even:bg-slate-50/30 hover:border-l-blue-500 hover:bg-blue-50/70"
                onClick={() => setEditVendor(v)}>
                <td className="px-1.5 py-1">
                  <span className="font-semibold text-blue-600 truncate hover:underline text-[11px] block">{v.company_name}</span>
                </td>
                <td className="px-1.5 py-1">
                  {v.vendor_type ? (
                    <span className="inline-block whitespace-nowrap rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {v.vendor_type}
                    </span>
                  ) : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-1.5 py-1 text-gray-600 truncate">{v.phone || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-gray-600 truncate">{v.email || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-gray-600 truncate">{v.address || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-gray-600 truncate">{v.city || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-gray-600">{v.state || <span className="text-gray-300">—</span>}</td>
                <td className="px-1.5 py-1 text-center">
                  {v.is_equipment_owner
                    ? <svg className="mx-auto h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-1.5 py-1 text-center">
                  {v.is_additional_payee
                    ? <svg className="mx-auto h-3.5 w-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-1 py-1" onClick={e => e.stopPropagation()}>
                  <RowActionMenu
                    onEdit={() => setEditVendor(v)}
                    onDelete={() => handleDelete(v.id, v.company_name)}
                    editLabel="Edit Vendor"
                    deleteLabel="Delete Vendor"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 lg:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-0.5">
            <PagBtn onClick={() => setPage(1)} disabled={page <= 1}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></PagBtn>
            <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></PagBtn>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => { const s = Math.max(1, Math.min(page - 2, totalPages - 4)); return s + i }).map(p => (
              <button key={p} onClick={() => setPage(p)} className={`w-5 h-5 rounded text-[11px] font-medium transition-colors ${p === page ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
            ))}
            <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></PagBtn>
            <PagBtn onClick={() => setPage(totalPages)} disabled={page >= totalPages}><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></PagBtn>
          </div>
          <span className="text-[11px] text-gray-500">Showing {startEntry}–{endEntry} of {total} entries</span>
          <button onClick={() => { setShowInactive(v => !v); setPage(1) }}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${showInactive ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-700'}`}>
            {showInactive ? 'Hide inactive vendors' : 'Show inactive vendors'}
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

      {editVendor !== null && (
        <VendorModal
          vendor={editVendor === 'new' ? undefined : editVendor}
          onClose={() => setEditVendor(null)}
          onSaved={() => { setEditVendor(null); load() }}
        />
      )}
    </div>
  )
}

// ─── Main VendorModal ────────────────────────────────────────────────────────
function VendorModal({ vendor, onClose, onSaved }: {
  vendor?: Vendor; onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!vendor
  const [form, setForm] = useState<VendorForm>(vendor ? vendorToForm(vendor) : emptyVendorForm())
  const [saving, setSaving] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false) // Controls the nested modal
  
  const set = (k: keyof VendorForm, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.company_name.trim()) { toast.error('Company name is required'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        additional_payee_rate_pct: form.additional_payee_rate_pct ? parseFloat(form.additional_payee_rate_pct) : undefined,
        is_active: true,
      }
      if (isEdit && vendor) {
        await vendorsApi.update(vendor.id, payload)
        toast.success('Vendor updated')
      } else {
        await vendorsApi.create(payload)
        toast.success('Vendor created')
      }
      onSaved()
    } catch (e: unknown) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[95vh] w-full max-w-[1100px] flex-col overflow-hidden rounded bg-white shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-[#f8f9fb] px-6 py-3">
          <h2 className="text-[16px] font-bold text-gray-800">{isEdit ? 'Edit Vendor' : 'New Vendor'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <IcoX />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="flex flex-col gap-10 md:flex-row">
            
            {/* LEFT COLUMN - General Info */}
            <div className="flex flex-1 flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-gray-700">
                  Company Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={form.company_name}
                  onChange={(e) => set('company_name', e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#2563eb] focus:ring-1 focus:ring-[#2563eb]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Address line 2</label>
                <input
                  value={form.address2}
                  onChange={(e) => set('address2', e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Phone</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <PhoneIcon />
                    </span>
                    <input
                      value={form.phone}
                      onChange={(e) => set('phone', e.target.value)}
                      className="h-[36px] w-full rounded border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#2563eb]"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Email</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                      @
                    </span>
                    <input
                      value={form.email}
                      onChange={(e) => set('email', e.target.value)}
                      className="h-[36px] w-full rounded border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#2563eb]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">City</label>
                  <input
                    value={form.city}
                    onChange={(e) => set('city', e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">State</label>
                  <select
                    value={form.state}
                    onChange={(e) => set('state', e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#2563eb]"
                  >
                    <option value=""></option>
                    {STATES.map((state) => (
                      <option key={state} value={state}>{state}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Zip</label>
                  <input
                    value={form.zip_code}
                    onChange={(e) => set('zip_code', e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">FID/EIN</label>
                  <input
                    value={form.fid_ein}
                    onChange={(e) => set('fid_ein', e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">MC</label>
                  <input
                    value={form.mc_number}
                    onChange={(e) => set('mc_number', e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#2563eb]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb]"
                />
              </div>
            </div>

            {/* RIGHT COLUMN - Settings / Billing */}
            <div className="w-full md:w-[420px] flex flex-col pt-1">
              
              {/* Vendor Type Section */}
              <div className="mb-10">
                <h3 className="mb-3 text-[16px] font-bold text-gray-800">Vendor type</h3>
                
                {/* Shows the selected vendor type badge if one exists */}
                {form.vendor_type && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                      {form.vendor_type}
                      <button onClick={() => set('vendor_type', '')} className="text-gray-400 hover:text-red-500">
                        <IcoX />
                      </button>
                    </span>
                  </div>
                )}
                
                <button 
                  onClick={() => setShowTypeModal(true)} 
                  className="inline-flex h-7 items-center gap-1.5 rounded bg-[#2563eb] px-2.5 text-[13px] font-medium text-white hover:bg-[#4ab668]"
                >
                  <IcoPlus /> Vendor type
                </button>
              </div>

              {/* Billing Section */}
              <div>
                <h3 className="mb-4 text-[16px] font-bold text-gray-800">Billing</h3>
                
                <div className="flex items-center gap-6 mb-6">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
                    <div className={clsx("flex h-4 w-4 items-center justify-center rounded border", form.is_additional_payee ? "border-[#2563eb] bg-[#2563eb]" : "border-gray-300 bg-gray-50")}>
                      {form.is_additional_payee && <IcoChk />}
                    </div>
                    <input type="checkbox" className="hidden" checked={form.is_additional_payee} onChange={(e) => set('is_additional_payee', e.target.checked)} />
                    Additional payee
                  </label>

                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
                    <div className={clsx("flex h-4 w-4 items-center justify-center rounded border", form.is_equipment_owner ? "border-[#2563eb] bg-[#2563eb]" : "border-gray-300 bg-gray-50")}>
                      {form.is_equipment_owner && <IcoChk />}
                    </div>
                    <input type="checkbox" className="hidden" checked={form.is_equipment_owner} onChange={(e) => set('is_equipment_owner', e.target.checked)} />
                    Equipment owner
                    <span className="ml-0.5"><InfoIcon /></span>
                  </label>
                </div>

                <div className="mb-6">
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">
                    Additional payee rate, % (e.g. 90) <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.additional_payee_rate_pct}
                    onChange={(e) => set('additional_payee_rate_pct', e.target.value)}
                    disabled={!form.is_additional_payee}
                    className="h-[36px] w-[200px] rounded border border-gray-200 bg-[#cbd5e1] px-3 text-sm text-gray-800 outline-none focus:border-[#2563eb] disabled:opacity-80"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Settlement template type</label>
                  <select
                    value={form.settlement_template_type}
                    onChange={(e) => set('settlement_template_type', e.target.value)}
                    className="h-[36px] w-full rounded border border-[#6ea8fe] bg-white px-2 text-sm text-gray-800 outline-none ring-1 ring-[#6ea8fe] focus:border-[#6ea8fe]"
                  >
                    <option value="" className="text-gray-400">Select template type</option>
                    <option value="Additional Payee">Additional Payee</option>
                    <option value="Equipment Owner">Equipment Owner</option>
                    <option value="Flat Pay Driver">Flat Pay Driver</option>
                    <option value="Hourly Pay Driver">Hourly Pay Driver</option>
                    <option value="Owner Operator">Owner Operator</option>
                    <option value="Rate Per Mile Driver">Rate Per Mile Driver</option>
                    <option value="Rate Percent Driver">Rate Percent Driver</option>
                  </select>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-[#f8f9fb] px-6 py-4">
          <button
            onClick={onClose}
            className="inline-flex h-9 items-center gap-2 rounded bg-[#1e293b] px-4 text-sm font-medium text-white transition hover:bg-black"
          >
            <IcoX /> Close
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded bg-[#2563eb] px-5 text-sm font-medium text-white transition hover:bg-[#4ab668] disabled:opacity-70"
          >
            <IcoChk /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>

      </div>

      {/* NESTED MODAL: Add Vendor Type */}
      {showTypeModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
          <div className="w-full max-w-[480px] overflow-hidden rounded bg-white shadow-2xl">
            <div className="flex items-center justify-between p-6 pb-2">
              <h2 className="text-2xl font-bold text-[#1f2937]">Add Vendor Type</h2>
              <button 
                onClick={() => setShowTypeModal(false)} 
                className="text-gray-400 hover:text-gray-700 transition-colors"
              >
                <IcoX />
              </button>
            </div>
            <div className="p-6 pt-4">
              <label className="mb-2 block text-[15px] text-gray-800">
                Add New Vendor Type
              </label>
              <select
                value={form.vendor_type}
                onChange={(e) => {
                  set('vendor_type', e.target.value);
                  setShowTypeModal(false); // Auto-close modal when an option is selected
                }}
                className="h-[42px] w-full rounded border border-[#6ea8fe] bg-white px-3 text-[15px] text-gray-800 outline-none ring-1 ring-[#6ea8fe] focus:border-[#6ea8fe]"
              >
                <option value=""></option>
                <option value="Dispatcher">Dispatcher</option>
                <option value="Driver">Driver</option>
                <option value="Repair shop">Repair shop</option>
                <option value="Add new">Add new</option>
              </select>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}