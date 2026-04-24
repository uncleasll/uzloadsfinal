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
      warnText: noFile ? 'Application incomplete. No files attached' : '',
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
              className="inline-flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors text-xs font-medium">
              <IcoPDF /> PDF
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={() => window.open(API_BASE + '/api/v1/drivers/export/xlsx', '_blank')}
              className="inline-flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors text-xs font-medium">
              <IcoXLS /> Excel
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={() => setShowEmail(true)}
              className="inline-flex items-center gap-1 px-2 py-1 text-gray-600 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors text-xs font-medium">
              <IcoMail /> Email
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><IcoSearch /></span>
            <input type="text" placeholder="Search drivers..." value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-brand-500 w-48 transition-colors" />
          </div>
          <button onClick={() => setShowFilter(v => !v)}
            className={'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ' +
              (showFilter ? 'border-brand-500 text-brand-600 bg-brand-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50')}>
            <IcoFilter /> Filter
          </button>
          <button onClick={() => setEditDriver('new')}
            className="btn-primary rounded-lg shadow-sm">
            <IcoPlus /> New Driver
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilter && (
        <div className="flex items-end gap-4 px-5 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
          <div className="w-44">
            <Label text="Driver Type" />
            <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1) }} className="select-base text-sm rounded-lg">
              <option value="">All Types</option>
              <option value="Drv">Company Driver</option>
              <option value="OO">Owner Operator</option>
            </select>
          </div>
          <div className="w-44">
            <Label text="Status" />
            <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1) }} className="select-base text-sm rounded-lg">
              <option value="">All Statuses</option>
              {DRIVER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={() => { setFilterType(''); setFilterStatus(''); setPage(1) }}
            className="btn-secondary rounded-lg text-sm">Clear filters</button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm" style={{ tableLayout: 'fixed', minWidth: 1080 }}>
          <colgroup>
            <col style={{width:'17%'}} /><col style={{width:'6%'}} /><col style={{width:'8%'}} />
            <col style={{width:'7%'}} /><col style={{width:'7%'}} /><col style={{width:'9%'}} />
            <col style={{width:'11%'}} /><col style={{width:'6%'}} /><col style={{width:'6%'}} />
            <col style={{width:'9%'}} /><col style={{width:'10%'}} /><col style={{width:'4%'}} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="bg-gray-50 border-b border-gray-200">
              {['NAME','TYPE','STATUS','HIRE DATE','TERM DATE','PHONE','EMAIL','TRUCK','TRAILER','PAYABLE TO','WARNINGS',''].map((h,i) => (
                <th key={i} className="table-th">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr><td colSpan={12} className="py-20 text-center">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm">Loading drivers...</span>
                </div>
              </td></tr>
            ) : drivers.length === 0 ? (
              <tr><td colSpan={12} className="py-20 text-center">
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <svg className="w-10 h-10 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0"/></svg>
                  <span className="text-sm font-medium">No drivers found</span>
                  <span className="text-xs">Try adjusting your search or filters</span>
                </div>
              </td></tr>
            ) : drivers.map(d => {
              const warns = getDriverWarnings(d.documents || [])
              const hasExpired = warns.some(w => w.type === 'expired')
              const hasSoon    = warns.some(w => w.type === 'soon')
              const hasMissing = warns.some(w => w.type === 'missing')
              const rowWarn    = hasExpired || hasSoon || hasMissing
              return (
                <tr key={d.id}
                  onClick={() => setEditDriver(d)}
                  className={'cursor-pointer transition-colors ' + (rowWarn ? 'hover:bg-amber-50' : 'hover:bg-gray-50')}>
                  <td className="table-td">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {rowWarn && (
                        <span className={hasExpired ? 'text-red-500' : 'text-amber-500'}>
                          <IcoWarn />
                        </span>
                      )}
                      <span className="font-medium text-blue-600 truncate hover:underline">
                        {d.name}
                        {!d.is_active && <span className="ml-1 text-xs text-gray-400 font-normal">(inactive)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="table-td">
                    <span className={'inline-flex px-1.5 py-0.5 rounded text-xs font-medium ' +
                      (d.driver_type === 'OO' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700')}>
                      {d.driver_type === 'OO' ? 'O/O' : 'Drv'}
                    </span>
                  </td>
                  <td className="table-td">
                    {d.profile?.driver_status === 'Hired' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-100 text-brand-700 border border-brand-200">
                        ● Hired
                      </span>
                    ) : d.profile?.driver_status === 'Terminated' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                        Terminated
                      </span>
                    ) : (
                      <span className="text-xs text-gray-500">{d.profile?.driver_status || '—'}</span>
                    )}
                  </td>
                  <td className="table-td text-xs text-gray-500">{fmtDate(d.profile?.hire_date) || '—'}</td>
                  <td className="table-td text-xs text-gray-500">{fmtDate(d.profile?.termination_date) || '—'}</td>
                  <td className="table-td text-xs text-gray-600 truncate">{d.phone || '—'}</td>
                  <td className="table-td text-xs text-gray-600 truncate">{d.email || '—'}</td>
                  <td className="table-td text-xs font-mono text-gray-600">{d.profile?.truck_unit || '—'}</td>
                  <td className="table-td text-xs font-mono text-gray-600">{d.profile?.trailer_unit || '—'}</td>
                  <td className="table-td text-xs text-gray-600 truncate">{d.profile?.payable_to || d.name}</td>
                  <td className="table-td">
                    {warns.length === 0 ? (
                      <span className="text-brand-500"><IcoOK /></span>
                    ) : (
                      <div className="space-y-0.5">
                        {warns.slice(0,2).map((w,i) => (
                          <div key={i} className={'text-xs flex items-center gap-1 ' + (w.type==='expired'?'text-red-600':w.type==='soon'?'text-amber-600':'text-gray-500')}>
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 inline-block bg-current"></span>
                            {w.label}
                          </div>
                        ))}
                        {warns.length > 2 && <div className="text-xs text-gray-400">+{warns.length-2} more</div>}
                      </div>
                    )}
                  </td>
                  <td className="table-td" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setEditDriver(d)}
                      className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                      title="Edit driver">
                      <IcoEdit />
                    </button>
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
    () => Object.fromEntries(DOC_TYPES.map(d => [d.key, true]))
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
                  <div className="flex gap-1.5">
                    <select value={form.payable_to} onChange={e=>sf('payable_to',e.target.value)} className="select-base text-sm rounded-lg flex-1">
                      <option value={form.first_name + ' ' + form.last_name}>{form.first_name} {form.last_name}</option>
                      {vendors.map(v => <option key={v.id} value={v.company_name}>{v.company_name}</option>)}
                    </select>
                    <button type="button" onClick={() => setShowVendorModal(true)}
                      className="px-2 py-1.5 text-xs text-brand-600 border border-brand-200 rounded-lg hover:bg-brand-50 whitespace-nowrap">
                      + New
                    </button>
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
                            {meta && <span className={'text-xs ' + (docHasExp?'text-red-500':docHasSoon?'text-amber-600':'text-gray-500')}>{meta}</span>}
                            {warnText && <span className="text-xs text-amber-600 italic">{warnText}</span>}
                            {typeDocs.length === 0 && !meta && (
                              <span className="text-xs text-gray-400">No records</span>
                            )}
                            {typeDocs.length > 0 && (
                              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{typeDocs.length}</span>
                            )}
                          </div>
                          <div className={'transition-transform ' + (isOpen ? '' : '-rotate-90')}>
                            <IcoDown />
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
        {showTxModal && driver && (
          <TxModal
            driverId={driver.id} tx={editTx}
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
  return (
    <div className="space-y-4">
      <div>
        <Label text="Pay Type" />
        <div className="flex gap-6 flex-wrap mt-1">
          {PAY_TYPES.map(o => (
            <label key={o.v} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="pay_type" value={o.v} checked={form.pay_type===o.v}
                onChange={() => sf('pay_type', o.v)} className="accent-brand-600 w-4 h-4"/>
              <span className="text-sm text-gray-700">{o.l}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {form.pay_type === 'per_mile' && (
          <>
            <Field label="Loaded rate ($/mile)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                <input type="number" step="0.01" value={form.per_mile} onChange={e=>sf('per_mile',e.target.value)}
                  className="input-base text-sm pl-7 rounded-lg"/>
              </div>
            </Field>
            <Field label="Empty rate ($/mile)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                <input type="number" step="0.01" value={form.empty_mile} onChange={e=>sf('empty_mile',e.target.value)}
                  className="input-base text-sm pl-7 rounded-lg"/>
              </div>
            </Field>
            <Field label="Extra stop ($/stop)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                <input type="number" step="0.01" value={form.extra_stop} onChange={e=>sf('extra_stop',e.target.value)}
                  className="input-base text-sm pl-7 rounded-lg"/>
              </div>
            </Field>
          </>
        )}
        {form.pay_type === 'freight_percentage' && (
          <>
            <Field label="Freight percentage">
              <div className="relative">
                <input type="number" step="0.1" value={form.freight_pct} onChange={e=>sf('freight_pct',e.target.value)}
                  className="input-base text-sm pr-7 rounded-lg"/>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">%</span>
              </div>
            </Field>
            <Field label="Extra stop ($/stop)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                <input type="number" step="0.01" value={form.extra_stop} onChange={e=>sf('extra_stop',e.target.value)}
                  className="input-base text-sm pl-7 rounded-lg"/>
              </div>
            </Field>
          </>
        )}
        {form.pay_type === 'flatpay' && (
          <Field label="Flat pay amount">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" step="0.01" value={form.flatpay} onChange={e=>sf('flatpay',e.target.value)}
                className="input-base text-sm pl-7 rounded-lg"/>
            </div>
          </Field>
        )}
        {form.pay_type === 'hourly' && (
          <Field label="Hourly rate">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input type="number" step="0.01" value={form.hourly} onChange={e=>sf('hourly',e.target.value)}
                className="input-base text-sm pl-7 rounded-lg"/>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">/hr</span>
            </div>
          </Field>
        )}
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
        <IcoWarn />
        <span>Rate changes only affect future loads. Historical loads keep their snapshot values.</span>
      </div>
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
  if (!isEdit) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        Save the driver first to configure scheduled payments.
      </div>
    )
  }
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-sm font-semibold text-gray-700">Scheduled Payments & Deductions</h4>
        <button onClick={onAdd} className="btn-primary text-xs py-1.5 px-3 rounded-lg"><IcoPlus /> Add</button>
      </div>
      {txs.length === 0 ? (
        <div className="py-10 text-center border-2 border-dashed border-gray-200 rounded-xl">
          <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
          <p className="text-sm text-gray-400">No scheduled transactions yet</p>
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 rounded-lg">
              {['Category','Amount','Schedule','Last Applied','Next Due','Status','Notes',''].map((h,i) => (
                <th key={i} className="px-3 py-2 text-left text-gray-500 font-semibold uppercase text-[10px] tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {txs.map(tx => (
              <tr key={tx.id} className="hover:bg-gray-50">
                <td className="px-3 py-2.5">
                  <span className={'inline-flex px-2 py-0.5 rounded-full text-xs font-medium ' +
                    (tx.trans_type==='deduction' ? 'bg-red-50 text-red-700' :
                     tx.trans_type==='loan'      ? 'bg-purple-50 text-purple-700' :
                     'bg-brand-50 text-brand-700')}>
                    {tx.category || tx.trans_type}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-semibold text-gray-800">
                  <span className={tx.trans_type==='deduction'?'text-red-600':'text-brand-600'}>
                    {tx.trans_type==='deduction'?'−':'+'}${tx.amount.toFixed(2)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-500 capitalize">{tx.schedule || '—'}</td>
                <td className="px-3 py-2.5 text-gray-500">{tx.last_applied ? formatDate(tx.last_applied) : '—'}</td>
                <td className="px-3 py-2.5 text-gray-500">{tx.next_due ? formatDate(tx.next_due) : '—'}</td>
                <td className="px-3 py-2.5">
                  <span className={'inline-flex items-center gap-1 text-xs ' + (tx.is_active?'text-brand-600':'text-gray-400')}>
                    <span className={'w-1.5 h-1.5 rounded-full ' + (tx.is_active?'bg-brand-500':'bg-gray-300')}></span>
                    {tx.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-gray-400 truncate max-w-[100px]">{tx.notes || '—'}</td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1">
                    <button onClick={() => onEdit(tx)}
                      className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"><IcoEdit /></button>
                    <button onClick={() => onDelete(tx)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><IcoTrash /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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

// ── VendorModal ───────────────────────────────────────────────────────────────
function VendorModal({ onClose, onSaved }: { onClose: ()=>void; onSaved: (v: Vendor)=>void }) {
  const [name, setName]   = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const save = () => {
    if (!name.trim()) { toast.error('Company name is required'); return }
    setSaving(true)
    vendorsApi.create({ company_name: name, phone, email, vendor_type: 'individual', is_active: true })
      .then(v => onSaved(v))
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-[420px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="font-bold text-gray-900">New Vendor</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><IcoX /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <Field label="Company Name" required>
            <input value={name} onChange={e=>setName(e.target.value)} className="input-base text-sm rounded-lg" placeholder="Company name" autoFocus/>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><input value={phone} onChange={e=>setPhone(e.target.value)} className="input-base text-sm rounded-lg"/></Field>
            <Field label="Email"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="input-base text-sm rounded-lg"/></Field>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="btn-secondary rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary rounded-lg px-5">
            <IcoCheck /> {saving ? 'Creating...' : 'Create Vendor'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── TxModal ───────────────────────────────────────────────────────────────────
function TxModal({ driverId, tx, onClose, onSaved }: {
  driverId: number; tx: ScheduledTransaction|null; onClose: ()=>void; onSaved: ()=>void
}) {
  const isEdit = !!tx
  const [transType,   setTransType]   = useState(tx?.trans_type || 'deduction')
  const [category,    setCategory]    = useState(tx?.category || '')
  const [amount,      setAmount]      = useState(String(tx?.amount || ''))
  const [schedule,    setSchedule]    = useState(tx?.schedule || 'monthly')
  const [startDate,   setStartDate]   = useState(tx?.start_date || new Date().toISOString().slice(0,10))
  const [repeatType,  setRepeatType]  = useState(tx?.repeat_type || 'always')
  const [repeatTimes, setRepeatTimes] = useState(String(tx?.repeat_times || ''))
  const [endDate,     setEndDate]     = useState(tx?.end_date || '')
  const [notes,       setNotes]       = useState(tx?.notes || '')
  const [isActive,    setIsActive]    = useState(tx?.is_active ?? true)
  const [saving,      setSaving]      = useState(false)

  const save = () => {
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    const payload = {
      driver_id: driverId, trans_type: transType,
      category: category || undefined, amount: parseFloat(amount),
      schedule: schedule || undefined, start_date: startDate || undefined,
      end_date: repeatType==='until' ? (endDate||undefined) : undefined,
      repeat_type: repeatType,
      repeat_times: repeatType==='times' ? (parseInt(repeatTimes)||undefined) : undefined,
      notes: notes || undefined, is_active: isActive,
    } as Parameters<typeof scheduledTxApi.create>[1]
    const req = isEdit && tx
      ? scheduledTxApi.update(driverId, tx.id, payload as Parameters<typeof scheduledTxApi.update>[2])
      : scheduledTxApi.create(driverId, payload)
    req
      .then(() => { toast.success(isEdit?'Updated':'Added'); onSaved() })
      .catch(e => toast.error(e.message))
      .finally(() => setSaving(false))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="relative bg-white rounded-2xl shadow-2xl w-[520px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h3 className="font-bold text-gray-900">{isEdit?'Edit':'New'} Scheduled Transaction</h3>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"><IcoX /></button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Transaction Type">
              <select value={transType} onChange={e=>setTransType(e.target.value)} className="select-base text-sm rounded-lg">
                <option value="addition">Addition</option>
                <option value="deduction">Deduction</option>
                <option value="loan">Driver Loan</option>
                <option value="escrow">Escrow</option>
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={e=>setCategory(e.target.value)} className="select-base text-sm rounded-lg">
                <option value="">— Select —</option>
                {TX_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Amount ($)" required>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
              <input type="number" step="0.01" min="0" value={amount} onChange={e=>setAmount(e.target.value)}
                className="input-base text-sm pl-7 rounded-lg"/>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Schedule">
              <select value={schedule} onChange={e=>setSchedule(e.target.value)} className="select-base text-sm rounded-lg">
                <option value="daily">Every day</option>
                <option value="weekly">Every week</option>
                <option value="biweekly">Every 2 weeks</option>
                <option value="monthly">Every month</option>
                <option value="annually">Annually</option>
              </select>
            </Field>
            <Field label="Start Date">
              <input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)} className="input-base text-sm rounded-lg"/>
            </Field>
          </div>
          <Field label="Repeat">
            <div className="flex gap-6 mt-1">
              {[{v:'always',l:'Always'},{v:'times',l:'Fixed times'},{v:'until',l:'Until date'}].map(o => (
                <label key={o.v} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="rpt" value={o.v} checked={repeatType===o.v} onChange={() => setRepeatType(o.v)} className="accent-brand-600"/>
                  <span className="text-sm text-gray-700">{o.l}</span>
                </label>
              ))}
            </div>
          </Field>
          {repeatType === 'times' && (
            <Field label="Number of times">
              <input type="number" min="1" value={repeatTimes} onChange={e=>setRepeatTimes(e.target.value)} className="input-base text-sm w-32 rounded-lg"/>
            </Field>
          )}
          {repeatType === 'until' && (
            <Field label="Until date">
              <input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)} className="input-base text-sm rounded-lg"/>
            </Field>
          )}
          <Field label="Notes">
            <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} className="input-base text-sm resize-none rounded-lg"/>
          </Field>
          <label className="flex items-center gap-3 cursor-pointer">
            <div className={'relative w-10 h-5 rounded-full transition-colors cursor-pointer ' + (isActive ? 'bg-brand-500' : 'bg-gray-300')}
              onClick={() => setIsActive(v => !v)}>
              <div className={'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ' + (isActive ? 'translate-x-5' : '')}></div>
            </div>
            <span className="text-sm text-gray-700">Active</span>
          </label>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 bg-gray-50 sticky bottom-0">
          <button onClick={onClose} className="btn-secondary rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving} className="btn-primary rounded-lg px-5">
            <IcoCheck /> {saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Add Transaction')}
          </button>
        </div>
      </div>
    </div>
  )
}
