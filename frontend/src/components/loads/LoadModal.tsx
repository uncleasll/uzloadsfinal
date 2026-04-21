import { useState, useEffect, useRef, useCallback } from 'react'
import { loadsApi, loadsApiExtended } from '@/api/loads'
import type { Load, LoadNote, LoadService } from '@/types'
import { formatCurrency, formatDate, formatDateTime, STATUS_COLORS, BILLING_COLORS } from '@/utils'
import toast from 'react-hot-toast'
import type { useEntities } from '@/hooks/useEntities'

type Entities = ReturnType<typeof useEntities>
type Tab = 'services' | 'documents' | 'billing' | 'history'

interface Props {
  loadId: number
  onClose: () => void
  onSaved: () => void
  entities: Entities
}

// ─── Icon components ───────────────────────────────────────────────────────────
const X = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const Pencil = ({ size = 'sm' }: { size?: 'sm' | 'xs' }) => (
  <svg className={size === 'xs' ? 'w-3 h-3' : 'w-3.5 h-3.5'} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
  </svg>
)
const Check = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
const ArrowRight = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
const MapPin = ({ color }: { color: string }) => <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill={color}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z"/></svg>
const Clock = () => <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2"/></svg>
const MapIcon = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>
const Plus = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
const Refresh = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
const Send = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 9l3 3m0 0l-3 3m3-3H8m13 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
const FileText = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
const Download = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
const Upload = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
const Trash = () => <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
const ChevronDown = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
const Info = () => <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>

// ─── Shared inline-edit primitives ─────────────────────────────────────────────
function InlineText({
  value, onSave, placeholder = '—', width = 'w-28',
}: { value: string; onSave: (v: string) => Promise<void>; placeholder?: string; width?: string }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  const save = async () => {
    setSaving(true)
    try { await onSave(val); setEditing(false) } catch { setVal(value) } finally { setSaving(false) }
  }
  if (editing) return (
    <span className="inline-flex items-center gap-1">
      <input ref={ref} className="border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-green-500 bg-white" style={{ width: 100 }}
        value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setVal(value) } }} />
      <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700 disabled:opacity-40"><Check /></button>
      <button onClick={() => { setEditing(false); setVal(value) }} className="text-gray-400 hover:text-gray-600"><X /></button>
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 group cursor-pointer" onClick={() => setEditing(true)}>
      <span className="text-gray-800">{value || placeholder}</span>
      <span className="text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size="xs" /></span>
    </span>
  )
}

function InlineNumber({
  value, prefix = '', onSave,
}: { value: number; prefix?: string; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value))
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  const save = async () => {
    setSaving(true)
    try { await onSave(parseFloat(val) || 0); setEditing(false) } catch { setVal(String(value)) } finally { setSaving(false) }
  }
  if (editing) return (
    <span className="inline-flex items-center gap-1">
      <input ref={ref} type="number" step="0.01" className="border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-green-500 bg-white w-24"
        value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setVal(String(value)) } }} />
      <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700 disabled:opacity-40"><Check /></button>
      <button onClick={() => { setEditing(false); setVal(String(value)) }} className="text-gray-400 hover:text-gray-600"><X /></button>
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 group cursor-pointer" onClick={() => setEditing(true)}>
      <span className="text-gray-800">{prefix}{value.toFixed(2)}</span>
      <span className="text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size="xs" /></span>
    </span>
  )
}

