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
  return <button onClick={onClick} disabled={disabled} className="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">{children}</button>
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
  const pageSize = 50

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
  const paged = vendors.slice((page - 1) * pageSize, page * pageSize)
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
    <div className="flex flex-col h-full bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-[#1f2937]">Vendors</h1>
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#3f4954]">
            <button className="hover:text-black hover:underline">Pdf</button>
            <span className="text-gray-300">|</span>
            <button className="hover:text-black hover:underline">Excel</button>
            <span className="text-gray-300">|</span>
            <button className="hover:text-black hover:underline">Email</button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><IcoSearch /></span>
            <input type="text" placeholder="Search vendors..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="h-9 pl-8 pr-3 w-[260px] text-sm border border-[#d7dce2] rounded focus:outline-none focus:border-[#94a3b8] placeholder:text-[#b1b7c0]" />
          </div>
          <button onClick={() => setEditVendor('new')} className="inline-flex h-9 items-center gap-1.5 rounded bg-[#58c777] px-3.5 text-sm font-semibold text-white transition hover:bg-[#4ab668]">
            <IcoPlus /> New Vendor
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-[#f5f6f8]">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
          <colgroup>
            <col style={{ width: '20%' }} /><col style={{ width: '10%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '12%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
          </colgroup>
          <thead className="sticky top-0 bg-[#f8f9fb] border-y border-[#dfe4ea] shadow-sm z-10">
            <tr>
              {['COMPANY NAME','TYPE','PHONE','EMAIL','ADDRESS','CITY','STATE','EQ. OWNER','ADD. PAYEE','ACTIONS'].map((h, i) => (
                <th key={i} className="text-left text-xs font-semibold uppercase tracking-wider text-[#526071] px-4 py-2.5">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f4f8] bg-white">
            {loading ? (
              <tr><td colSpan={10} className="py-16 text-center text-[#94a3b8]">Loading...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={10} className="py-16 text-center text-[#94a3b8]">No vendors found</td></tr>
            ) : paged.map(v => (
              <tr key={v.id} className="hover:bg-[#fafbfd] transition-colors cursor-pointer" onClick={() => setEditVendor(v)}>
                <td className="px-4 py-2.5 font-medium text-[#1a73e8] underline-offset-2 hover:underline truncate">{v.company_name}</td>
                <td className="px-4 py-2.5 text-xs text-[#475569]">
                  {v.vendor_type ? (
                    <span className="inline-block px-2 py-0.5 rounded-full bg-gray-100 font-medium">
                      {v.vendor_type}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-4 py-2.5 text-[#475569] truncate">{v.phone || '—'}</td>
                <td className="px-4 py-2.5 text-[#475569] truncate">{v.email || '—'}</td>
                <td className="px-4 py-2.5 text-[#475569] truncate">{v.address || '—'}</td>
                <td className="px-4 py-2.5 text-[#475569]">{v.city || '—'}</td>
                <td className="px-4 py-2.5 text-[#475569]">{v.state || '—'}</td>
                <td className="px-4 py-2.5 text-center">
                  {v.is_equipment_owner
                    ? <svg className="w-4 h-4 text-[#58c777] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5 text-center">
                  {v.is_additional_payee
                    ? <svg className="w-4 h-4 text-[#58c777] mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg>
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditVendor(v)} className="inline-flex h-6 w-6 items-center justify-center rounded bg-[#59c879] text-white transition hover:bg-[#4eb96d]">
                      <IcoEdit />
                    </button>
                    <button onClick={() => handleDelete(v.id, v.company_name)} className="inline-flex h-6 w-6 items-center justify-center rounded bg-red-100 text-red-500 hover:bg-red-200 transition">
                      <IcoX />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-t border-[#dfe4ea] flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <PagBtn onClick={() => setPage(1)} disabled={page <= 1}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></PagBtn>
            <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></PagBtn>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => { const s = Math.max(1, Math.min(page - 2, totalPages - 4)); return s + i }).map(p => (
              <button key={p} onClick={() => setPage(p)} className={`w-6 h-6 text-xs rounded font-semibold ${p === page ? 'bg-[#58c777] text-white' : 'text-[#a8b1bc] border border-[#e3e8ee] bg-[#f8fafc] hover:bg-gray-100'}`}>{p}</button>
            ))}
            <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></PagBtn>
            <PagBtn onClick={() => setPage(totalPages)} disabled={page >= totalPages}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></PagBtn>
          </div>
          <span className="text-xs text-[#526071]">Showing {startEntry} to {endEntry} of {total} entries</span>
          <button onClick={() => { setShowInactive(v => !v); setPage(1) }}
            className={`text-xs font-semibold underline underline-offset-2 ${showInactive ? 'text-[#1f2937]' : 'text-[#1f2937] hover:text-black'}`}>
            {showInactive ? 'Hide inactive' : 'Show inactive vendors'}
          </button>
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
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777] focus:ring-1 focus:ring-[#58c777]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Address</label>
                <input
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Address line 2</label>
                <input
                  value={form.address2}
                  onChange={(e) => set('address2', e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]"
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
                      className="h-[36px] w-full rounded border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#58c777]"
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
                      className="h-[36px] w-full rounded border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#58c777]"
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
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">State</label>
                  <select
                    value={form.state}
                    onChange={(e) => set('state', e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#58c777]"
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
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">FID/EIN</label>
                  <input
                    value={form.fid_ein}
                    onChange={(e) => set('fid_ein', e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium text-gray-700">MC</label>
                  <input
                    value={form.mc_number}
                    onChange={(e) => set('mc_number', e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-gray-700">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => set('notes', e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#58c777]"
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
                  className="inline-flex h-7 items-center gap-1.5 rounded bg-[#58c777] px-2.5 text-[13px] font-medium text-white hover:bg-[#4ab668]"
                >
                  <IcoPlus /> Vendor type
                </button>
              </div>

              {/* Billing Section */}
              <div>
                <h3 className="mb-4 text-[16px] font-bold text-gray-800">Billing</h3>
                
                <div className="flex items-center gap-6 mb-6">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
                    <div className={clsx("flex h-4 w-4 items-center justify-center rounded border", form.is_additional_payee ? "border-[#58c777] bg-[#58c777]" : "border-gray-300 bg-gray-50")}>
                      {form.is_additional_payee && <IcoChk />}
                    </div>
                    <input type="checkbox" className="hidden" checked={form.is_additional_payee} onChange={(e) => set('is_additional_payee', e.target.checked)} />
                    Additional payee
                  </label>

                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
                    <div className={clsx("flex h-4 w-4 items-center justify-center rounded border", form.is_equipment_owner ? "border-[#58c777] bg-[#58c777]" : "border-gray-300 bg-gray-50")}>
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
                    className="h-[36px] w-[200px] rounded border border-gray-200 bg-[#cbd5e1] px-3 text-sm text-gray-800 outline-none focus:border-[#58c777] disabled:opacity-80"
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
            className="inline-flex h-9 items-center gap-2 rounded bg-[#58c777] px-5 text-sm font-medium text-white transition hover:bg-[#4ab668] disabled:opacity-70"
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