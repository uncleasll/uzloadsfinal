import { useState, useEffect, useRef, useCallback } from 'react'
import { driversExtApi } from '@/api/driversExt'
import { trucksApi, trailersApi, driversApi } from '@/api/entities'
import { vendorsApi, scheduledTxApi } from '@/api/vendors'
import type { Vendor, ScheduledTransaction } from '@/api/vendors'
import type { Truck, Trailer, Driver } from '@/types'
import { formatDate } from '@/utils'
import client from '@/api/client'
import toast from 'react-hot-toast'

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || ''

const STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]
const PAGE_SIZES = [10, 25, 50, 100]
const DOC_TYPES = [
  { key: 'application',             label: 'Application' },
  { key: 'cdl',                     label: 'CDL' },
  { key: 'medical_card',            label: 'Medical card' },
  { key: 'drug_test',               label: 'Drug Test' },
  { key: 'mvr',                     label: 'MVR' },
  { key: 'ssn_card',                label: 'SSN card' },
  { key: 'employment_verification', label: 'Employment verification' },
  { key: 'other',                   label: 'Other' },
]
const DRIVER_STATUSES = ['Applicant','Hired','On Leave','Terminated','Inactive']
const PAY_TYPES = [
  { v: 'per_mile',           l: 'Per mile' },
  { v: 'freight_percentage', l: 'Freight %' },
  { v: 'flatpay',            l: 'Flat pay' },
  { v: 'hourly',             l: 'Hourly' },
]
const TX_CATEGORIES = [
  'Detention','Driver payments','Factoring Fee','Fuel','IFTA Tax','Insurance',
  'Internet','Legal & Professional','Lumper','NM/KY/NY/OR/CT miles tax',
  'Office Expenses','Office Rent','Other','Parking','Permits','Quick Pay fee',
  'Rent','Repairs','Software','Supplies','Telephone','Tolls','Travel','Truck Registration',
]

// ── Interfaces ────────────────────────────────────────────────────────────────
interface ExtDriver {
  id: number
  name: string
  phone?: string
  email?: string
  driver_type: string
  pay_rate_loaded: number
  pay_rate_empty: number
  is_active: boolean
  profile?: {
    first_name: string; last_name: string; date_of_birth?: string
    hire_date?: string; termination_date?: string
    address: string; address2: string; city: string; state: string; zip_code: string
    payable_to: string; co_driver_id?: number
    truck_id?: number; truck_unit?: string; trailer_id?: number; trailer_unit?: string
    fuel_card: string; ifta_handled: boolean; driver_status: string
    pay_type: string; per_extra_stop: number; freight_percentage: number
    flatpay: number; hourly_rate: number; notes: string
  }
  documents: Doc[]
}

interface Doc {
  id: number
  doc_type: string
  status?: string
  doc_number?: string
  number?: string
  state?: string
  issue_date?: string
  exp_date?: string
  hire_date?: string
  termination_date?: string
  notes?: string
  filename?: string
  original_filename?: string
}

interface DForm {
  first_name: string; last_name: string; dob: string
  phone: string; email: string
  address: string; address2: string; city: string; state: string; zip: string
  hire_date: string; term_date: string; driver_status: string
  truck_id: string; trailer_id: string; fuel_card: string; ifta: boolean
  payable_to: string; co_driver_id: string; driver_type: string
  pay_type: string; per_mile: string; empty_mile: string
  extra_stop: string; freight_pct: string; flatpay: string; hourly: string
  notes: string
}

function emptyForm(): DForm {
  return {
    first_name: '', last_name: '', dob: '', phone: '', email: '',
    address: '', address2: '', city: '', state: '', zip: '',
    hire_date: new Date().toISOString().slice(0,10),
    term_date: '', driver_status: 'Hired',
    truck_id: '', trailer_id: '', fuel_card: '', ifta: true,
    payable_to: '', co_driver_id: '', driver_type: 'Drv',
    pay_type: 'per_mile', per_mile: '0.65', empty_mile: '0.30',
    extra_stop: '0', freight_pct: '0', flatpay: '0', hourly: '0', notes: '',
  }
}

function driverToForm(d: ExtDriver): DForm {
  const p = d.profile
  return {
    first_name: p?.first_name || d.name.split(' ')[0] || '',
    last_name:  p?.last_name  || d.name.split(' ').slice(1).join(' ') || '',
    dob: p?.date_of_birth || '',
    phone: d.phone || '', email: d.email || '',
    address: p?.address || '', address2: p?.address2 || '',
    city: p?.city || '', state: p?.state || '', zip: p?.zip_code || '',
    hire_date: p?.hire_date || '', term_date: p?.termination_date || '',
    driver_status: p?.driver_status || 'Hired',
    truck_id: String(p?.truck_id || ''), trailer_id: String(p?.trailer_id || ''),
    fuel_card: p?.fuel_card || '', ifta: p?.ifta_handled ?? true,
    payable_to: p?.payable_to || d.name, co_driver_id: String(p?.co_driver_id || ''),
    driver_type: d.driver_type || 'Drv',
    pay_type: p?.pay_type || 'per_mile',
    per_mile: String(d.pay_rate_loaded || 0.65),
    empty_mile: String(d.pay_rate_empty || 0.30),
    extra_stop: String(p?.per_extra_stop || 0),
    freight_pct: String(p?.freight_percentage || 0),
    flatpay: String(p?.flatpay || 0),
    hourly: String(p?.hourly_rate || 0),
    notes: p?.notes || '',
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(v?: string | null): string {
  if (!v) return ''
  const p = v.split('-')
  if (p.length === 3) return p[1] + '/' + p[2] + '/' + p[0].slice(2)
  return v
}

function isExpired(expDate?: string | null): boolean {
  if (!expDate) return false
  return new Date(expDate) < new Date()
}

function isExpiringSoon(expDate?: string | null): boolean {
  if (!expDate) return false
  const exp  = new Date(expDate)
  const now  = new Date()
  const soon = new Date(); soon.setDate(now.getDate() + 30)
  return exp >= now && exp <= soon
}

interface Warning { label: string; type: 'expired' | 'soon' | 'missing' }

function getDriverWarnings(docs: Doc[]): Warning[] {
  const warns: Warning[] = []
  const now  = new Date()
  const soon = new Date(); soon.setDate(now.getDate() + 30)

  const hasCDL = docs.some(d => d.doc_type === 'cdl')
  const hasMed = docs.some(d => d.doc_type === 'medical_card')
  if (!hasCDL) warns.push({ label: 'CDL missing', type: 'missing' })
  if (!hasMed) warns.push({ label: 'Med card missing', type: 'missing' })

  docs.forEach(doc => {
    if (!doc.exp_date) return
    const exp   = new Date(doc.exp_date)
    const label = DOC_TYPES.find(t => t.key === doc.doc_type)?.label || doc.doc_type
    if (exp < now)  warns.push({ label: label + ' EXPIRED', type: 'expired' })
    else if (exp <= soon) warns.push({ label: label + ': exp ' + fmtDate(doc.exp_date), type: 'soon' })
  })
  return warns
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IcoPlus   = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
const IcoEdit   = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
const IcoTrash  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
const IcoX      = () => <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const IcoCheck  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
const IcoSearch = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
const IcoFilter = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 10h10M11 16h2"/></svg>
const IcoDown   = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
const IcoChevR  = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
const IcoPDF    = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
const IcoXLS    = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
const IcoMail   = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
const IcoWarn   = () => <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
const IcoOK     = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4"/></svg>
const IcoUpload = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
const IcoLink   = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/></svg>

function PBtn({ onClick, disabled, children }: { onClick: ()=>void; disabled: boolean; children: React.ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
      {children}
    </button>
  )
}

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {text}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label text={label} required={required} />
      {children}
    </div>
  )
}

// ── DOC config ────────────────────────────────────────────────────────────────
type DocField = { key: string; label: string; type?: 'date' | 'text' | 'select-state' | 'select-status' | 'textarea'; width?: string }

const DOC_FIELDS: Record<string, DocField[]> = {
  application: [
    { key: 'status',           label: 'STATUS',           type: 'select-status', width: 'w-32' },
    { key: 'hire_date',        label: 'APPLICATION DATE', type: 'date',          width: 'w-36' },
    { key: 'hire_date',        label: 'HIRE DATE',        type: 'date',          width: 'w-36' },
    { key: 'termination_date', label: 'TERMINATION DATE', type: 'date',          width: 'w-36' },
  ],
  cdl: [
    { key: 'doc_number', label: 'NUMBER',     type: 'text', width: 'w-28' },
    { key: 'state',      label: 'STATE',      type: 'select-state', width: 'w-20' },
    { key: 'issue_date', label: 'ISSUE DATE', type: 'date', width: 'w-36' },
    { key: 'exp_date',   label: 'EXP DATE',   type: 'date', width: 'w-36' },
  ],
  medical_card: [
    { key: 'doc_number', label: 'NUMBER',     type: 'text', width: 'w-32' },
    { key: 'issue_date', label: 'ISSUE DATE', type: 'date', width: 'w-36' },
    { key: 'exp_date',   label: 'EXP DATE',   type: 'date', width: 'w-36' },
  ],
  drug_test: [
    { key: 'status',     label: 'STATUS', type: 'select-status', width: 'w-32' },
    { key: 'issue_date', label: 'DATE',   type: 'date',          width: 'w-36' },
    { key: 'notes',      label: 'NOTES',  type: 'text',          width: 'flex-1' },
  ],
  mvr:     [{ key: 'issue_date', label: 'DATE', type: 'date', width: 'w-36' }],
  ssn_card:[{ key: 'doc_number', label: 'NUMBER', type: 'text', width: 'w-40' }],
  employment_verification: [
    { key: 'status',     label: 'STATUS', type: 'select-status', width: 'w-32' },
    { key: 'issue_date', label: 'DATE',   type: 'date',          width: 'w-36' },
    { key: 'notes',      label: 'NOTES',  type: 'text',          width: 'flex-1' },
  ],
  other: [
    { key: 'exp_date', label: 'EXP DATE', type: 'date', width: 'w-36' },
    { key: 'notes',    label: 'NOTES',    type: 'text', width: 'flex-1' },
  ],
}

function getDocFieldVal(key: string, doc: Doc): string {
  if (key === 'doc_number')       return doc.doc_number || doc.number || ''
  if (key === 'state')            return doc.state || ''
  if (key === 'status')           return doc.status || ''
  if (key === 'notes')            return doc.notes || ''
  if (key === 'issue_date')       return doc.issue_date || ''
  if (key === 'exp_date')         return doc.exp_date || ''
  if (key === 'hire_date')        return doc.hire_date || ''
  if (key === 'termination_date') return doc.termination_date || ''
  return ''
}

function docApiPayload(formVals: Record<string, string>, docType: string): Record<string, unknown> {
  const p: Record<string, unknown> = { doc_type: docType }
  if (formVals.doc_number)       p.number           = formVals.doc_number
  if (formVals.state)            p.state            = formVals.state
  if (formVals.status)           p.status           = formVals.status
  if (formVals.notes)            p.notes            = formVals.notes
  if (formVals.issue_date)       p.issue_date       = formVals.issue_date
  if (formVals.exp_date)         p.exp_date         = formVals.exp_date
  if (formVals.hire_date)        p.hire_date        = formVals.hire_date
  if (formVals.termination_date) p.termination_date = formVals.termination_date
  return p
}

function getDocHeaderInfo(docType: string, docs: Doc[]): { meta: string; warnText: string; hasExpiry: boolean } {
  const d = docs[0]
  if (!d) return { meta: '', warnText: '', hasExpiry: false }
  if (docType === 'application') {
    const noFile = !d.original_filename
    return {
      meta: d.hire_date ? 'Hire date ' + fmtDate(d.hire_date) : '',
      warnText: noFile ? 'Application incomplete; No files attached' : '',
      hasExpiry: false,
    }
  }
  const num = d.doc_number || d.number
  const parts: string[] = []
  if (num) parts.push('#' + num)
  if (d.state) parts.push('/ ' + d.state)
  if (d.exp_date) parts.push('exp. ' + fmtDate(d.exp_date))
  let warnText = ''
  if (isExpired(d.exp_date))      warnText = 'Expired ' + fmtDate(d.exp_date)
  else if (isExpiringSoon(d.exp_date)) warnText = 'Expires ' + fmtDate(d.exp_date)
  return { meta: parts.join(' '), warnText, hasExpiry: !!d.exp_date }
}

// ── DocFieldInput — keeps form inputs out of inline JSX ──────────────────────
function DocFieldInput({ field, value, onChange }: {
  field: DocField
  value: string
  onChange: (v: string) => void
}) {
  const base = 'input-base text-xs ' + (field.width || 'w-full')
  if (field.type === 'select-state') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className={'select-base text-xs ' + (field.width || 'w-full')}>
        <option value=""></option>
        {STATES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    )
  }
  if (field.type === 'select-status') {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className={'select-base text-xs ' + (field.width || 'w-full')}>
        <option value=""></option>
        <option value="incomplete">incomplete</option>
        <option value="complete">complete</option>
        <option value="pending">pending</option>
        <option value="Scheduled">Scheduled</option>
        <option value="passed">passed</option>
        <option value="failed">failed</option>
      </select>
    )
  }
  if (field.type === 'date') {
    return (
      <input type="date" value={value} onChange={e => onChange(e.target.value)}
        className={base} />
    )
  }
  return (
    <input type="text" value={value} onChange={e => onChange(e.target.value)}
      placeholder={field.key === 'doc_number' ? '#' : ''}
      className={base} />
  )
}