function InlineSelect({
  value, options, onSave, colors,
}: { value: string; options: string[]; onSave: (v: string) => Promise<void>; colors?: Record<string, string> }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const save = async (v: string) => {
    setSaving(true)
    try { await onSave(v); setEditing(false) } catch {} finally { setSaving(false) }
  }
  if (editing) return (
    <span className="inline-flex items-center gap-1">
      <select autoFocus className="border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-green-500 bg-white"
        defaultValue={value} onChange={e => save(e.target.value)} disabled={saving}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
    </span>
  )
  const cls = colors?.[value] || ''
  return (
    <span className="inline-flex items-center gap-1 group cursor-pointer" onClick={() => setEditing(true)}>
      {cls ? <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${cls}`}>{value}</span>
           : <span className="text-gray-800">{value}</span>}
      <span className="text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size="xs" /></span>
    </span>
  )
}

function InlineDate({ value, onSave }: { value: string; onSave: (v: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  const save = async () => {
    setSaving(true)
    try { await onSave(val); setEditing(false) } catch { setVal(value) } finally { setSaving(false) }
  }
  if (editing) return (
    <span className="inline-flex items-center gap-1">
      <input ref={ref} type="date" className="border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-green-500 bg-white"
        value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setVal(value) } }} />
      <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700 disabled:opacity-40"><Check /></button>
      <button onClick={() => { setEditing(false); setVal(value) }} className="text-gray-400 hover:text-gray-600"><X /></button>
    </span>
  )
  const display = value ? new Date(value + 'T00:00:00').toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' }) : '—'
  return (
    <span className="inline-flex items-center gap-1 group cursor-pointer" onClick={() => setEditing(true)}>
      <span className="text-gray-800">{display}</span>
      <span className="text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size="xs" /></span>
    </span>
  )
}

function InlineEntitySelect({
  value, label, options, onSave,
}: { value: number | null; label: string; options: { id: number; label: string }[]; onSave: (id: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const save = async (v: string) => {
    setSaving(true)
    try { await onSave(v ? parseInt(v) : null); setEditing(false) } catch {} finally { setSaving(false) }
  }
  if (editing) return (
    <span className="inline-flex items-center gap-1">
      <select autoFocus className="border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-green-500 bg-white max-w-[160px]"
        defaultValue={value ?? ''} onChange={e => save(e.target.value)} disabled={saving}>
        <option value="">— none —</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X /></button>
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 group cursor-pointer" onClick={() => setEditing(true)}>
      <span className={label ? 'text-blue-600 font-medium' : 'text-gray-400'}>{label || '[not set]'}</span>
      <span className="text-green-600 opacity-0 group-hover:opacity-100 transition-opacity"><Pencil size="xs" /></span>
    </span>
  )
}

// ─── Row helper ────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-sm leading-5">
      <span className="font-semibold text-gray-700 flex-shrink-0" style={{ minWidth: 130 }}>{label}</span>
      <span className="text-gray-800 min-w-0">{children}</span>
    </div>
  )
}

// ─── Note row ──────────────────────────────────────────────────────────────────
function NoteRow({ note, onDelete }: { note: LoadNote; onDelete: () => void }) {
  return (
    <div className="flex gap-3 px-3 py-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 group text-xs">
      <span className="text-gray-400 whitespace-nowrap w-32 flex-shrink-0">{formatDateTime(note.created_at)}</span>
      <span className="text-gray-600 w-24 flex-shrink-0">{note.author || '—'}</span>
      <span className="text-gray-800 flex-1 leading-relaxed">{note.content}</span>
      <span className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onDelete} className="text-red-400 hover:text-red-600"><Trash /></button>
      </span>
    </div>
  )
}

// ─── Service row ───────────────────────────────────────────────────────────────
function SvcRow({ svc, onDelete }: { svc: LoadService; onDelete: () => void }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 group text-xs">
      <td className="px-3 py-2 font-medium text-gray-800">{svc.service_type} <span className="text-gray-400">({svc.add_deduct})</span></td>
      <td className="px-3 py-2 text-gray-700">{formatCurrency(svc.invoice_amount)}</td>
      <td className="px-3 py-2 text-gray-700">{formatCurrency(svc.drivers_payable)}</td>
      <td className="px-3 py-2 text-gray-500 max-w-[120px] truncate">{svc.notes || '—'}</td>
      <td className="px-3 py-2 text-right">
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"><Trash /></button>
      </td>
    </tr>
  )
}

// ─── Main modal ────────────────────────────────────────────────────────────────
export default function LoadModal({ loadId, onClose, onSaved, entities }: Props) {
  const [load, setLoad] = useState<Load | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('services')

  // New note
  const [addingNote, setAddingNote] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [noteSaving, setNoteSaving] = useState(false)

  // Service forms
  const [showSvcForm, setShowSvcForm] = useState<'lumper' | 'detention' | 'other' | null>(null)
  const [svcForm, setSvcForm] = useState({ add_deduct: 'Add', invoice_amount: '', drivers_payable: '', notes: '', paid_by: 'Company' })
  const [svcSaving, setSvcSaving] = useState(false)

  // Recalculate dropdown
  const [showRecalcMenu, setShowRecalcMenu] = useState(false)
  const recalcRef = useRef<HTMLDivElement>(null)

  // Upload tracking
  const [uploading, setUploading] = useState(false)

  const refetch = useCallback(async () => {
    try { const l = await loadsApi.get(loadId); setLoad(l) } catch (e: any) { toast.error(e.message) }
  }, [loadId])

  useEffect(() => {
    setLoading(true)
    loadsApi.get(loadId).then(setLoad).catch(e => toast.error(e.message)).finally(() => setLoading(false))
  }, [loadId])

  // Close recalc menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (recalcRef.current && !recalcRef.current.contains(e.target as Node)) setShowRecalcMenu(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const quickUpdate = async (field: string, value: unknown) => {
    await loadsApi.update(loadId, { [field]: value } as any)
    await refetch()
    onSaved()
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    setNoteSaving(true)
    try {
      await loadsApi.addNote(loadId, noteText.trim(), 'Dispatcher')
      setNoteText(''); setAddingNote(false)
      await refetch()
      toast.success('Note added')
    } catch (e: any) { toast.error(e.message) } finally { setNoteSaving(false) }
  }

  const handleDeleteNote = async (noteId: number) => {
    if (!confirm('Delete this note?')) return
    try {
      await loadsApiExtended.deleteNote(loadId, noteId)
      await refetch()
      toast.success('Note deleted')
    } catch (e: any) { toast.error(e.message) }
  }

  const handleAddService = async () => {
    if (!showSvcForm) return
    setSvcSaving(true)
    const typeMap = { lumper: 'Lumper', detention: 'Detention', other: 'Other' } as const
    try {
      await loadsApi.addService(loadId, {
        service_type: typeMap[showSvcForm],
        add_deduct: svcForm.add_deduct,
        invoice_amount: parseFloat(svcForm.invoice_amount) || 0,
        drivers_payable: parseFloat(svcForm.drivers_payable) || 0,
        notes: svcForm.notes || undefined,
        paid_by: svcForm.paid_by || undefined,
      })
      setShowSvcForm(null)
      setSvcForm({ add_deduct: 'Add', invoice_amount: '', drivers_payable: '', notes: '', paid_by: 'Company' })
      await refetch(); onSaved()
      toast.success(`${typeMap[showSvcForm]} added`)
    } catch (e: any) { toast.error(e.message) } finally { setSvcSaving(false) }
  }

  const handleDeleteService = async (svcId: number) => {
    if (!confirm('Delete this service charge?')) return
    try {
      await loadsApi.deleteService(loadId, svcId)
      await refetch(); onSaved()
      toast.success('Charge deleted')
    } catch (e: any) { toast.error(e.message) }
  }

  const handleUpload = async (docType: string, file: File) => {
    setUploading(true)
    try {
      await loadsApi.uploadDocument(loadId, file, docType)
      await refetch()
      toast.success(`${docType} uploaded`)
    } catch (e: any) { toast.error(e.message) } finally { setUploading(false) }
  }

  const handleDeleteDoc = async (docId: number) => {
    if (!confirm('Delete this document?')) return
    try {
      await loadsApi.deleteDocument(loadId, docId)
      await refetch()
      toast.success('Document deleted')
    } catch (e: any) { toast.error(e.message) }
  }

  const handleRecalcDriverPay = async () => {
    setShowRecalcMenu(false)
    try {
      const data = await loadsApiExtended.recalculateDriverPay(loadId)
      await refetch(); onSaved()
      toast.success(`Driver pay recalculated: ${formatCurrency(data.drivers_payable)}`)
    } catch (e: any) { toast.error(e.message) }
  }

  if (loading) return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" style={{ maxWidth: 1100 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading load #{loadId}…</div>
      </div>
    </div>
  )
  if (!load) return null

  const stops = [...load.stops].sort((a, b) => a.stop_order - b.stop_order)
  const pickup = stops.find(s => s.stop_type === 'pickup')
  const delivery = stops.find(s => s.stop_type === 'delivery')
  const pickupLabel = pickup ? `${pickup.city}, ${pickup.state}` : 'N/A'
  const deliveryLabel = delivery ? `${delivery.city}, ${delivery.state}` : 'N/A'
  const ratePerMile = (load.total_miles || load.loaded_miles) > 0
    ? load.rate / (load.total_miles || load.loaded_miles) : 0

  // ✅ CORRECT: always use the historical snapshot — never live driver profile fields
  const driversPayable = load.drivers_payable_snapshot
    ?? ((load.loaded_miles * (load.pay_rate_loaded_snapshot ?? 0.65))
      + (load.empty_miles * (load.pay_rate_empty_snapshot ?? 0.30)))

  const payDesc = load.pay_type_snapshot === 'percentage'
    ? `freight percentage: ${formatCurrency(load.rate)} ${load.freight_percentage_snapshot ?? 0}%`
    : load.pay_type_snapshot === 'flatpay'
    ? `flat pay`
    : `rate: $${(load.pay_rate_loaded_snapshot ?? 0.65).toFixed(2)}/$${(load.pay_rate_empty_snapshot ?? 0.30).toFixed(2)} per mile`

  const totalInvoice = load.rate + load.services.reduce((s, svc) =>
    svc.add_deduct === 'Add' ? s + svc.invoice_amount : s - svc.invoice_amount, 0)

  const STATUS_OPTIONS = ['New', 'Canceled', 'TONU', 'Dispatched', 'En Route', 'Picked-up', 'Delivered', 'Closed']
  const BILLING_OPTIONS = ['Pending', 'Canceled', 'BOL received', 'Invoiced', 'Sent to factoring', 'Funded', 'Paid']

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-container w-full overflow-hidden flex flex-col"
        style={{ maxWidth: 1100, maxHeight: 'calc(100vh - 32px)', marginTop: 16, marginBottom: 16 }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
          <h2 className="font-semibold text-gray-900 text-sm">Edit Load</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"><X /></button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 py-4 min-h-0">

          {/* ── Stop header ── */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {/* Driver position */}
            <div className="flex flex-col items-start flex-shrink-0">
              <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                <span>Driver position</span><Info />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-gray-400"><ArrowRight /></span>
                <span className="text-xs text-gray-400">0mi</span>
              </div>
              <button className="text-xs text-red-500 font-medium flex items-center gap-0.5 mt-0.5">
                <MapPin color="#ef4444" />Add
              </button>
            </div>

            {/* Stop cards */}
            {stops.map((stop, idx) => (
              <div key={stop.id} className="flex items-center gap-1.5">
                {idx > 0 && (
                  <div className="flex items-center gap-1 text-gray-400 flex-shrink-0">
                    <ArrowRight />
                    <span className="text-xs">{load.loaded_miles}mi</span>
                  </div>
                )}
                <div className="border-2 border-gray-200 rounded-lg px-3 py-1.5 text-center bg-white hover:border-gray-300 transition-colors cursor-default" style={{ minWidth: 130 }}>
                  <div className="text-xs text-gray-400 font-medium mb-0.5">#{stop.stop_order} {stop.stop_type}</div>
                  <div className="flex items-center justify-center gap-1">
                    <MapPin color={stop.stop_type === 'pickup' ? '#16a34a' : '#2563eb'} />
                    <span className="text-sm font-bold text-gray-900 uppercase truncate max-w-[120px]">
                      {stop.city}, {stop.state}
                    </span>
                  </div>
                  {(stop.stop_time || stop.stop_date) && (
                    <div className="flex items-center justify-center gap-1 mt-0.5">
                      <Clock />
                      <span className="text-xs text-gray-500">
                        {stop.stop_time && `${stop.stop_time} `}{formatDate(stop.stop_date)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Route actions ── */}
          <div className="flex items-center gap-4 mb-4 text-xs">
            <button className="flex items-center gap-1 text-green-700 hover:text-green-800 font-medium"><MapIcon /> Map</button>
            <button className="flex items-center gap-1 text-green-700 hover:text-green-800 font-medium"><Plus /> Add stop</button>
            <button className="flex items-center gap-1 text-green-700 hover:text-green-800 font-medium"><Refresh /> Recalculate distance</button>
            <button className="flex items-center gap-1 text-green-700 hover:text-green-800 font-medium"><Send /> Dispatch info to the driver</button>
          </div>

          {/* ── 4-col info grid ── */}
          <div className="grid gap-5 mb-4" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>

            {/* Load info */}
            <div>
              <h3 className="font-bold text-gray-900 text-sm mb-2.5 flex items-center gap-1">
                Load #{load.load_number}
                <span className="text-green-600 cursor-pointer"><Pencil size="xs" /></span>
              </h3>
              <div className="space-y-1.5">
                <Field label="Status:">
                  <InlineSelect value={load.status} options={STATUS_OPTIONS}
                    colors={Object.fromEntries(Object.entries(STATUS_COLORS).map(([k, v]) => [k, v]))}
                    onSave={v => quickUpdate('status', v)} />
                </Field>
                <Field label="Billing status:">
                  <InlineSelect value={load.billing_status} options={BILLING_OPTIONS}
                    onSave={v => quickUpdate('billing_status', v)} />
                </Field>
                <Field label="Actual Delivery Date:">
                  <InlineDate value={load.actual_delivery_date || ''}
                    onSave={v => quickUpdate('actual_delivery_date', v || null)} />
                </Field>
                <Field label="Dispatcher:">
                  <InlineEntitySelect
                    value={load.dispatcher?.id ?? null}
                    label={load.dispatcher?.name || ''}
                    options={entities.dispatchers.map(d => ({ id: d.id, label: d.name }))}
                    onSave={id => quickUpdate('dispatcher_id', id)} />
                </Field>
              </div>
            </div>

            {/* Trip info */}
            <div>
              <h3 className="font-bold text-gray-900 text-sm mb-2.5">Trip info</h3>
              <div className="space-y-1.5">
                <Field label="Total trip:">
                  <InlineNumber value={load.total_miles || 0} onSave={v => quickUpdate('total_miles', Math.round(v))} />
                  <span className="text-gray-500 ml-0.5">mi</span>
                </Field>
                <Field label="Loaded:">
                  <span className="text-gray-700">{load.loaded_miles} mi</span>
                </Field>
                <Field label="Empty:">
                  <span className="text-gray-700">{load.empty_miles} mi</span>
                </Field>
                <Field label="Rate per mile:">
                  <span className="text-gray-700">${ratePerMile.toFixed(2)}</span>
                </Field>
              </div>
            </div>

            {/* Broker */}
            <div>
              <h3 className="font-bold text-gray-900 text-sm mb-2.5">Broker</h3>
              <div className="space-y-1.5">
                <Field label="Name:">
                  <InlineEntitySelect
                    value={load.broker?.id ?? null}
                    label={load.broker?.name || ''}
                    options={entities.brokers.map(b => ({ id: b.id, label: b.name }))}
                    onSave={id => quickUpdate('broker_id', id)} />
                </Field>
                <Field label="PO:">
                  <InlineText value={load.po_number || ''} onSave={v => quickUpdate('po_number', v)} />
                </Field>
                <Field label="Rate:">
                  <InlineNumber value={load.rate} prefix="$" onSave={v => quickUpdate('rate', v)} />
                </Field>
              </div>
            </div>

            {/* Driver */}
            <div>
              <h3 className="font-bold text-gray-900 text-sm mb-2.5">Driver</h3>
              <div className="space-y-1.5">
                <Field label="Driver:">
                  <InlineEntitySelect
                    value={load.driver?.id ?? null}
                    label={load.driver ? `${load.driver.name} [${load.driver.driver_type}]` : ''}
                    options={entities.drivers.map(d => ({ id: d.id, label: `${d.name} [${d.driver_type}]` }))}
                    onSave={id => quickUpdate('driver_id', id)} />
                </Field>
                <Field label="Truck/Trailer:">
                  <span className="text-gray-700">
                    {load.truck?.unit_number || '—'} / {load.trailer?.unit_number || '—'}
                  </span>
                </Field>
                <Field label="Drivers Payable:">
                  <span className="font-semibold text-gray-900">{formatCurrency(driversPayable)}</span>
                </Field>
              </div>
            </div>
          </div>

          {/* ── Notes section ── */}
          <div className="border border-gray-200 rounded mb-4">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
              <div className="grid text-xs font-semibold text-gray-400 uppercase tracking-wide" style={{ gridTemplateColumns: '130px 100px 1fr' }}>
                <span>Created On</span>
                <span>Created By</span>
                <span>Notes</span>
              </div>
              <button onClick={() => setAddingNote(true)}
                className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors flex-shrink-0">
                <FileText /> New note
              </button>
            </div>

            {addingNote && (
              <div className="px-3 py-2.5 border-b border-gray-100 bg-green-50/40">
                <textarea autoFocus value={noteText} onChange={e => setNoteText(e.target.value)}
                  className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:border-green-500"
                  rows={3} placeholder="Enter note…"
                  onKeyDown={e => { if (e.key === 'Escape') { setAddingNote(false); setNoteText('') } }} />
                <div className="flex gap-2 mt-1.5">
                  <button onClick={handleAddNote} disabled={noteSaving}
                    className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium disabled:opacity-50">
                    {noteSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => { setAddingNote(false); setNoteText('') }}
                    className="px-2.5 py-1 bg-white text-gray-600 text-xs rounded border border-gray-200 hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}

            {load.notes_list.length === 0 && !addingNote
              ? <div className="py-5 text-center text-xs text-gray-400">No notes</div>
              : load.notes_list.map(n => (
                  <NoteRow key={n.id} note={n} onDelete={() => handleDeleteNote(n.id)} />
                ))}
          </div>

          {/* ── Tabs ── */}
          <div className="border border-gray-200 rounded">
            <div className="flex border-b border-gray-200 bg-gray-50/50">
              {(['services', 'documents', 'billing', 'history'] as Tab[]).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 text-xs font-medium border-b-2 transition-colors flex-1 text-center capitalize ${
                    activeTab === tab
                      ? 'border-green-600 text-green-700 bg-white'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="p-4">

              {/* ════ Services Tab ════ */}
              {activeTab === 'services' && (
                <div>
                  <div className="flex justify-end gap-2 mb-3 flex-wrap">
                    <button onClick={() => { setShowSvcForm('lumper'); setSvcForm({ add_deduct: 'Add', invoice_amount: '', drivers_payable: '', notes: '', paid_by: 'Company' }) }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium">
                      <FileText /> New lumper
                    </button>
                    <button onClick={() => { setShowSvcForm('detention'); setSvcForm({ add_deduct: 'Add', invoice_amount: '', drivers_payable: '', notes: '', paid_by: 'Company' }) }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium">
                      <FileText /> New detention
                    </button>
                    <button onClick={() => { setShowSvcForm('other'); setSvcForm({ add_deduct: 'Add', invoice_amount: '', drivers_payable: '', notes: '', paid_by: 'Company' }) }}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium">
                      <FileText /> Other additions/deductions
                    </button>
                  </div>

                  {showSvcForm && (
                    <div className="mb-4 p-3 border border-gray-200 rounded-lg bg-gray-50">
                      <h4 className="text-xs font-semibold text-gray-700 mb-3 capitalize">
                        {showSvcForm === 'other' ? 'New Charge / Addition / Deduction' : `New ${showSvcForm.charAt(0).toUpperCase() + showSvcForm.slice(1)}`}
                      </h4>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Add / Deduct</label>
                          <select value={svcForm.add_deduct} onChange={e => setSvcForm(f => ({ ...f, add_deduct: e.target.value }))}
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-green-500">
                            <option>Add</option><option>Deduct</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Paid By</label>
                          <select value={svcForm.paid_by} onChange={e => setSvcForm(f => ({ ...f, paid_by: e.target.value }))}
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:border-green-500">
                            <option>Company</option><option>Broker</option><option>Driver</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Invoice Amount</label>
                          <input type="number" step="0.01" min="0" value={svcForm.invoice_amount}
                            onChange={e => setSvcForm(f => ({ ...f, invoice_amount: e.target.value }))}
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500" placeholder="0.00" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Drivers Payable</label>
                          <input type="number" step="0.01" min="0" value={svcForm.drivers_payable}
                            onChange={e => setSvcForm(f => ({ ...f, drivers_payable: e.target.value }))}
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500" placeholder="0.00" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
                          <input type="text" value={svcForm.notes}
                            onChange={e => setSvcForm(f => ({ ...f, notes: e.target.value }))}
                            className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500" />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleAddService} disabled={svcSaving}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium disabled:opacity-50">
                          {svcSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setShowSvcForm(null)}
                          className="px-3 py-1.5 bg-white text-gray-600 text-xs rounded border border-gray-200 hover:bg-gray-50">Cancel</button>
                      </div>
                    </div>
                  )}

                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase">Add/Ded</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase">Invoice Amount</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase">Drivers Payable</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase">Notes</th>
                        <th className="px-3 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {load.services.length === 0
                        ? <tr><td colSpan={5} className="py-8 text-center text-xs text-gray-400">No records</td></tr>
                        : load.services.map(svc => (
                            <SvcRow key={svc.id} svc={svc} onDelete={() => handleDeleteService(svc.id)} />
                          ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ════ Documents Tab ════ */}
              {activeTab === 'documents' && (
                <div>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-300 text-gray-600 text-xs rounded font-medium hover:bg-gray-50">
                      Merge documents
                    </button>
                    <div className="flex gap-2 flex-wrap">
                      <UploadBtn label="Upload confirmation" docType="Confirmation" onUpload={handleUpload} uploading={uploading} />
                      <UploadBtn label="Upload BOL" docType="BOL" onUpload={handleUpload} uploading={uploading} />
                      <UploadBtn label="Other Document" docType="Other" onUpload={handleUpload} uploading={uploading} dropdown />
                    </div>
                  </div>

                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase">Date</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase">Notes</th>
                        <th className="px-3 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {load.documents.length === 0
                        ? <tr><td colSpan={4} className="py-8 text-center text-xs text-gray-400">No records</td></tr>
                        : load.documents.map(doc => (
                          <tr key={doc.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                            <td className="px-3 py-2 text-xs text-gray-500">{formatDateTime(doc.uploaded_at)}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-800">
                                {doc.document_type}
                                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500">{doc.original_filename || doc.filename}</td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <a href={`/api/v1/loads/${loadId}/documents/${doc.id}/download`} target="_blank" rel="noreferrer"
                                  className="text-green-600 hover:text-green-700"><Download /></a>
                                <button onClick={() => handleDeleteDoc(doc.id)} className="text-red-400 hover:text-red-600"><Trash /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ════ Billing Tab ════ */}
              {activeTab === 'billing' && (
                <div className="space-y-5">

                  {/* Invoice section */}
                  <div>
                    <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm">Invoice: {load.load_number}</h4>
                        <p className="text-xs text-gray-500">
                          To: {load.broker?.name || '—'}
                          {load.broker?.factoring && load.broker.factoring_company ? ` / ${load.broker.factoring_company}` : ''}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <a href={loadsApi.getInvoicePdfUrl(loadId)} target="_blank" rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Download /> Download as PDF</a>
                          <button className="text-xs text-blue-600 hover:underline">Email</button>
                          <button className="text-xs text-gray-400 hover:text-gray-600">Export to QB</button>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium">
                          <Plus /> Create invoice
                        </button>
                        <div className="relative" ref={recalcRef}>
                          <button onClick={() => setShowRecalcMenu(v => !v)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium">
                            Recalculate <ChevronDown />
                          </button>
                          {showRecalcMenu && (
                            <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 py-1 w-44">
                              <button onClick={handleRecalcDriverPay}
                                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                                Driver pay
                              </button>
                              <button onClick={() => { setShowRecalcMenu(false); toast('QP / Factoring fee — coming soon', { icon: 'ℹ️' }) }}
                                className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                                QP / Factoring fee
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <table className="w-full border border-gray-200 rounded overflow-hidden text-xs">
                      <thead className="bg-green-700 text-white">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold w-24">Date</th>
                          <th className="px-3 py-2 text-left font-semibold">Description</th>
                          <th className="px-3 py-2 text-right font-semibold w-24">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {load.services.length === 0 && (
                          <tr><td colSpan={3} className="py-6 text-center text-xs text-gray-400">No records</td></tr>
                        )}
                        {load.services.map(svc => (
                          <tr key={svc.id} className="bg-gray-50">
                            <td className="px-3 py-2 text-gray-500">{formatDate(load.load_date)}</td>
                            <td className="px-3 py-2 text-gray-700">{svc.service_type} ({svc.add_deduct})</td>
                            <td className="px-3 py-2 text-right">{svc.add_deduct === 'Deduct' ? '-' : ''}{formatCurrency(svc.invoice_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Drivers Payable */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-1">
                        Drivers Payable <span className="text-green-600 cursor-pointer"><Pencil size="xs" /></span>
                      </h4>
                      <button className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium">
                        <Plus /> Additions/Deductions
                      </button>
                    </div>
                    <table className="w-full border border-gray-200 rounded overflow-hidden text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-500 uppercase w-24">Date</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-500 uppercase">Description</th>
                          <th className="px-3 py-1.5 text-right font-semibold text-gray-500 uppercase w-24">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {load.driver ? (
                          <tr className="bg-white">
                            <td className="px-3 py-2 text-gray-500">{formatDate(load.actual_delivery_date || load.load_date)}</td>
                            <td className="px-3 py-2 text-gray-700 text-xs leading-relaxed">
                              {load.driver.name} [{load.driver.driver_type}]{' '}
                              Miles: {pickupLabel} — {deliveryLabel}{' '}
                              {payDesc}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">{formatCurrency(driversPayable)}</td>
                          </tr>
                        ) : (
                          <tr><td colSpan={3} className="py-4 text-center text-xs text-gray-400">No driver assigned</td></tr>
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-amber-50 border-t border-gray-200 font-bold">
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-right text-xs text-gray-600">TOTAL:</td>
                          <td className="px-3 py-2 text-right text-gray-900">{formatCurrency(driversPayable)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Other Payable */}
                  <div>
                    <h4 className="font-semibold text-gray-900 text-sm flex items-center gap-1 mb-2">
                      Other Payable <span className="text-green-600 cursor-pointer"><Pencil size="xs" /></span>
                    </h4>
                    <table className="w-full border border-gray-200 rounded overflow-hidden text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-500 uppercase w-24">Date</th>
                          <th className="px-3 py-1.5 text-left font-semibold text-gray-500 uppercase">Description</th>
                          <th className="px-3 py-1.5 text-right font-semibold text-gray-500 uppercase w-24">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr><td colSpan={3} className="py-6 text-center text-xs text-gray-400">No records</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ════ History Tab ════ */}
              {activeTab === 'history' && (
                <div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap w-36">Date</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase">Description</th>
                        <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase w-28">Author</th>
                      </tr>
                    </thead>
                    <tbody>
                      {load.history.length === 0
                        ? <tr><td colSpan={3} className="py-8 text-center text-xs text-gray-400">No history</td></tr>
                        : load.history.map(h => (
                          <tr key={h.id} className="border-b border-gray-100 align-top hover:bg-gray-50">
                            <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDateTime(h.created_at)}</td>
                            <td className="px-3 py-2.5 text-xs text-gray-700 whitespace-pre-line leading-relaxed">{h.description}</td>
                            <td className="px-3 py-2.5 text-xs text-gray-500">{h.author || '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex justify-end px-5 py-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
          <button onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-xs font-medium rounded transition-colors">
            <X /> Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Upload button helper ──────────────────────────────────────────────────────
function UploadBtn({
  label, docType, onUpload, uploading, dropdown = false,
}: { label: string; docType: string; onUpload: (t: string, f: File) => void; uploading: boolean; dropdown?: boolean }) {
  const [open, setOpen] = useState(false)
  const OTHER_TYPES = ['POD', 'Invoice attachment', 'Other']

  if (dropdown) {
    return (
      <div className="relative">
        <button onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium disabled:opacity-50"
          disabled={uploading}>
          <Upload /> {label} <ChevronDown />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 py-1 w-44">
            {OTHER_TYPES.map(t => (
              <label key={t} className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 cursor-pointer">
                {t}
                <input type="file" className="hidden" onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) { onUpload(t, f); e.target.value = ''; setOpen(false) }
                }} />
              </label>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <label className="flex items-center gap-1.5 px-2.5 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded font-medium cursor-pointer disabled:opacity-50">
      <Upload /> {label}
      <input type="file" className="hidden" disabled={uploading} onChange={e => {
        const f = e.target.files?.[0]
        if (f) { onUpload(docType, f); e.target.value = '' }
      }} />
    </label>
  )
}


