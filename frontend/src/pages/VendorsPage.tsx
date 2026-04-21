import { useState, useEffect, useCallback } from 'react'
import { vendorsApi } from '@/api/vendors'
import type { Vendor } from '@/api/vendors'
import toast from 'react-hot-toast'

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY',
  'NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

const IcoPlus  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
const IcoEdit  = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
const IcoX     = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const IcoChk   = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
const IcoSearch = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>

function FF({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-0.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

function PagBtn({ onClick, disabled, children }: { onClick: () => void; disabled: boolean; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={disabled} className="p-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed">{children}</button>
}

const VENDOR_TYPES = ['individual', 'company', 'owner_operator']

type VendorForm = {
  company_name: string; vendor_type: string
  address: string; address2: string; city: string; state: string; zip_code: string
  phone: string; email: string; fid_ein: string; mc_number: string; notes: string
  is_equipment_owner: boolean; is_additional_payee: boolean
  additional_payee_rate_pct: string; settlement_template_type: string
}

function emptyVendorForm(): VendorForm {
  return {
    company_name: '', vendor_type: 'individual',
    address: '', address2: '', city: '', state: '', zip_code: '',
    phone: '', email: '', fid_ein: '', mc_number: '', notes: '',
    is_equipment_owner: false, is_additional_payee: false,
    additional_payee_rate_pct: '', settlement_template_type: '',
  }
}

function vendorToForm(v: Vendor): VendorForm {
  return {
    company_name: v.company_name,
    vendor_type: v.vendor_type || 'individual',
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
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Vendors / Payable To</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><IcoSearch /></span>
            <input type="text" placeholder="Search vendors..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-brand-500 w-48" />
          </div>
          <button onClick={() => setEditVendor('new')} className="btn-primary gap-1.5">
            <IcoPlus /> New Vendor
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 900 }}>
          <colgroup>
            <col style={{ width: '20%' }} /><col style={{ width: '10%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '12%' }} /><col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} /><col style={{ width: '8%' }} />
          </colgroup>
          <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
            <tr>
              {['COMPANY NAME','TYPE','PHONE','EMAIL','ADDRESS','CITY','STATE','EQ. OWNER','ADD. PAYEE','ACTIONS'].map((h, i) => (
                <th key={i} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={10} className="py-16 text-center text-gray-400">Loading...</td></tr>
            ) : paged.length === 0 ? (
              <tr><td colSpan={10} className="py-16 text-center text-gray-400">No vendors found</td></tr>
            ) : paged.map(v => (
              <tr key={v.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEditVendor(v)}>
                <td className="table-td font-medium text-blue-600 truncate">{v.company_name}</td>
                <td className="table-td text-xs">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                    {(v.vendor_type || 'individual').replace('_', ' ')}
                  </span>
                </td>
                <td className="table-td text-xs truncate">{v.phone || '—'}</td>
                <td className="table-td text-xs truncate">{v.email || '—'}</td>
                <td className="table-td text-xs truncate">{v.address || '—'}</td>
                <td className="table-td text-xs">{v.city || '—'}</td>
                <td className="table-td text-xs">{v.state || '—'}</td>
                <td className="table-td text-center">
                  {v.is_equipment_owner
                    ? <svg className="w-3.5 h-3.5 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="table-td text-center">
                  {v.is_additional_payee
                    ? <svg className="w-3.5 h-3.5 text-green-500 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg>
                    : <span className="text-gray-300 text-xs">—</span>}
                </td>
                <td className="table-td" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditVendor(v)}
                      className="p-1.5 border border-brand-200 text-brand-600 rounded hover:bg-brand-50 transition-colors">
                      <IcoEdit />
                    </button>
                    <button onClick={() => handleDelete(v.id, v.company_name)}
                      className="p-1.5 border border-red-200 text-red-500 rounded hover:bg-red-50 transition-colors">
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
      <div className="flex items-center justify-between px-5 py-2 bg-white border-t border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5">
            <PagBtn onClick={() => setPage(1)} disabled={page <= 1}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></PagBtn>
            <PagBtn onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg></PagBtn>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => { const s = Math.max(1, Math.min(page - 2, totalPages - 4)); return s + i }).map(p => (
              <button key={p} onClick={() => setPage(p)} className={`w-7 h-7 text-xs rounded font-medium ${p === page ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
            ))}
            <PagBtn onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg></PagBtn>
            <PagBtn onClick={() => setPage(totalPages)} disabled={page >= totalPages}><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></PagBtn>
          </div>
          <span className="text-xs text-gray-500">Showing {startEntry} to {endEntry} of {total} entries</span>
          <button onClick={() => { setShowInactive(v => !v); setPage(1) }}
            className={`text-xs underline ${showInactive ? 'text-brand-600' : 'text-gray-500 hover:text-gray-700'}`}>
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

// ─── VendorModal ──────────────────────────────────────────────────────────────
function VendorModal({ vendor, onClose, onSaved }: {
  vendor?: Vendor; onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!vendor
  const [form, setForm] = useState<VendorForm>(vendor ? vendorToForm(vendor) : emptyVendorForm())
  const [saving, setSaving] = useState(false)
  const set = (k: keyof VendorForm, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.company_name.trim()) { toast.error('Company name is required'); return }
    setSaving(true)
    try {
      const payload = {
        ...form,
        additional_payee_rate_pct: form.additional_payee_rate_pct
          ? parseFloat(form.additional_payee_rate_pct) : undefined,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-[640px] max-h-[92vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-bold text-gray-900">{isEdit ? 'Edit Vendor' : 'New Vendor'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"><IcoX /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <FF label="Company Name" required>
            <input value={form.company_name} onChange={e => set('company_name', e.target.value)} className="input-base text-sm" placeholder="Company or individual name..." />
          </FF>

          <FF label="Vendor Type">
            <select value={form.vendor_type} onChange={e => set('vendor_type', e.target.value)} className="select-base text-sm">
              <option value="individual">Individual</option>
              <option value="company">Company</option>
              <option value="owner_operator">Owner Operator</option>
            </select>
          </FF>

          <div className="grid grid-cols-2 gap-3">
            <FF label="Phone">
              <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} className="input-base text-sm" />
            </FF>
            <FF label="Email">
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="input-base text-sm" />
            </FF>
          </div>

          <FF label="Address">
            <input value={form.address} onChange={e => set('address', e.target.value)} className="input-base text-sm" />
          </FF>
          <FF label="Address line 2">
            <input value={form.address2} onChange={e => set('address2', e.target.value)} className="input-base text-sm" />
          </FF>

          <div className="grid grid-cols-3 gap-3">
            <FF label="City">
              <input value={form.city} onChange={e => set('city', e.target.value)} className="input-base text-sm" />
            </FF>
            <FF label="State">
              <select value={form.state} onChange={e => set('state', e.target.value)} className="select-base text-sm">
                <option value=""></option>
                {STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </FF>
            <FF label="Zip">
              <input value={form.zip_code} onChange={e => set('zip_code', e.target.value)} className="input-base text-sm" />
            </FF>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FF label="FID / EIN">
              <input value={form.fid_ein} onChange={e => set('fid_ein', e.target.value)} className="input-base text-sm" placeholder="Tax ID..." />
            </FF>
            <FF label="MC #">
              <input value={form.mc_number} onChange={e => set('mc_number', e.target.value)} className="input-base text-sm" />
            </FF>
          </div>

          {/* Payroll settings */}
          <div className="border border-gray-200 rounded p-4 space-y-3">
            <h4 className="text-sm font-semibold text-gray-800">Payroll / Settlement Settings</h4>
            <div className="grid grid-cols-2 gap-3">
              <FF label="Settlement Template Type">
                <select value={form.settlement_template_type} onChange={e => set('settlement_template_type', e.target.value)} className="select-base text-sm">
                  <option value="">Default</option>
                  <option value="owner_operator">Owner Operator</option>
                  <option value="company_driver">Company Driver</option>
                </select>
              </FF>
              <FF label="Additional Payee Rate %">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                  <input type="number" step="0.1" min="0" max="100"
                    value={form.additional_payee_rate_pct}
                    onChange={e => set('additional_payee_rate_pct', e.target.value)}
                    className="input-base text-sm pl-6" placeholder="0" />
                </div>
              </FF>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_equipment_owner} onChange={e => set('is_equipment_owner', e.target.checked)} className="rounded accent-brand-600 w-4 h-4" />
                <span className="text-sm text-gray-700">Equipment owner</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_additional_payee} onChange={e => set('is_additional_payee', e.target.checked)} className="rounded accent-brand-600 w-4 h-4" />
                <span className="text-sm text-gray-700">Additional payee</span>
              </label>
            </div>
          </div>

          <FF label="Notes">
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={3} className="input-base text-sm resize-none" placeholder="Internal notes about this vendor..." />
          </FF>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 sticky bottom-0">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded hover:bg-gray-900">
            <IcoX /> Close
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-5 py-2">
            <IcoChk /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