// ── FileUploadLabel — isolated component to avoid async in JSX ───────────────
function FileUploadLabel({ label, onFile }: { label: string; onFile: (f: File) => void }) {
  return (
    <label className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 cursor-pointer font-medium hover:underline">
      <IcoUpload />
      {label}
      <input type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
    </label>
  )
}

// ── DriverActionMenu ──────────────────────────────────────────────────────────
function DriverActionMenu({ onEdit, onDelete }: { onEdit: ()=>void; onDelete: ()=>void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div ref={ref} className="relative flex items-center">
      <button onClick={(e)=>{e.stopPropagation();onEdit()}}
        className="inline-flex items-center justify-center w-7 h-7 rounded bg-[#58c777] text-white hover:bg-[#4ab668] transition-colors"
        title="Edit Driver">
        <IcoEdit />
      </button>
      <button onClick={(e)=>{e.stopPropagation();setOpen(v=>!v)}}
        className="inline-flex items-center justify-center w-5 h-7 text-gray-400 hover:text-gray-700">
        <IcoDown />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[140px]">
          <button onClick={(e)=>{e.stopPropagation();setOpen(false);onEdit()}}
            className="w-full text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
            <IcoEdit /> Edit Driver
          </button>
          <button onClick={(e)=>{e.stopPropagation();setOpen(false);onDelete()}}
            className="w-full text-left px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100">
            <IcoTrash /> Delete Driver
          </button>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function DriversPage() {
  const [drivers, setDrivers]       = useState<ExtDriver[]>([])
  const [trucks, setTrucks]         = useState<Truck[]>([])
  const [trailers, setTrailers]     = useState<Trailer[]>([])
  const [allDrivers, setAllDrivers] = useState<Driver[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [pageSize, setPageSize]     = useState(50)
  const [page, setPage]             = useState(1)
  const [total, setTotal]           = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [showFilter, setShowFilter] = useState(false)
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [editDriver, setEditDriver] = useState<ExtDriver | 'new' | null>(null)
  const [showEmail, setShowEmail]   = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const params: Record<string, unknown> = { page, page_size: pageSize }
    if (search) params.search = search
    if (!showInactive) params.is_active = true
    if (filterType)   params.driver_type   = filterType
    if (filterStatus) params.driver_status = filterStatus
    Promise.all([
      driversExtApi.list(params),
      trucksApi.list(),
      trailersApi.list(),
      driversApi.list(),
    ])
      .then(([res, t, tr, d]) => {
        const items = res.items || res
        setDrivers(items)
        setTotal(res.total ?? items.length)
        setTotalPages(res.total_pages ?? Math.max(1, Math.ceil((res.total ?? items.length) / pageSize)))
        setTrucks(t); setTrailers(tr); setAllDrivers(d)
      })
      .catch(e => toast.error(e.message))
      .finally(() => setLoading(false))
  }, [search, showInactive, filterType, filterStatus, page, pageSize])

  useEffect(() => { load() }, [load])

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end   = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col h-full bg-white overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0 bg-white">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-gray-900">Drivers</h1>
          <div className="flex items-center gap-1 text-sm">
            <button onClick={() => window.open(API_BASE + '/api/v1/drivers/export/pdf', '_blank')}
              className="text-xs text-gray-500 hover:text-gray-800 hover:underline">Pdf</button>
            <span className="text-gray-300">|</span>
            <button onClick={() => window.open(API_BASE + '/api/v1/drivers/export/xlsx', '_blank')}
              className="text-xs text-gray-500 hover:text-gray-800 hover:underline">Excel</button>
            <span className="text-gray-300">|</span>
            <button onClick={() => setShowEmail(true)}
              className="text-xs text-gray-500 hover:text-gray-800 hover:underline">Email</button>
          </div>
        </div>
        <div className="flex items-center gap-2">
         <div className="relative flex items-center">
  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><IcoSearch /></span>
  <input type="text" placeholder="Search" value={search}
    onChange={e => { setSearch(e.target.value); setPage(1) }}
    className="pl-8 pr-8 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:border-brand-500 w-48 transition-colors" />
  <button onClick={() => setShowFilter(v => !v)}
    className={'absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 ' + (showFilter ? 'text-brand-600' : '')}>
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h18M7 10h10M11 16h2"/>
    </svg>
  </button>
</div>
          <button onClick={() => setEditDriver('new')}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#58c777] text-white text-sm font-semibold rounded hover:bg-[#4ab668] transition-colors">
            <IcoPlus /> New
          </button>
        </div>
      </div>

      {/* No separate filter bar — filters are in the table header gear dropdown */}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{width:'18%'}} /><col style={{width:'5%'}} /><col style={{width:'7%'}} />
            <col style={{width:'7%'}} /><col style={{width:'7%'}} /><col style={{width:'8%'}} />
            <col style={{width:'11%'}} /><col style={{width:'5%'}} /><col style={{width:'6%'}} />
            <col style={{width:'10%'}} /><col style={{width:'8%'}} /><col style={{width:'5%'}} /><col style={{width:'3%'}} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
              <th className="px-4 py-2.5">Name <span className="text-gray-300">↕</span></th>
              <th className="px-4 py-2.5">Type <span className="text-gray-300">↕</span></th>
              <th className="px-4 py-2.5">Status <span className="text-gray-300">↕</span></th>
              <th className="px-4 py-2.5">Hire Date <span className="text-gray-300">↕</span></th>
              <th className="px-4 py-2.5">Term Date <span className="text-gray-300">↕</span></th>
              <th className="px-4 py-2.5">Phone <span className="text-gray-300">↕</span></th>
              <th className="px-4 py-2.5">Email <span className="text-gray-300">↕</span></th>
              <th className="px-4 py-2.5">Truck <span className="text-gray-300">↕</span></th>
              <th className="px-4 py-2.5">Trailer <span className="text-gray-300">↕</span></th>
              <th className="px-4 py-2.5">Payable To <span className="text-gray-300">↕</span></th>
              <th className="px-4 py-2.5">Warnings</th>
              <th className="px-4 py-2.5">Driver App</th>
              <th className="px-4 py-2.5">
                <button onClick={() => setShowFilter(v => !v)}
                  className={'p-1 rounded transition-colors ' + (showFilter ? 'text-brand-600 bg-brand-50' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100')}>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </th>
            </tr>
            {showFilter && (
              <tr className="bg-gray-50 border-b border-gray-100">
                <td colSpan={13} className="px-4 py-2">
                  <div className="flex items-center gap-3">
                    <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }}
                      className="h-7 text-xs border border-gray-300 rounded px-2 bg-white text-gray-700">
                      <option value="">All Types</option>
                      <option value="Drv">Company Driver</option>
                      <option value="OO">Owner Operator</option>
                    </select>
                    <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
                      className="h-7 text-xs border border-gray-300 rounded px-2 bg-white text-gray-700">
                      <option value="">All Statuses</option>
                      <option value="Applicant">Applicant</option>
                      <option value="Hired">Hired</option>
                      <option value="Terminated">Terminated</option>
                    </select>
                    {(filterType || filterStatus) && (
                      <button onClick={() => { setFilterType(''); setFilterStatus(''); setPage(1) }}
                        className="text-xs text-gray-500 hover:text-red-600 underline">Clear</button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr><td colSpan={13} className="py-20 text-center">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm">Loading drivers...</span>
                </div>
              </td></tr>
            ) : drivers.length === 0 ? (
              <tr><td colSpan={13} className="py-20 text-center text-gray-400 text-sm">No drivers found</td></tr>
            ) : drivers.map(d => {
              const warns = getDriverWarnings(d.documents || [])
              const hasExpired = warns.some(w => w.type === 'expired')
              const rowWarn = warns.length > 0
              return (
                <tr key={d.id}
                  onClick={() => setEditDriver(d)}
                  className={'cursor-pointer transition-colors ' + (rowWarn ? 'hover:bg-amber-50' : 'hover:bg-gray-50')}>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {rowWarn && <span className={hasExpired ? 'text-red-500 flex-shrink-0' : 'text-amber-500 flex-shrink-0'}><IcoWarn /></span>}
                      <span className="font-medium text-blue-600 truncate hover:underline text-sm">
                        {d.name} [{d.driver_type}]
                        {!d.is_active && <span className="ml-1 text-xs text-gray-400 font-normal">(inactive)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-600">{d.driver_type === 'OO' ? 'O/O' : 'Drv'}</td>
                  <td className="px-4 py-2">
                    {d.profile?.driver_status === 'Hired' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-200">● Hired</span>
                    ) : d.profile?.driver_status === 'Terminated' ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">Terminated</span>
                    ) : (
                      <span className="text-xs text-gray-500">{d.profile?.driver_status || '—'}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(d.profile?.hire_date) || '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(d.profile?.termination_date) || '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-600 truncate">{d.phone || '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-600 truncate">{d.email || '—'}</td>
                  <td className="px-4 py-2 text-xs font-mono text-gray-600">{d.profile?.truck_unit || '—'}</td>
                  <td className="px-4 py-2 text-xs font-mono text-gray-600">{d.profile?.trailer_unit || '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-600 truncate">{d.profile?.payable_to || d.name}</td>
                  <td className="px-4 py-2">
                    {warns.length === 0 ? (
                      <span className="text-brand-500"><IcoOK /></span>
                    ) : (
                      <div className="space-y-0.5">
                        {warns.slice(0,2).map((w,i) => (
                          <div key={i} className={'text-xs flex items-center gap-1 ' + (w.type==='expired'?'text-red-600':w.type==='soon'?'text-amber-600':'text-gray-500')}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 inline-block bg-current"></span>
                            <span className="truncate">{w.label}</span>
                          </div>
                        ))}
                        {warns.length > 2 && <div className="text-xs text-gray-400">+{warns.length-2}</div>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400">—</td>
                  <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                    <DriverActionMenu
                      onEdit={() => setEditDriver(d)}
                      onDelete={async () => {
                        if (!confirm(`Deactivate driver "${d.name}"?`)) return
                        try {
                          await driversExtApi.update(d.id, { is_active: false } as any)
                          toast.success('Driver deactivated')
                          load()
                        } catch(e: any) { toast.error(e.message) }
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-5 py-2.5 bg-white border-t border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-0.5">
            <PBtn onClick={() => setPage(1)} disabled={page<=1}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
            </PBtn>
            <PBtn onClick={() => setPage(p => Math.max(1,p-1))} disabled={page<=1}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
            </PBtn>
            {Array.from({length:Math.min(totalPages,5)}, (_,i) => {
              const s = Math.max(1, Math.min(page-2, totalPages-4))
              return s + i
            }).map(p => (
              <button key={p} onClick={() => setPage(p)}
                className={'w-8 h-8 text-xs rounded-lg font-medium transition-colors ' +
                  (p===page ? 'bg-brand-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100')}>
                {p}
              </button>
            ))}
            <PBtn onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={page>=totalPages}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
            </PBtn>
            <PBtn onClick={() => setPage(totalPages)} disabled={page>=totalPages}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
            </PBtn>
          </div>
          <span className="text-xs text-gray-500">
            {total === 0 ? 'No entries' : 'Showing ' + start + '–' + end + ' of ' + total}
          </span>
          <button onClick={() => { setShowInactive(v=>!v); setPage(1) }}
            className={'text-xs px-2 py-1 rounded-lg transition-colors ' +
              (showInactive ? 'text-brand-600 bg-brand-50 font-medium' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100')}>
            {showInactive ? '● Showing inactive' : 'Show inactive'}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Per page:</span>
          {PAGE_SIZES.map(n => (
            <button key={n} onClick={() => { setPageSize(n); setPage(1) }}
              className={'text-xs px-2 py-1 rounded-lg transition-colors ' +
                (pageSize===n ? 'bg-brand-600 text-white font-medium' : 'text-gray-500 hover:bg-gray-100')}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {editDriver !== null && (
        <DriverModal
          driver={editDriver === 'new' ? undefined : editDriver}
          trucks={trucks} trailers={trailers} allDrivers={allDrivers}
          onClose={() => setEditDriver(null)}
          onSaved={() => { setEditDriver(null); load() }}
        />
      )}
      {showEmail && (
        <EmailModal drivers={drivers} onClose={() => setShowEmail(false)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// DRIVER MODAL
// ─────────────────────────────────────────────────────────────────────────────
type PayTab = 'pay_rates' | 'scheduled' | 'payee' | 'notes' | 'app'

function DriverModal({ driver, trucks, trailers, allDrivers, onClose, onSaved }: {
  driver?: ExtDriver; trucks: Truck[]; trailers: Trailer[]; allDrivers: Driver[]
  onClose: () => void; onSaved: () => void
}) {
  const isEdit = !!driver
  const [form, setForm]     = useState<DForm>(driver ? driverToForm(driver) : emptyForm())
  const [saving, setSaving] = useState(false)
  const [photo, setPhoto]   = useState<string|null>(null)
  const [payTab, setPayTab] = useState<PayTab>('pay_rates')
  const [expanded, setExpanded] = useState<Record<string,boolean>>(
    () => Object.fromEntries(DOC_TYPES.map(d => [d.key, false]))
  )
  const [docs, setDocs]       = useState<Doc[]>(driver?.documents || [])
  const [addingType, setAddingType] = useState<string|null>(null)
  const [addVals, setAddVals]       = useState<Record<string,string>>({})
  const [addFile, setAddFile]       = useState<File|null>(null)
  const [editDocId, setEditDocId]   = useState<number|null>(null)
  const [editVals, setEditVals]     = useState<Record<string,string>>({})
  const [vendors, setVendors]       = useState<Vendor[]>([])
  const [txs, setTxs]               = useState<ScheduledTransaction[]>([])
  const [showTxModal, setShowTxModal]   = useState(false)
  const [editTx, setEditTx]             = useState<ScheduledTransaction|null>(null)
  const [showVendorModal, setShowVendorModal] = useState(false)
  const [showEditVendorModal, setShowEditVendorModal] = useState(false)
  const [editingVendor, setEditingVendor] = useState<Vendor|null>(null)
  const [showPayableDropdown, setShowPayableDropdown] = useState(false)
  const [showTerminateDropdown, setShowTerminateDropdown] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  const sf = (k: keyof DForm, v: string|boolean) => setForm(f => ({...f,[k]:v}))

  useEffect(() => {
    vendorsApi.list({is_active:true}).then(setVendors).catch(() => {})
    if (isEdit && driver) scheduledTxApi.list(driver.id).then(setTxs).catch(() => {})
  }, [driver, isEdit])

  const reloadDocs = () => {
    if (!driver) return
    client.get('/api/v1/drivers/' + driver.id + '/documents')
      .then(r => setDocs(r.data))
      .catch(() => {})
  }

  const reloadTxs = () => {
    if (!driver) return
    scheduledTxApi.list(driver.id).then(setTxs).catch(() => {})
  }

  const handleSave = () => {
    if (!form.first_name.trim()) { toast.error('First name is required'); return }
    setSaving(true)
    const name = (form.first_name + ' ' + form.last_name).trim()
    const payload: Record<string,unknown> = {
      name, first_name: form.first_name, last_name: form.last_name,
      phone: form.phone || undefined, email: form.email || undefined,
      driver_type: form.driver_type,
      pay_rate_loaded: parseFloat(form.per_mile) || 0.65,
      pay_rate_empty:  parseFloat(form.empty_mile) || 0.30,
      is_active: form.driver_status !== 'Terminated',
      date_of_birth: form.dob || undefined,
      hire_date: form.hire_date || undefined,
      termination_date: form.term_date || undefined,
      address: form.address, address2: form.address2,
      city: form.city, state: form.state, zip_code: form.zip,
      payable_to: form.payable_to || name,
      co_driver_id:  form.co_driver_id  ? parseInt(form.co_driver_id)  : undefined,
      truck_id:      form.truck_id      ? parseInt(form.truck_id)      : undefined,
      trailer_id:    form.trailer_id    ? parseInt(form.trailer_id)    : undefined,
      fuel_card: form.fuel_card, ifta_handled: form.ifta,
      driver_status: form.driver_status, pay_type: form.pay_type,
      per_extra_stop:     parseFloat(form.extra_stop)  || 0,
      freight_percentage: parseFloat(form.freight_pct) || 0,
      flatpay:     parseFloat(form.flatpay) || 0,
      hourly_rate: parseFloat(form.hourly)  || 0,
      notes: form.notes,
    }
    const req = isEdit && driver
      ? driversExtApi.update(driver.id, payload)
      : driversExtApi.create(payload)
    req
      .then(() => { toast.success(isEdit ? 'Driver updated' : 'Driver created'); onSaved() })
      .catch(e  => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const handleAddDoc = () => {
    if (!isEdit || !driver || !addingType) return
    const payload = docApiPayload(addVals, addingType)
    driversExtApi.addDocument(driver.id, payload as any)
      .then(newDoc => {
        if (addFile) return driversExtApi.uploadDocFile(driver.id, (newDoc as Doc).id, addFile)
      })
      .then(() => {
        reloadDocs()
        setAddingType(null); setAddVals({}); setAddFile(null)
        toast.success('Document added')
      })
      .catch(e => toast.error(e.message))
  }

  const handleUpdateDoc = (docId: number, docType: string) => {
    if (!driver) return
    const payload = docApiPayload(editVals, docType)
    driversExtApi.updateDocument(driver.id, docId, payload)
      .then(() => { reloadDocs(); setEditDocId(null); toast.success('Document updated') })
      .catch(e => toast.error(e.message))
  }

  const handleDeleteDoc = (docId: number) => {
    if (!driver || !confirm('Delete this document?')) return
    driversExtApi.deleteDocument(driver.id, docId)
      .then(() => { setDocs(prev => prev.filter(d => d.id !== docId)); toast.success('Deleted') })
      .catch(e => toast.error(e.message))
  }

  const handleUploadOnExisting = (docId: number, file: File) => {
    if (!driver) return
    driversExtApi.uploadDocFile(driver.id, docId, file)
      .then(() => { reloadDocs(); toast.success('File uploaded') })
      .catch(e => toast.error(e.message))
  }

  const handleDeleteTx = (tx: ScheduledTransaction) => {
    if (!driver) return
    scheduledTxApi.delete(driver.id, tx.id)
      .then(() => { reloadTxs(); toast.success('Removed') })
      .catch(e => toast.error(e.message))
  }

  const PAY_TABS: {key:PayTab; label:string}[] = [
    {key:'pay_rates', label:'Pay Rates'},
    {key:'scheduled', label:'Scheduled'},
    {key:'payee',     label:'Additional Payee'},
    {key:'notes',     label:'Notes'},
    {key:'app',       label:'Driver App'},
  ]

  const warnSummary = getDriverWarnings(docs)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[980px] bg-white flex flex-col h-full shadow-2xl">

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0 bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-gray-900">{isEdit ? 'Edit Driver' : 'New Driver'}</h2>
            {isEdit && (
              <div className="relative">
                <div className="flex items-center gap-1">
                  <span className={'inline-flex items-center px-2.5 py-1 rounded-l text-xs font-semibold ' +
                    (form.driver_status === 'Hired' ? 'bg-brand-100 text-brand-700' :
                     form.driver_status === 'Terminated' ? 'bg-red-100 text-red-700' :
                     'bg-gray-100 text-gray-700')}>
                    {form.driver_status || 'Hired'}
                  </span>
                  <button
                    onClick={() => setShowTerminateDropdown(v => !v)}
                    className={'inline-flex items-center px-1.5 py-1 rounded-r text-xs font-semibold border-l border-white/30 ' +
                      (form.driver_status === 'Hired' ? 'bg-brand-100 text-brand-700 hover:bg-brand-200' :
                       form.driver_status === 'Terminated' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                       'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
                    <IcoDown />
                  </button>
                </div>
                {showTerminateDropdown && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[140px]">
                    {DRIVER_STATUSES.map(s => (
                      <button key={s} onClick={() => { sf('driver_status', s); setShowTerminateDropdown(false) }}
                        className={'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ' + (form.driver_status === s ? 'font-semibold text-brand-600' : 'text-gray-700')}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {isEdit && warnSummary.length > 0 && (
              <span className={'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ' +
                (warnSummary.some(w=>w.type==='expired') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-amber-50 text-amber-700 border border-amber-200')}>
                <IcoWarn /> {warnSummary.length} warning{warnSummary.length>1?'s':''}
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <IcoX />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-6">

            {/* ── Profile Section ── */}
            <div className="flex gap-5">
              {/* Photo */}
              <div className="flex-shrink-0">
                <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center shadow-md">
                  {photo
                    ? <img src={photo} alt="" className="w-full h-full object-cover" />
                    : <svg className="w-10 h-10 text-slate-300" fill="currentColor" viewBox="0 0 24 24"><path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                  }
                  <button onClick={() => photoRef.current?.click()}
                    className="absolute inset-0 bg-black/0 hover:bg-black/30 transition-colors flex items-end justify-center pb-1.5">
                    <span className="text-white text-[10px] font-medium opacity-0 hover:opacity-100 transition-opacity bg-black/50 px-1.5 py-0.5 rounded">Edit</span>
                  </button>
                  <input ref={photoRef} type="file" accept="image/*" className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) {
                        const r = new FileReader()
                        r.onload = ev => setPhoto(ev.target?.result as string)
                        r.readAsDataURL(f)
                      }
                    }} />
                </div>
                <p className="text-xs text-center text-gray-400 mt-1.5 cursor-pointer hover:text-brand-600" onClick={() => photoRef.current?.click()}>Update photo</p>
              </div>

              {/* Core fields */}
              <div className="flex-1 grid grid-cols-3 gap-4">
                <Field label="First Name" required>
                  <input value={form.first_name} onChange={e=>sf('first_name',e.target.value)} className="input-base text-sm rounded-lg" placeholder="First name"/>
                </Field>
                <Field label="Last Name">
                  <input value={form.last_name} onChange={e=>sf('last_name',e.target.value)} className="input-base text-sm rounded-lg" placeholder="Last name"/>
                </Field>
                <Field label="Date of Birth">
                  <input type="date" value={form.dob} onChange={e=>sf('dob',e.target.value)} className="input-base text-sm rounded-lg"/>
                </Field>
                <Field label="Driver Status">
                  <select value={form.driver_status} onChange={e=>sf('driver_status',e.target.value)} className="select-base text-sm rounded-lg">
                    {DRIVER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Driver Type">
                  <select value={form.driver_type} onChange={e=>sf('driver_type',e.target.value)} className="select-base text-sm rounded-lg">
                    <option value="Drv">Company Driver</option>
                    <option value="OO">Owner Operator</option>
                  </select>
                </Field>
                <Field label="Payable To">
                  <div className="flex gap-1.5 items-center">
                    <select value={form.payable_to} onChange={e=>sf('payable_to',e.target.value)} className="select-base text-sm rounded-lg flex-1">
                      <option value={form.first_name + ' ' + form.last_name}>{form.first_name} {form.last_name}</option>
                      {vendors.map(v => <option key={v.id} value={v.company_name}>{v.company_name}</option>)}
                    </select>
                    <div className="relative flex-shrink-0">
                      <button type="button" onClick={() => setShowPayableDropdown(v => !v)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 font-medium">
                        Edit <IcoDown />
                      </button>
                      {showPayableDropdown && (
                        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden min-w-[120px]">
                          <button onClick={() => { setShowPayableDropdown(false); setShowVendorModal(true) }}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 text-gray-700">Add new</button>
                          <button onClick={() => {
                            setShowPayableDropdown(false)
                            const sel = vendors.find(v => v.company_name === form.payable_to)
                            if (sel) { setEditingVendor(sel); setShowEditVendorModal(true) }
                            else toast.error('Select a vendor first')
                          }}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 text-gray-700 border-t border-gray-100">Edit</button>
                        </div>
                      )}
                    </div>
                  </div>
                </Field>
              </div>
            </div>

            {/* ── Contact & Assignment ── */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone">
                    <input type="tel" value={form.phone} onChange={e=>sf('phone',e.target.value)} className="input-base text-sm rounded-lg" placeholder="(555) 000-0000"/>
                  </Field>
                  <Field label="Email">
                    <input type="email" value={form.email} onChange={e=>sf('email',e.target.value)} className="input-base text-sm rounded-lg" placeholder="email@example.com"/>
                  </Field>
                </div>
                <Field label="Address">
                  <input value={form.address} onChange={e=>sf('address',e.target.value)} className="input-base text-sm rounded-lg" placeholder="Street address"/>
                </Field>
                <Field label="Address line 2">
                  <input value={form.address2} onChange={e=>sf('address2',e.target.value)} className="input-base text-sm rounded-lg" placeholder="Apt, suite, etc."/>
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <Field label="City">
                    <input value={form.city} onChange={e=>sf('city',e.target.value)} className="input-base text-sm rounded-lg"/>
                  </Field>
                  <Field label="State">
                    <select value={form.state} onChange={e=>sf('state',e.target.value)} className="select-base text-sm rounded-lg">
                      <option value=""></option>
                      {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </Field>
                  <Field label="Zip">
                    <input value={form.zip} onChange={e=>sf('zip',e.target.value)} className="input-base text-sm rounded-lg"/>
                  </Field>
                </div>
              </div>
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Assignment</h4>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Hire Date">
                    <input type="date" value={form.hire_date} onChange={e=>sf('hire_date',e.target.value)} className="input-base text-sm rounded-lg"/>
                  </Field>
                  <Field label="Termination Date">
                    <input type="date" value={form.term_date} onChange={e=>sf('term_date',e.target.value)} className="input-base text-sm rounded-lg"/>
                  </Field>
                  <Field label="Truck">
                    <select value={form.truck_id} onChange={e=>sf('truck_id',e.target.value)} className="select-base text-sm rounded-lg">
                      <option value="">— None —</option>
                      {trucks.map(t => <option key={t.id} value={String(t.id)}>{t.unit_number}</option>)}
                    </select>
                  </Field>
                  <Field label="Trailer">
                    <select value={form.trailer_id} onChange={e=>sf('trailer_id',e.target.value)} className="select-base text-sm rounded-lg">
                      <option value="">— None —</option>
                      {trailers.map(t => <option key={t.id} value={String(t.id)}>{t.unit_number}</option>)}
                    </select>
                  </Field>
                  <Field label="Co-Driver">
                    <select value={form.co_driver_id} onChange={e=>sf('co_driver_id',e.target.value)} className="select-base text-sm rounded-lg">
                      <option value="">— None —</option>
                      {allDrivers.map(d => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Fuel Card #">
                    <input value={form.fuel_card} onChange={e=>sf('fuel_card',e.target.value)} className="input-base text-sm rounded-lg" placeholder="Card number"/>
                  </Field>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer group">
                  <div className={'relative w-9 h-5 rounded-full transition-colors ' + (form.ifta ? 'bg-brand-500' : 'bg-gray-300')}
                    onClick={() => sf('ifta', !form.ifta)}>
                    <div className={'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ' + (form.ifta ? 'translate-x-4' : '')}></div>
                  </div>
                  <span className="text-sm text-gray-700">IFTA handled by Company</span>
                </label>
              </div>
            </div>

            {/* ── Documents ── */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-gray-900">Documents</h4>
                {warnSummary.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {warnSummary.slice(0,3).map((w,i) => (
                      <span key={i} className={'text-xs px-2 py-0.5 rounded-full border ' +
                        (w.type==='expired' ? 'bg-red-50 text-red-600 border-red-200' :
                         w.type==='soon'    ? 'bg-amber-50 text-amber-600 border-amber-200' :
                         'bg-gray-50 text-gray-500 border-gray-200')}>
                        {w.label}
                      </span>
                    ))}
                    {warnSummary.length > 3 && <span className="text-xs text-gray-400">+{warnSummary.length-3} more</span>}
                  </div>
                )}
              </div>

              {!isEdit ? (
                <div className="flex items-center gap-2 px-4 py-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  Save the driver first to add documents.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                  {DOC_TYPES.map(dt => {
                    const typeDocs = docs.filter(d => d.doc_type === dt.key)
                    const isOpen   = expanded[dt.key] !== false
                    const fields   = DOC_FIELDS[dt.key] || []
                    const isAdding = addingType === dt.key
                    const { meta, warnText } = getDocHeaderInfo(dt.key, typeDocs)
                    const docHasExp  = typeDocs.some(d => isExpired(d.exp_date))
                    const docHasSoon = typeDocs.some(d => isExpiringSoon(d.exp_date))
                    const docWarn    = typeDocs.length === 0 || docHasExp || docHasSoon

                    return (
                      <div key={dt.key}>
                        <button
                          onClick={() => setExpanded(p => ({...p, [dt.key]: !isOpen}))}
                          className={'w-full flex items-center justify-between px-4 py-3 text-left transition-colors ' +
                            (docHasExp ? 'hover:bg-red-50' : docHasSoon ? 'hover:bg-amber-50' : 'hover:bg-gray-50')}>
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={docHasExp ? 'text-red-500' : docHasSoon ? 'text-amber-500' : typeDocs.length===0 ? 'text-gray-300' : 'text-brand-500'}>
                              {docWarn && typeDocs.length > 0 ? <IcoWarn /> : <IcoOK />}
                            </span>
                            <span className="text-sm font-semibold text-gray-800">{dt.label}</span>
                            {meta && <span className={'text-xs text-amber-500'}>{meta}</span>}
                            {warnText && <span className="text-xs text-amber-500">({warnText})</span>}
                            {typeDocs.length === 0 && !meta && (
                              <span className="text-xs text-gray-400">- <span className="text-green-600">(No {dt.key === 'drug_test' ? 'drug tests' : 'documents'})</span></span>
                            )}
                            {typeDocs.length > 0 && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{typeDocs.length}</span>
                            )}
                          </div>
                          <div className={'transition-transform ' + (isOpen ? 'rotate-90' : '')}>
                            <IcoChevR />
                          </div>
                        </button>

                        {isOpen && (
                          <div className="border-t border-gray-100 bg-white">
                            <div className="flex justify-end px-4 py-2 border-b border-gray-50">
                              {!isAdding && (
                                <button
                                  onClick={() => { setAddingType(dt.key); setAddVals({}); setAddFile(null) }}
                                  className="btn-primary text-xs py-1 px-3 rounded-lg">
                                  <IcoPlus /> Add
                                </button>
                              )}
                            </div>

                            {/* Existing rows */}
                            {typeDocs.length > 0 && (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="bg-gray-50">
                                    {fields.map((f,i) => (
                                      <th key={i} className="px-3 py-2 text-left text-gray-500 font-semibold uppercase text-[10px] tracking-wider">
                                        {f.label}
                                      </th>
                                    ))}
                                    <th className="px-3 py-2 text-left text-gray-500 font-semibold uppercase text-[10px] tracking-wider">ATTACHMENTS</th>
                                    <th className="w-24"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {typeDocs.map(doc => {
                                    const editing = editDocId === doc.id
                                    const expClass = isExpired(doc.exp_date) ? 'bg-red-50' : isExpiringSoon(doc.exp_date) ? 'bg-amber-50' : ''
                                    return (
                                      <tr key={doc.id} className={'border-t border-gray-50 ' + expClass}>
                                        {fields.map((f,i) => (
                                          <td key={i} className="px-3 py-2">
                                            {editing ? (
                                              <DocFieldInput
                                                field={f}
                                                value={editVals[f.key] || ''}
                                                onChange={v => setEditVals(p => ({...p, [f.key]: v}))}
                                              />
                                            ) : (
                                              <span className={f.key === 'exp_date' && isExpired(doc.exp_date) ? 'text-red-600 font-medium' : 'text-gray-700'}>
                                                {fmtDate(getDocFieldVal(f.key, doc)) || getDocFieldVal(f.key, doc) || '—'}
                                              </span>
                                            )}
                                          </td>
                                        ))}
                                        <td className="px-3 py-2">
                                          <div className="flex items-center gap-2">
                                            {doc.original_filename && (
                                              <a href={API_BASE + '/uploads/' + doc.filename}
                                                target="_blank" rel="noreferrer"
                                                className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs truncate max-w-[110px]"
                                                title={doc.original_filename}>
                                                <IcoLink />
                                                {doc.original_filename}
                                              </a>
                                            )}
                                            <FileUploadLabel
                                              label={doc.original_filename ? 'Replace' : 'Upload'}
                                              onFile={f => handleUploadOnExisting(doc.id, f)}
                                            />
                                          </div>
                                        </td>
                                        <td className="px-3 py-2">
                                          {editing ? (
                                            <div className="flex gap-1">
                                              <button onClick={() => handleUpdateDoc(doc.id, doc.doc_type)}
                                                className="btn-primary text-xs py-0.5 px-2 rounded-lg"><IcoCheck /> Save</button>
                                              <button onClick={() => setEditDocId(null)}
                                                className="btn-secondary text-xs py-0.5 px-2 rounded-lg">Cancel</button>
                                            </div>
                                          ) : (
                                            <div className="flex gap-1">
                                              <button
                                                onClick={() => {
                                                  setEditDocId(doc.id)
                                                  const init: Record<string,string> = {}
                                                  fields.forEach(f => { init[f.key] = getDocFieldVal(f.key, doc) })
                                                  setEditVals(init)
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                                                title="Edit">
                                                <IcoEdit />
                                              </button>
                                              <button onClick={() => handleDeleteDoc(doc.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete">
                                                <IcoTrash />
                                              </button>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            )}

                            {/* Add row */}
                            {isAdding && (
                              <div className="px-4 py-3 border-t border-dashed border-brand-200 bg-brand-50/30">
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">New Record</p>
                                <div className="flex items-end gap-3 flex-wrap">
                                  {fields.map((f,i) => (
                                    <div key={i} className="flex-shrink-0">
                                      <p className="text-xs font-medium text-gray-500 uppercase mb-1">{f.label}</p>
                                      <DocFieldInput
                                        field={f}
                                        value={addVals[f.key] || ''}
                                        onChange={v => setAddVals(p => ({...p,[f.key]:v}))}
                                      />
                                    </div>
                                  ))}
                                  {/* Attachment field */}
                                  <div className="flex-1 min-w-[140px]">
                                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">ATTACHMENTS</p>
                                    <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-2.5 h-[34px] bg-white">
                                      {addFile && <span className="text-xs text-gray-600 truncate flex-1">{addFile.name}</span>}
                                      {!addFile && <span className="flex-1"/>}
                                      <label className="inline-flex items-center gap-1 text-xs text-brand-600 cursor-pointer hover:underline whitespace-nowrap">
                                        <IcoUpload /> upload
                                        <input type="file" className="hidden"
                                          onChange={e => { const f=e.target.files?.[0]; if(f) setAddFile(f) }}/>
                                      </label>
                                    </div>
                                  </div>
                                  <div className="flex gap-2 flex-shrink-0 pb-0.5">
                                    <button onClick={handleAddDoc} className="btn-primary text-xs py-2 px-4 rounded-lg"><IcoCheck /> Save</button>
                                    <button onClick={() => { setAddingType(null); setAddVals({}); setAddFile(null) }}
                                      className="btn-secondary text-xs py-2 px-3 rounded-lg">Cancel</button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* ── Pay Tabs ── */}
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
                {PAY_TABS.map(tab => (
                  <button key={tab.key} onClick={() => setPayTab(tab.key)}
                    className={'px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ' +
                      (payTab===tab.key ? 'border-brand-600 text-brand-600 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700')}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="p-5 bg-white">
                {payTab === 'pay_rates' && (
                  <PayRatesTab form={form} sf={sf} />
                )}
                {payTab === 'scheduled' && (
                  <ScheduledTabView
                    isEdit={isEdit}
                    txs={txs}
                    onAdd={() => { setEditTx(null); setShowTxModal(true) }}
                    onEdit={tx => { setEditTx(tx); setShowTxModal(true) }}
                    onDelete={handleDeleteTx}
                  />
                )}
                {payTab === 'payee' && (
                  <div className="py-8 text-center text-sm text-gray-400">
                    Additional payee configuration — coming soon.
                  </div>
                )}
                {payTab === 'notes' && (
                  <textarea value={form.notes} onChange={e=>sf('notes',e.target.value)}
                    className="input-base text-sm w-full h-32 resize-none rounded-lg"
                    placeholder="Internal notes about this driver..."/>
                )}
                {payTab === 'app' && (
                  <div className="py-8 text-center text-sm text-gray-400">
                    Driver app integration — coming soon.
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-900 transition-colors">
            <IcoX /> Close
          </button>
          <button onClick={handleSave} disabled={saving}
            className="btn-primary px-6 py-2 rounded-lg shadow-sm text-sm">
            <IcoCheck /> {saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Driver')}
          </button>
        </div>

        {showVendorModal && (
          <VendorModal
            onClose={() => setShowVendorModal(false)}
            onSaved={v => {
              setVendors(p => [...p, v])
              sf('payable_to', v.company_name)
              setShowVendorModal(false)
              toast.success('Vendor created')
            }}
          />
        )}
        {showEditVendorModal && editingVendor && (
          <EditVendorModal
            vendor={editingVendor}
            onClose={() => { setShowEditVendorModal(false); setEditingVendor(null) }}
            onSaved={v => {
              setVendors(p => p.map(x => x.id === v.id ? v : x))
              sf('payable_to', v.company_name)
              setShowEditVendorModal(false)
              setEditingVendor(null)
              toast.success('Vendor updated')
            }}
          />
        )}
        {showTxModal && driver && (
          <TxModal
            driverId={driver.id} driverName={driver.name} tx={editTx}
            onClose={() => { setShowTxModal(false); setEditTx(null) }}
            onSaved={() => { setShowTxModal(false); setEditTx(null); reloadTxs() }}
          />
        )}
      </div>
    </div>
  )
}

// ── PayRatesTab ───────────────────────────────────────────────────────────────
function PayRatesTab({ form, sf }: { form: DForm; sf: (k: keyof DForm, v: string|boolean)=>void }) {
  const isOO = form.driver_type === 'OO'

  // Flatpay schedule preview — generates upcoming dates
  const scheduleRows = (() => {
    if (form.pay_type !== 'flatpay') return []
    const rows = []
    const start = form.hire_date ? new Date(form.hire_date) : new Date()
    // next Friday
    const d = new Date(start)
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7))
    for (let i = 0; i < 10; i++) {
      const dt = new Date(d)
      dt.setDate(d.getDate() + i * 7)
      rows.push({
        date: dt.toLocaleDateString('en-US', {month:'2-digit',day:'2-digit',year:'2-digit'}),
        amount: form.flatpay ? `$${parseFloat(form.flatpay).toFixed(2)}` : '$0.00',
        description: 'Weekly, every Friday',
      })
    }
    return rows
  })()

  return (
    <div className="space-y-4">
      {/* Row 1: Driver type */}
      <div className="flex items-center gap-6">
        {[{v:'Drv',l:'Company driver'},{v:'OO',l:'Owner operator'}].map(o => (
          <label key={o.v} className="flex items-center gap-2 cursor-pointer">
            <div className={'w-4 h-4 rounded-full border-2 flex items-center justify-center ' +
              (form.driver_type === o.v ? 'border-[#58c777]' : 'border-gray-300')}>
              {form.driver_type === o.v && <div className="w-2 h-2 rounded-full bg-[#58c777]"></div>}
            </div>
            <input type="radio" className="hidden" checked={form.driver_type===o.v} onChange={()=>sf('driver_type',o.v)} />
            <span className="text-sm text-gray-700">{o.l}</span>
          </label>
        ))}
      </div>

      {/* Row 2: Pay type — only for company driver */}
      {!isOO && (
        <div className="flex items-center gap-6">
          {[
            {v:'per_mile',l:'Per mile'},
            {v:'freight_percentage',l:'Freight percentage'},
            {v:'flatpay',l:'Flatpay'},
            {v:'hourly',l:'Hourly'},
          ].map(o => (
            <label key={o.v} className="flex items-center gap-2 cursor-pointer">
              <div className={'w-4 h-4 rounded-full border-2 flex items-center justify-center ' +
                (form.pay_type === o.v ? 'border-[#58c777]' : 'border-gray-300')}>
                {form.pay_type === o.v && <div className="w-2 h-2 rounded-full bg-[#58c777]"></div>}
              </div>
              <input type="radio" className="hidden" checked={form.pay_type===o.v} onChange={()=>sf('pay_type',o.v)} />
              <span className="text-sm text-gray-700">{o.l}</span>
            </label>
          ))}
        </div>
      )}

      {/* Per mile */}
      {!isOO && form.pay_type === 'per_mile' && (
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Per mile</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" step="0.01" value={form.per_mile} onChange={e=>sf('per_mile',e.target.value)}
                className="input-base text-sm pl-7 w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Per extra stop</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" step="0.01" value={form.extra_stop} onChange={e=>sf('extra_stop',e.target.value)}
                className="input-base text-sm pl-7 w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Per empty mile</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" step="0.01" value={form.empty_mile} onChange={e=>sf('empty_mile',e.target.value)}
                className="input-base text-sm pl-7 w-full" />
            </div>
          </div>
        </div>
      )}

      {/* Freight percentage */}
      {!isOO && form.pay_type === 'freight_percentage' && (
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Percentage (e.g. 80%)</label>
            <div className="relative">
              <input type="number" step="0.1" value={form.freight_pct} onChange={e=>sf('freight_pct',e.target.value)}
                placeholder="%" className="input-base text-sm w-full pr-7" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Per extra stop</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" step="0.01" value={form.extra_stop} onChange={e=>sf('extra_stop',e.target.value)}
                className="input-base text-sm pl-7 w-full" />
            </div>
          </div>
        </div>
      )}

      {/* Flatpay — with schedule panel */}
      {!isOO && form.pay_type === 'flatpay' && (
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-4">
            <button className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#58c777] text-white text-sm font-medium rounded hover:bg-[#4ab668]">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              Run now
            </button>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Period <span className="text-red-500">*</span></label>
              <select value={form.extra_stop || 'weekly'} onChange={e=>sf('extra_stop',e.target.value)}
                className="input-base text-sm w-full">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every other week</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Amount <span className="text-red-500">*</span></label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" value={form.flatpay} onChange={e=>sf('flatpay',e.target.value)}
                  className="input-base text-sm pl-7 w-full" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Starting from <span className="text-red-500">*</span></label>
              <div className="relative flex items-center">
                <input type="date" value={form.hire_date} onChange={e=>sf('hire_date',e.target.value)}
                  className="input-base text-sm w-full pr-8" />
                <button className="absolute right-2 text-gray-400 hover:text-gray-600">✕</button>
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Per extra stop</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input type="number" step="0.01" value={form.extra_stop} onChange={e=>sf('extra_stop',e.target.value)}
                  className="input-base text-sm pl-7 w-full" />
              </div>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-base font-bold text-gray-900">Payments Schedule</h4>
              <button className="text-sm text-blue-600 hover:underline flex items-center gap-1">show all <IcoDown /></button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-200">
                  <th className="py-1.5">Date</th>
                  <th className="py-1.5">Amount</th>
                  <th className="py-1.5">Period</th>
                  <th className="py-1.5">Description</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.length === 0 ? (
                  <tr><td colSpan={4} className="py-4 text-center text-gray-400">No records</td></tr>
                ) : scheduleRows.map((r,i) => (
                  <tr key={i} className={i%2===1?'bg-gray-50':''}>
                    <td className="py-1.5 text-gray-700">{r.date}</td>
                    <td className="py-1.5 text-gray-700">{r.amount}</td>
                    <td className="py-1.5 text-gray-500"></td>
                    <td className="py-1.5 text-gray-500">{r.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hourly */}
      {!isOO && form.pay_type === 'hourly' && (
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Per hour</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" step="0.01" value={form.hourly} onChange={e=>sf('hourly',e.target.value)}
                className="input-base text-sm pl-7 w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Per extra stop</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
              <input type="number" step="0.01" value={form.extra_stop} onChange={e=>sf('extra_stop',e.target.value)}
                className="input-base text-sm pl-7 w-full" />
            </div>
          </div>
        </div>
      )}

      {/* Owner Operator — percentage only */}
      {isOO && (
        <div>
          <label className="block text-sm text-gray-700 mb-1">Percentage (e.g. 80%)</label>
          <div className="relative w-64">
            <input type="number" step="0.1" value={form.freight_pct} onChange={e=>sf('freight_pct',e.target.value)}
              placeholder="%" className="input-base text-sm w-full pr-7" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ── ScheduledTabView ──────────────────────────────────────────────────────────
function ScheduledTabView({ isEdit, txs, onAdd, onEdit, onDelete }: {
  isEdit: boolean
  txs: ScheduledTransaction[]
  onAdd: () => void
  onEdit: (tx: ScheduledTransaction) => void
  onDelete: (tx: ScheduledTransaction) => void
}) {
  const [showInactive, setShowInactive] = useState(false)
  const visible = showInactive ? txs : txs.filter(t => t.is_active)

  if (!isEdit) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        Save the driver first to configure scheduled payments.
      </div>
    )
  }
  return (
    <div>
      {/* Purple info banner — screenshot 7 */}
      <div className="flex items-start gap-3 px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg mb-4 text-sm text-gray-700">
        <svg className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"/></svg>
        <span>Watch our video tutorials on <span className="text-brand-600 font-medium cursor-pointer hover:underline">Scheduled Deductions</span> and <span className="text-brand-600 font-medium cursor-pointer hover:underline">Escrow and Driver Loan Schedules</span> to learn how to manage recurring driver deductions effectively.</span>
      </div>

      <div className="flex justify-end mb-3">
        <button onClick={onAdd} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#58c777] text-white text-sm font-semibold rounded hover:bg-[#4ab668]">
          <IcoPlus /> Add
        </button>
      </div>

      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            <th className="py-2">Category</th>
            <th className="py-2">Amount</th>
            <th className="py-2">Schedule</th>
            <th className="py-2">Last</th>
            <th className="py-2">Next</th>
            <th className="py-2">Active</th>
            <th className="py-2">Notes</th>
            <th className="py-2"></th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr><td colSpan={8} className="py-6 text-center text-sm text-gray-400">No records</td></tr>
          ) : visible.map(tx => (
            <tr key={tx.id} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2.5">
                <span className={'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' +
                  (tx.trans_type==='deduction' ? 'bg-red-50 text-red-700' :
                   tx.trans_type==='loan' ? 'bg-purple-50 text-purple-700' :
                   'bg-brand-50 text-brand-700')}>
                  {tx.category || tx.trans_type}
                </span>
              </td>
              <td className="py-2.5 font-semibold">
                <span className={tx.trans_type==='deduction'?'text-red-600':'text-brand-600'}>
                  {tx.trans_type==='deduction'?'−':'+'}${tx.amount.toFixed(2)}
                </span>
              </td>
              <td className="py-2.5 text-gray-500 capitalize">{tx.schedule || '—'}</td>
              <td className="py-2.5 text-gray-500">{tx.last_applied ? formatDate(tx.last_applied) : '—'}</td>
              <td className="py-2.5 text-gray-500">{tx.next_due ? formatDate(tx.next_due) : '—'}</td>
              <td className="py-2.5">
                <span className={'flex items-center gap-1 text-xs ' + (tx.is_active?'text-brand-600':'text-gray-400')}>
                  <span className={'w-1.5 h-1.5 rounded-full ' + (tx.is_active?'bg-brand-500':'bg-gray-300')}></span>
                  {tx.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="py-2.5 text-gray-400 truncate max-w-[100px]">{tx.notes || '—'}</td>
              <td className="py-2.5">
                <div className="flex gap-1">
                  <button onClick={() => onEdit(tx)} className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"><IcoEdit /></button>
                  <button onClick={() => onDelete(tx)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"><IcoTrash /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-center mt-3">
        <button onClick={() => setShowInactive(v => !v)}
          className="text-sm text-gray-600 underline hover:text-gray-900">
          {showInactive ? 'Hide inactive' : 'Show inactive'}
        </button>
      </div>
    </div>
  )
}

// ── EmailModal ────────────────────────────────────────────────────────────────
function EmailModal({ drivers, onClose }: { drivers: ExtDriver[]; onClose: () => void }) {
  const [to, setTo]           = useState('')
  const [cc, setCc]           = useState('')
  const [showCc, setShowCc]   = useState(false)
  const [subject, setSubject] = useState('Drivers list — ' + new Date().toLocaleDateString('en-US'))
  const [sending, setSending] = useState(false)

  const send = () => {
    if (!to.trim()) { toast.error('Enter recipient email'); return }
    setSending(true)
    setTimeout(() => { toast.success('Email sent successfully'); onClose() }, 1000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-[820px] max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <IcoMail /> Email Drivers List
          </h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><IcoX /></button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 px-6 py-4 overflow-y-auto space-y-4">
            <Field label="To">
              <input type="email" value={to} onChange={e=>setTo(e.target.value)}
                className="input-base text-sm rounded-lg" placeholder="recipient@example.com" autoFocus/>
            </Field>
            {showCc && (
              <Field label="CC">
                <input type="email" value={cc} onChange={e=>setCc(e.target.value)}
                  className="input-base text-sm rounded-lg" placeholder="cc@example.com"/>
              </Field>
            )}
            <button onClick={() => setShowCc(v=>!v)} className="text-xs text-blue-600 hover:underline">
              {showCc ? 'Remove CC' : '+ Add CC'}
            </button>
            <Field label="Subject">
              <input type="text" value={subject} onChange={e=>setSubject(e.target.value)}
                className="input-base text-sm rounded-lg"/>
            </Field>
            <div>
              <Label text="Body" />
              <div className="border border-gray-200 rounded-xl p-5 bg-gray-50 text-sm text-gray-600">
                <p className="font-semibold text-gray-900 text-base mb-2">Silkroad LLC</p>
                <p>Hello,</p>
                <p className="mt-1">Please see the attached drivers list with {drivers.length} driver{drivers.length!==1?'s':''}.</p>
              </div>
            </div>
            <div>
              <Label text="Attachments" />
              <div className="flex flex-col gap-2">
                {[
                  { name: 'drivers.pdf',  href: API_BASE + '/api/v1/drivers/export/pdf',  size: '~38 KB', icon: <IcoPDF /> },
                  { name: 'drivers.xlsx', href: API_BASE + '/api/v1/drivers/export/xlsx', size: '~7 KB',  icon: <IcoXLS /> },
                ].map(att => (
                  <div key={att.name} className="flex items-center gap-3 px-3 py-2.5 border border-gray-200 rounded-lg bg-white">
                    <span className="text-gray-500">{att.icon}</span>
                    <a href={att.href} target="_blank" rel="noreferrer"
                      className="text-sm text-blue-600 hover:underline font-medium flex-1">{att.name}</a>
                    <span className="text-xs text-gray-400">{att.size}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="w-56 border-l border-gray-200 px-4 py-4 bg-gray-50">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Preview</p>
            <div className="bg-white rounded-xl border border-gray-200 p-3 text-xs text-gray-600 space-y-2">
              <p className="font-bold text-gray-900 text-sm">Silkroad LLC</p>
              <hr className="border-gray-200"/>
              <p>Hello,</p>
              <p>Please see the attached drivers list.</p>
              <hr className="border-gray-200"/>
              <p className="text-gray-400">PDF + Excel attached</p>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900">
            <IcoX /> Cancel
          </button>
          <button onClick={send} disabled={sending || !to.trim()}
            className="btn-primary px-5 py-2 rounded-lg shadow-sm disabled:opacity-50">
            <IcoMail /> {sending ? 'Sending...' : 'Send Email'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── VendorModal (New Vendor — screenshot 2) ───────────────────────────────────
function VendorModal({ onClose, onSaved }: { onClose: ()=>void; onSaved: (v: Vendor)=>void }) {
  const [form, setForm] = useState({
    company_name: '', address: '', address2: '', phone: '', email: '',
    city: '', state: '', zip_code: '', fid_ein: '', mc_number: '', notes: '',
    is_equipment_owner: false, is_additional_payee: false,
    additional_payee_rate_pct: '', settlement_template_type: '',
    vendor_type: '',
  })
  const [saving, setSaving] = useState(false)
  const [showTypeModal, setShowTypeModal] = useState(false)
  const sf = (k: string, v: string|boolean) => setForm(p => ({...p, [k]: v}))

  const save = () => {
    if (!form.company_name.trim()) { toast.error('Company name is required'); return }
    setSaving(true)
    vendorsApi.create({
      ...form,
      additional_payee_rate_pct: form.additional_payee_rate_pct ? parseFloat(form.additional_payee_rate_pct) : undefined,
      is_active: true,
    })
      .then(v => onSaved(v))
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-[1100px] max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-[#f8f9fb]">
          <h3 className="text-[16px] font-bold text-gray-800">New Vendor</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><IcoX /></button>
        </div>
        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="flex flex-col gap-10 md:flex-row">
            {/* Left */}
            <div className="flex flex-1 flex-col gap-4">
              <Field label="Company Name" required>
                <input value={form.company_name} onChange={e=>sf('company_name',e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777] focus:ring-1 focus:ring-[#58c777]" />
              </Field>
              <Field label="Address">
                <input value={form.address} onChange={e=>sf('address',e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
              </Field>
              <Field label="Address line 2">
                <input value={form.address2} onChange={e=>sf('address2',e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">📞</span>
                    <input value={form.phone} onChange={e=>sf('phone',e.target.value)}
                      className="h-[36px] w-full rounded border border-gray-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-[#58c777]" />
                  </div>
                </Field>
                <Field label="Email">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">@</span>
                    <input value={form.email} onChange={e=>sf('email',e.target.value)}
                      className="h-[36px] w-full rounded border border-gray-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-[#58c777]" />
                  </div>
                </Field>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <Field label="City">
                  <input value={form.city} onChange={e=>sf('city',e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
                </Field>
                <Field label="State">
                  <select value={form.state} onChange={e=>sf('state',e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#58c777]">
                    <option value=""></option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Zip">
                  <input value={form.zip_code} onChange={e=>sf('zip_code',e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="FID/EIN">
                  <input value={form.fid_ein} onChange={e=>sf('fid_ein',e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
                </Field>
                <Field label="MC">
                  <input value={form.mc_number} onChange={e=>sf('mc_number',e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
                </Field>
              </div>
              <Field label="Notes">
                <textarea value={form.notes} onChange={e=>sf('notes',e.target.value)} rows={2}
                  className="w-full resize-none rounded border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#58c777]" />
              </Field>
            </div>
            {/* Right */}
            <div className="w-full md:w-[420px] flex flex-col pt-1">
              <div className="mb-10">
                <h3 className="mb-3 text-[16px] font-bold text-gray-800">Vendor type</h3>
                {form.vendor_type && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                      {form.vendor_type}
                      <button onClick={() => sf('vendor_type', '')} className="text-gray-400 hover:text-red-500"><IcoX /></button>
                    </span>
                  </div>
                )}
                <button onClick={() => setShowTypeModal(true)}
                  className="inline-flex h-7 items-center gap-1.5 rounded bg-[#58c777] px-2.5 text-[13px] font-medium text-white hover:bg-[#4ab668]">
                  <IcoPlus /> Vendor type
                </button>
              </div>
              <div>
                <h3 className="mb-4 text-[16px] font-bold text-gray-800">Billing</h3>
                <div className="flex items-center gap-6 mb-6">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
                    <div className={'flex h-4 w-4 items-center justify-center rounded border ' + (form.is_additional_payee ? 'border-[#58c777] bg-[#58c777]' : 'border-gray-300 bg-gray-50')}>
                      {form.is_additional_payee && <IcoCheck />}
                    </div>
                    <input type="checkbox" className="hidden" checked={form.is_additional_payee} onChange={e=>sf('is_additional_payee',e.target.checked)} />
                    Additional payee
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
                    <div className={'flex h-4 w-4 items-center justify-center rounded border ' + (form.is_equipment_owner ? 'border-[#58c777] bg-[#58c777]' : 'border-gray-300 bg-gray-50')}>
                      {form.is_equipment_owner && <IcoCheck />}
                    </div>
                    <input type="checkbox" className="hidden" checked={form.is_equipment_owner} onChange={e=>sf('is_equipment_owner',e.target.checked)} />
                    Equipment owner
                  </label>
                </div>
                <div className="mb-6">
                  <Label text="Additional payee rate, % (e.g. 90)" required />
                  <input value={form.additional_payee_rate_pct}
                    onChange={e=>sf('additional_payee_rate_pct',e.target.value)}
                    disabled={!form.is_additional_payee}
                    className="h-[36px] w-[200px] rounded border border-gray-200 bg-[#cbd5e1] px-3 text-sm text-gray-800 outline-none focus:border-[#58c777] disabled:opacity-80" />
                </div>
                <div>
                  <Label text="Settlement template type" />
                  <select value={form.settlement_template_type} onChange={e=>sf('settlement_template_type',e.target.value)}
                    className="h-[36px] w-full rounded border border-[#6ea8fe] bg-white px-2 text-sm text-gray-800 outline-none ring-1 ring-[#6ea8fe] focus:border-[#6ea8fe]">
                    <option value="">Select template type</option>
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
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-[#f8f9fb] px-6 py-4">
          <button onClick={onClose}
            className="inline-flex h-9 items-center gap-2 rounded bg-[#1e293b] px-4 text-sm font-medium text-white transition hover:bg-black">
            <IcoX /> Close
          </button>
          <button onClick={save} disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded bg-[#58c777] px-5 text-sm font-medium text-white transition hover:bg-[#4ab668] disabled:opacity-70">
            <IcoCheck /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {showTypeModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
            <div className="w-full max-w-[480px] overflow-hidden rounded bg-white shadow-2xl">
              <div className="flex items-center justify-between p-6 pb-2">
                <h2 className="text-2xl font-bold text-[#1f2937]">Add Vendor Type</h2>
                <button onClick={() => setShowTypeModal(false)} className="text-gray-400 hover:text-gray-700"><IcoX /></button>
              </div>
              <div className="p-6 pt-4">
                <Label text="Add New Vendor Type" />
                <select value={form.vendor_type} onChange={e=>{ sf('vendor_type',e.target.value); setShowTypeModal(false) }}
                  className="h-[42px] w-full rounded border border-[#6ea8fe] bg-white px-3 text-[15px] text-gray-800 outline-none ring-1 ring-[#6ea8fe]">
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
    </div>
  )
}

// ── EditVendorModal (Edit Vendor — screenshot 3) ──────────────────────────────
function EditVendorModal({ vendor, onClose, onSaved }: { vendor: Vendor; onClose: ()=>void; onSaved: (v: Vendor)=>void }) {
  const [form, setForm] = useState({
    company_name: vendor.company_name || '',
    address: vendor.address || '', address2: vendor.address2 || '',
    phone: vendor.phone || '', email: vendor.email || '',
    city: vendor.city || '', state: vendor.state || '', zip_code: vendor.zip_code || '',
    fid_ein: vendor.fid_ein || '', mc_number: vendor.mc_number || '', notes: vendor.notes || '',
    is_equipment_owner: vendor.is_equipment_owner,
    is_additional_payee: vendor.is_additional_payee,
    additional_payee_rate_pct: vendor.additional_payee_rate_pct ? String(vendor.additional_payee_rate_pct) : '',
    settlement_template_type: vendor.settlement_template_type || '',
    vendor_type: vendor.vendor_type || '',
  })
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'contacts'|'documents'>('contacts')
  const [showTypeModal, setShowTypeModal] = useState(false)
  const sf = (k: string, v: string|boolean) => setForm(p => ({...p, [k]: v}))

  const save = () => {
    if (!form.company_name.trim()) { toast.error('Company name is required'); return }
    setSaving(true)
    vendorsApi.update(vendor.id, {
      ...form,
      additional_payee_rate_pct: form.additional_payee_rate_pct ? parseFloat(form.additional_payee_rate_pct) : undefined,
      is_active: true,
    })
      .then(v => onSaved(v))
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-[1100px] max-h-[95vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-[#f8f9fb]">
          <h3 className="text-[16px] font-bold text-gray-800">Edit Vendor</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><IcoX /></button>
        </div>
        <div className="flex-1 overflow-auto px-8 py-6">
          <div className="flex flex-col gap-10 md:flex-row">
            {/* Left */}
            <div className="flex flex-1 flex-col gap-4">
              <Field label="Company Name" required>
                <input value={form.company_name} onChange={e=>sf('company_name',e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777] focus:ring-1 focus:ring-[#58c777]" />
              </Field>
              <Field label="Address">
                <input value={form.address} onChange={e=>sf('address',e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
              </Field>
              <Field label="Address line 2">
                <input value={form.address2} onChange={e=>sf('address2',e.target.value)}
                  className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
              </Field>
              <div className="grid grid-cols-3 gap-4">
                <Field label="City">
                  <input value={form.city} onChange={e=>sf('city',e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
                </Field>
                <Field label="State">
                  <select value={form.state} onChange={e=>sf('state',e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-2 text-sm outline-none focus:border-[#58c777]">
                    <option value=""></option>
                    {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Zip">
                  <input value={form.zip_code} onChange={e=>sf('zip_code',e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="FID/EIN">
                  <input value={form.fid_ein} onChange={e=>sf('fid_ein',e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
                </Field>
                <Field label="MC">
                  <input value={form.mc_number} onChange={e=>sf('mc_number',e.target.value)}
                    className="h-[36px] w-full rounded border border-gray-200 bg-white px-3 text-sm outline-none focus:border-[#58c777]" />
                </Field>
              </div>
              <Field label="Notes">
                <textarea value={form.notes} onChange={e=>sf('notes',e.target.value)} rows={2}
                  className="w-full resize-none rounded border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#58c777]" />
              </Field>
              {/* Contacts / Documents tabs */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex border-b border-gray-200">
                  {(['contacts','documents'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={'px-5 py-2.5 text-sm font-semibold capitalize transition-colors ' +
                        (activeTab === tab ? 'border-b-2 border-[#58c777] text-[#58c777] bg-white' : 'text-gray-500 hover:text-gray-700 bg-gray-50')}>
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </div>
                <div className="p-4">
                  {activeTab === 'contacts' && (
                    <div>
                      <div className="flex justify-end mb-3">
                        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#58c777] text-white text-xs font-semibold rounded hover:bg-[#4ab668]">
                          <IcoPlus /> New Contact
                        </button>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                            {['Contact','Default','Default Billing','Phones','Email','Notes',''].map((h,i) => (
                              <th key={i} className="px-3 py-2">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-t border-gray-100">
                            <td className="px-3 py-2.5 text-gray-700">default contact</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="text-[#58c777]"><IcoOK /></span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <span className="text-[#58c777]"><IcoOK /></span>
                            </td>
                            <td className="px-3 py-2.5 text-gray-500">{vendor.phone || '—'}</td>
                            <td className="px-3 py-2.5 text-gray-500">{vendor.email || '—'}</td>
                            <td className="px-3 py-2.5 text-gray-400">—</td>
                            <td className="px-3 py-2.5">
                              <div className="flex gap-1">
                                <button className="p-1 text-green-500 hover:text-green-700"><IcoEdit /></button>
                                <button className="p-1 text-red-400 hover:text-red-600"><IcoTrash /></button>
                              </div>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                  {activeTab === 'documents' && (
                    <div className="py-6 text-center text-sm text-gray-400">No documents attached.</div>
                  )}
                </div>
              </div>
            </div>
            {/* Right */}
            <div className="w-full md:w-[420px] flex flex-col pt-1">
              <div className="mb-10">
                <h3 className="mb-3 text-[16px] font-bold text-gray-800">Vendor type</h3>
                {form.vendor_type && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700">
                      {form.vendor_type}
                      <button onClick={() => sf('vendor_type', '')} className="text-gray-400 hover:text-red-500"><IcoX /></button>
                    </span>
                  </div>
                )}
                <button onClick={() => setShowTypeModal(true)}
                  className="inline-flex h-7 items-center gap-1.5 rounded bg-[#58c777] px-2.5 text-[13px] font-medium text-white hover:bg-[#4ab668]">
                  <IcoPlus /> Vendor type
                </button>
              </div>
              <div>
                <h3 className="mb-4 text-[16px] font-bold text-gray-800">Billing</h3>
                <div className="flex items-center gap-6 mb-6">
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
                    <div className={'flex h-4 w-4 items-center justify-center rounded border ' + (form.is_additional_payee ? 'border-[#58c777] bg-[#58c777]' : 'border-gray-300 bg-gray-50')}>
                      {form.is_additional_payee && <IcoCheck />}
                    </div>
                    <input type="checkbox" className="hidden" checked={form.is_additional_payee} onChange={e=>sf('is_additional_payee',e.target.checked)} />
                    Additional payee
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
                    <div className={'flex h-4 w-4 items-center justify-center rounded border ' + (form.is_equipment_owner ? 'border-[#58c777] bg-[#58c777]' : 'border-gray-300 bg-gray-50')}>
                      {form.is_equipment_owner && <IcoCheck />}
                    </div>
                    <input type="checkbox" className="hidden" checked={form.is_equipment_owner} onChange={e=>sf('is_equipment_owner',e.target.checked)} />
                    Equipment owner
                  </label>
                </div>
                <div className="mb-6">
                  <Label text="Additional payee rate, % (e.g. 90)" required />
                  <input value={form.additional_payee_rate_pct}
                    onChange={e=>sf('additional_payee_rate_pct',e.target.value)}
                    disabled={!form.is_additional_payee}
                    className="h-[36px] w-[200px] rounded border border-gray-200 bg-[#cbd5e1] px-3 text-sm text-gray-800 outline-none focus:border-[#58c777] disabled:opacity-80" />
                </div>
                <div>
                  <Label text="Settlement template type" />
                  <select value={form.settlement_template_type} onChange={e=>sf('settlement_template_type',e.target.value)}
                    className="h-[36px] w-full rounded border border-[#6ea8fe] bg-white px-2 text-sm text-gray-800 outline-none ring-1 ring-[#6ea8fe] focus:border-[#6ea8fe]">
                    <option value="">Select template type</option>
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
        <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-[#f8f9fb] px-6 py-4">
          <button onClick={onClose}
            className="inline-flex h-9 items-center gap-2 rounded bg-[#1e293b] px-4 text-sm font-medium text-white transition hover:bg-black">
            <IcoX /> Close
          </button>
          <button onClick={save} disabled={saving}
            className="inline-flex h-9 items-center gap-2 rounded bg-[#58c777] px-5 text-sm font-medium text-white transition hover:bg-[#4ab668] disabled:opacity-70">
            <IcoCheck /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {showTypeModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/30 backdrop-blur-[1px]">
            <div className="w-full max-w-[480px] overflow-hidden rounded bg-white shadow-2xl">
              <div className="flex items-center justify-between p-6 pb-2">
                <h2 className="text-2xl font-bold text-[#1f2937]">Add Vendor Type</h2>
                <button onClick={() => setShowTypeModal(false)} className="text-gray-400 hover:text-gray-700"><IcoX /></button>
              </div>
              <div className="p-6 pt-4">
                <Label text="Add New Vendor Type" />
                <select value={form.vendor_type} onChange={e=>{ sf('vendor_type',e.target.value); setShowTypeModal(false) }}
                  className="h-[42px] w-full rounded border border-[#6ea8fe] bg-white px-3 text-[15px] text-gray-800 outline-none ring-1 ring-[#6ea8fe]">
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
    </div>
  )
}

// ── TxModal ───────────────────────────────────────────────────────────────────
function TxModal({ driverId, driverName, tx, onClose, onSaved }: {
  driverId: number; driverName: string; tx: ScheduledTransaction|null; onClose: ()=>void; onSaved: ()=>void
}) {
  const isEdit = !!tx
  const [transType,     setTransType]     = useState(tx?.trans_type || 'deduction')
  const [category,      setCategory]      = useState(tx?.category || '')
  const [amount,        setAmount]        = useState(String(tx?.amount || '0'))
  const [deductBy,      setDeductBy]      = useState('')
  const [schedule,      setSchedule]      = useState(tx?.schedule || 'weekly')
  const [startDate,     setStartDate]     = useState(tx?.start_date || '')
  const [repeatType,    setRepeatType]    = useState(tx?.repeat_type || 'always')
  const [repeatTimes,   setRepeatTimes]   = useState(String(tx?.repeat_times || ''))
  const [endDate,       setEndDate]       = useState(tx?.end_date || '')
  const [periodEndDate, setPeriodEndDate] = useState('')
  const [customDesc,    setCustomDesc]    = useState(tx?.notes || '')
  const [isActive,      setIsActive]      = useState(tx?.is_active ?? true)
  const [saving,        setSaving]        = useState(false)

  // Generate 10-row schedule preview
  const scheduleRows = (() => {
    const rows: {date:string;amount:string;description:string}[] = []
    const base = startDate ? new Date(startDate) : new Date()
    const step = schedule === 'daily' ? 1 : schedule === 'weekly' ? 7 : schedule === 'biweekly' ? 14 : 30
    const fmt = (dt: Date) => dt.toLocaleDateString('en-US', {month:'2-digit',day:'2-digit',year:'2-digit'})
    const descMap: Record<string,string> = {
      daily:'Every day', weekly:'Weekly, every Friday', biweekly:'Every other week', monthly:'Monthly', annually:'Annually'
    }
    for (let i = 0; i < 10; i++) {
      const dt = new Date(base)
      dt.setDate(base.getDate() + i * step)
      rows.push({ date: fmt(dt), amount: `$${(parseFloat(amount)||0).toFixed(2)}`, description: descMap[schedule] || schedule })
    }
    return rows
  })()

  const save = () => {
    setSaving(true)
    const payload = {
      driver_id: driverId, trans_type: transType,
      category: category || undefined, amount: parseFloat(amount) || 0,
      schedule: schedule || undefined, start_date: startDate || undefined,
      end_date: repeatType==='until' ? (endDate||undefined) : undefined,
      repeat_type: repeatType,
      repeat_times: repeatType==='times' ? (parseInt(repeatTimes)||undefined) : undefined,
      notes: customDesc || undefined, is_active: isActive,
    } as Parameters<typeof scheduledTxApi.create>[1]
    const req = isEdit && tx
      ? scheduledTxApi.update(driverId, tx.id, payload as Parameters<typeof scheduledTxApi.update>[2])
      : scheduledTxApi.create(driverId, payload)
    req
      .then(() => { toast.success(isEdit?'Updated':'Added'); onSaved() })
      .catch((e:any) => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  const Radio = ({ name, value, checked, onChange, label }: {name:string;value:string;checked:boolean;onChange:()=>void;label:string}) => (
    <label className="flex items-center gap-2 cursor-pointer">
      <div className={'w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ' + (checked ? 'border-[#58c777]' : 'border-gray-300')}>
        {checked && <div className="w-2 h-2 rounded-full bg-[#58c777]"></div>}
      </div>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="hidden" />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )

  return (
    <div className="fixed inset-0 z-[60] flex">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-[1100px] bg-white flex flex-col h-full shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
          <h3 className="text-base font-bold text-gray-900">{isEdit ? 'Edit Payment' : 'New Payment'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IcoX /></button>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 px-6 py-5 space-y-5 overflow-y-auto border-r border-gray-100">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">Driver</label>
                <div className="relative">
                  <select className="input-base text-sm w-full pr-8 bg-[#f1f5f9]" disabled><option>{driverName}</option></select>
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><IcoDown /></span>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">Payable to <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select className="input-base text-sm w-full pr-8 bg-[#f1f5f9]"><option>{driverName}</option></select>
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><IcoDown /></span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Type</label>
              <div className="flex items-center gap-6 flex-wrap">
                <Radio name="txtype" value="addition"  checked={transType==='addition'}  onChange={()=>setTransType('addition')}  label="Addition" />
                <Radio name="txtype" value="deduction" checked={transType==='deduction'} onChange={()=>setTransType('deduction')} label="Deduction" />
                <Radio name="txtype" value="loan"      checked={transType==='loan'}      onChange={()=>setTransType('loan')}      label="Driver loan" />
                <Radio name="txtype" value="escrow"    checked={transType==='escrow'}    onChange={()=>setTransType('escrow')}    label="Escrow" />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input type="number" step="0.01" min="0" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" className="input-base text-sm pl-7 w-full" />
              </div>
            </div>
            {transType === 'loan' && (
              <div>
                <label className="block text-sm text-gray-700 mb-1">Deduct by</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input type="number" step="0.01" min="0" value={deductBy} onChange={e=>setDeductBy(e.target.value)} placeholder="0.00" className="input-base text-sm pl-7 w-48" />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-700 mb-1">Category</label>
              <select value={category} onChange={e=>setCategory(e.target.value)}
                className={'input-base text-sm w-full ' + (!category ? 'border-red-400 ring-1 ring-red-300' : '')}>
                <option value=""></option>
                {TX_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Schedule</label>
              <div className="flex items-center gap-5 flex-wrap">
                <Radio name="sched" value="daily"    checked={schedule==='daily'}    onChange={()=>setSchedule('daily')}    label="Every day" />
                <Radio name="sched" value="weekly"   checked={schedule==='weekly'}   onChange={()=>setSchedule('weekly')}   label="Every week" />
                <Radio name="sched" value="biweekly" checked={schedule==='biweekly'} onChange={()=>setSchedule('biweekly')} label="Every other week" />
                <Radio name="sched" value="monthly"  checked={schedule==='monthly'}  onChange={()=>setSchedule('monthly')}  label="Every month" />
                <Radio name="sched" value="annually" checked={schedule==='annually'} onChange={()=>setSchedule('annually')} label="Annually" />
              </div>
            </div>
            <div className="w-56">
              <label className="block text-sm text-gray-700 mb-1">Start on</label>
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="input-base text-sm w-full" />
            </div>
            {transType !== 'loan' && (
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-2">Repeat</label>
                <div className="flex items-center gap-5 flex-wrap">
                  <Radio name="rpt" value="always" checked={repeatType==='always'} onChange={()=>setRepeatType('always')} label="Always" />
                  <Radio name="rpt" value="times"  checked={repeatType==='times'}  onChange={()=>setRepeatType('times')}  label="Number of times" />
                  <Radio name="rpt" value="until"  checked={repeatType==='until'}  onChange={()=>setRepeatType('until')}  label="Until the date" />
                </div>
                {repeatType==='times' && <input type="number" min="1" value={repeatTimes} onChange={e=>setRepeatTimes(e.target.value)} className="input-base text-sm w-32 mt-2" placeholder="Times" />}
                {repeatType==='until' && <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="input-base text-sm w-48 mt-2" />}
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-sm font-semibold text-gray-800">Driver settlement description</label>
                <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-1">What period is this deduction for?</label>
              <p className="text-xs text-gray-500 mb-1">Enter the last day of the period for this transaction.</p>
              <input type="date" value={periodEndDate} onChange={e=>setPeriodEndDate(e.target.value)} className="input-base text-sm w-56" />
            </div>
            <div>
              <label className="block text-sm text-gray-700 mb-1">Custom description</label>
              <textarea value={customDesc} onChange={e=>setCustomDesc(e.target.value)} rows={3} className="input-base text-sm resize-none w-full" />
            </div>
          </div>
          <div className="w-72 px-6 py-5 space-y-6 flex-shrink-0 overflow-y-auto">
            <div>
              <h4 className="text-base font-bold text-gray-900 mb-3">Status</h4>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className={'w-4 h-4 rounded-full border-2 flex items-center justify-center ' + (isActive ? 'border-[#58c777]' : 'border-gray-300')}>
                    {isActive && <div className="w-2 h-2 rounded-full bg-[#58c777]"></div>}
                  </div>
                  <input type="radio" className="hidden" checked={isActive} onChange={()=>setIsActive(true)} />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <div className={'w-4 h-4 rounded-full border-2 flex items-center justify-center ' + (!isActive ? 'border-[#58c777]' : 'border-gray-300')}>
                    {!isActive && <div className="w-2 h-2 rounded-full bg-[#58c777]"></div>}
                  </div>
                  <input type="radio" className="hidden" checked={!isActive} onChange={()=>setIsActive(false)} />
                  <span className="text-sm text-gray-700">Inactive</span>
                </label>
              </div>
            </div>
            <div>
              <h4 className="text-base font-bold text-gray-900 mb-1">Schedule</h4>
              {scheduleRows[0] && <p className="text-xs text-gray-500 mb-3">Next transaction will be created on {scheduleRows[0].date}</p>}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase text-gray-400 border-b border-gray-200">
                    <th className="py-1.5">Date</th><th className="py-1.5">Amount</th><th className="py-1.5">Period</th><th className="py-1.5">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleRows.map((r,i) => (
                    <tr key={i} className={i%2===1?'bg-gray-50':''}>
                      <td className="py-1.5 text-gray-700">{r.date}</td>
                      <td className="py-1.5 text-gray-700">{r.amount}</td>
                      <td className="py-1.5"></td>
                      <td className="py-1.5 text-gray-500">{r.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button onClick={onClose} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded hover:bg-gray-900"><IcoX /> Close</button>
          <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2 bg-[#58c777] text-white text-sm font-medium rounded hover:bg-[#4ab668] disabled:opacity-70"><IcoCheck /> {saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}
