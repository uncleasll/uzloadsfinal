import { useState, useRef } from 'react'
import { loadsApi } from '@/api/loads'
import type { LoadCreatePayload, StopType } from '@/types'
import toast from 'react-hot-toast'
import type { useEntities } from '@/hooks/useEntities'

type Entities = ReturnType<typeof useEntities>

interface Props {
  onClose: () => void
  onSaved: () => void
  entities: Entities
}

const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

interface AttachmentFile {
  file: File
  type: string
  notes: string
}

export default function NewLoadModal({ onClose, onSaved, entities }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeAttachType, setActiveAttachType] = useState<string>('')

  const [form, setForm] = useState({
    status: 'New',
    billing_status: 'Pending',
    dispatcher_id: entities.dispatchers[0]?.id?.toString() || '',
    pickup_date: '',
    pickup_city: '',
    pickup_state: '',
    pickup_zip: '',
    delivery_date: '',
    delivery_city: '',
    delivery_state: '',
    delivery_zip: '',
    broker_id: '',
    po_number: '',
    rate: '0.00',
    driver_id: '',
    truck_id: '',
    trailer_id: '',
    notes: '',
  })

  const [attachments, setAttachments] = useState<AttachmentFile[]>([])
  const [attachNotes, setAttachNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleFile = (file: File, type: string) => {
    setAttachments(prev => [...prev, { file, type, notes: attachNotes }])
    toast.success(`${type} attached: ${file.name}`)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file, activeAttachType || 'Other')
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file, activeAttachType || 'Other')
    e.target.value = ''
  }

  const removeAttachment = (idx: number) =>
    setAttachments(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async () => {
    if (!form.rate || isNaN(parseFloat(form.rate))) return toast.error('Rate is required')
    setSubmitting(true)
    try {
      const stops: LoadCreatePayload['stops'] = []
      if (form.pickup_city || form.pickup_state) {
        stops.push({ stop_type: 'pickup' as StopType, stop_order: 1, city: form.pickup_city || undefined, state: form.pickup_state || undefined, zip_code: form.pickup_zip || undefined, country: 'US', stop_date: form.pickup_date || undefined })
      }
      if (form.delivery_city || form.delivery_state) {
        stops.push({ stop_type: 'delivery' as StopType, stop_order: 2, city: form.delivery_city || undefined, state: form.delivery_state || undefined, zip_code: form.delivery_zip || undefined, country: 'US', stop_date: form.delivery_date || undefined })
      }

      const payload: LoadCreatePayload = {
        status: form.status as LoadCreatePayload['status'],
        billing_status: form.billing_status as LoadCreatePayload['billing_status'],
        load_date: today,
        rate: parseFloat(form.rate) || 0,
        po_number: form.po_number || undefined,
        notes: form.notes || undefined,
        driver_id: form.driver_id ? parseInt(form.driver_id) : undefined,
        truck_id: form.truck_id ? parseInt(form.truck_id) : undefined,
        trailer_id: form.trailer_id ? parseInt(form.trailer_id) : undefined,
        broker_id: form.broker_id ? parseInt(form.broker_id) : undefined,
        dispatcher_id: form.dispatcher_id ? parseInt(form.dispatcher_id) : undefined,
        stops,
      }

      const created = await loadsApi.create(payload)

      for (const att of attachments) {
        try {
          await loadsApi.uploadDocument(created.id, att.file, att.type, att.notes || undefined)
        } catch { /* continue */ }
      }

      toast.success('Load created')
      onSaved()
    } catch (e: unknown) {
      toast.error((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white border-b border-gray-200 shadow-md">
      {/* Column headers */}
      <div className="grid grid-cols-[200px_1fr_1fr_1fr_1fr_220px] border-b border-gray-100 bg-gray-50">
        <div className="px-4 py-2 border-r border-gray-200">
          <span className="text-base font-bold text-brand-600">New Load</span>
        </div>
        <ColHeader icon={<PickupIcon />} label="Pickup" color="text-brand-600" />
        <ColHeader icon={<DeliveryIcon />} label="Delivery" color="text-red-500" />
        <ColHeader icon={<BrokerIcon />} label="Broker" color="text-green-600" />
        <ColHeader icon={<DriverIcon />} label="Driver" color="text-blue-500" />
        <div className="px-4 py-2 space-y-0">
          <div className="flex items-center gap-1 text-xs font-semibold text-gray-600">
            <NoteIcon /> Notes
          </div>
        </div>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-[200px_1fr_1fr_1fr_1fr_220px]">
        {/* Status / Billing / Dispatcher */}
        <div className="px-3 py-3 border-r border-gray-200 space-y-2">
          <Field label="STATUS">
            <select value={form.status} onChange={e => set('status', e.target.value)} className="select-base text-xs">
              {['New','Canceled','TONU','Dispatched','En Route','Picked-up','Delivered','Closed'].map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="BILLING STATUS">
            <select value={form.billing_status} onChange={e => set('billing_status', e.target.value)} className="select-base text-xs">
              {['Pending','Canceled','BOL received','Invoiced','Sent to factoring','Funded','Paid'].map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="DISPATCHER">
            <select value={form.dispatcher_id} onChange={e => set('dispatcher_id', e.target.value)} className="select-base text-xs">
              <option value=""></option>
              {entities.dispatchers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        </div>

        {/* Pickup */}
        <div className="px-3 py-3 border-r border-gray-200 space-y-2">
          <Field label="DATE">
            <div className="relative">
              <input type="date" value={form.pickup_date} onChange={e => set('pickup_date', e.target.value)} className="input-base text-xs pr-7" placeholder="Select Date" />
            </div>
          </Field>
          <Field label="CITY">
            <input type="text" value={form.pickup_city} onChange={e => set('pickup_city', e.target.value)} className="input-base text-xs" />
          </Field>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="STATE">
              <select value={form.pickup_state} onChange={e => set('pickup_state', e.target.value)} className="select-base text-xs">
                <option value=""></option>
                {STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="ZIP">
              <input type="text" value={form.pickup_zip} onChange={e => set('pickup_zip', e.target.value)} className="input-base text-xs" />
            </Field>
          </div>
        </div>

        {/* Delivery */}
        <div className="px-3 py-3 border-r border-gray-200 space-y-2">
          <Field label="DATE">
            <input type="date" value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} className="input-base text-xs" placeholder="Select Date" />
          </Field>
          <Field label="CITY">
            <input type="text" value={form.delivery_city} onChange={e => set('delivery_city', e.target.value)} className="input-base text-xs" />
          </Field>
          <div className="grid grid-cols-2 gap-1.5">
            <Field label="STATE">
              <select value={form.delivery_state} onChange={e => set('delivery_state', e.target.value)} className="select-base text-xs">
                <option value=""></option>
                {STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="ZIP">
              <input type="text" value={form.delivery_zip} onChange={e => set('delivery_zip', e.target.value)} className="input-base text-xs" />
            </Field>
          </div>
        </div>

        {/* Broker */}
        <div className="px-3 py-3 border-r border-gray-200 space-y-2">
          <Field label="BROKER">
            <select value={form.broker_id} onChange={e => set('broker_id', e.target.value)} className="select-base text-xs">
              <option value=""></option>
              {entities.brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="PO #">
            <input type="text" value={form.po_number} onChange={e => set('po_number', e.target.value)} className="input-base text-xs" />
          </Field>
          <Field label="RATE">
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
              <input type="number" step="0.01" value={form.rate} onChange={e => set('rate', e.target.value)} className="input-base text-xs pl-5" placeholder="0.00" />
            </div>
          </Field>
        </div>

        {/* Driver */}
        <div className="px-3 py-3 border-r border-gray-200 space-y-2">
          <Field label="DRIVER">
            <select value={form.driver_id} onChange={e => set('driver_id', e.target.value)} className="select-base text-xs">
              <option value=""></option>
              {entities.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="TRUCK">
            <select value={form.truck_id} onChange={e => set('truck_id', e.target.value)} className="select-base text-xs">
              <option value=""></option>
              {entities.trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}
            </select>
          </Field>
          <Field label="TRAILER">
            <select value={form.trailer_id} onChange={e => set('trailer_id', e.target.value)} className="select-base text-xs">
              <option value=""></option>
              {entities.trailers.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}
            </select>
          </Field>
        </div>

        {/* Notes + Attachments */}
        <div className="px-3 py-3 space-y-3">
          <input
            type="text"
            value={form.notes}
            onChange={e => set('notes', e.target.value)}
            className="input-base text-xs w-full"
            placeholder=""
          />

          {/* Attachments */}
          <div>
            <div className="flex items-center gap-1 text-xs font-semibold text-gray-600 mb-1.5">
              <ClipIcon /> Attachments
            </div>

            {/* Type buttons */}
            <div className="flex flex-wrap gap-1 mb-2">
              {['Confirmation', 'BOL', 'Other', 'Lumper'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setActiveAttachType(type)
                    fileInputRef.current?.click()
                  }}
                  className={`px-2 py-0.5 text-[11px] rounded border font-medium transition-colors ${
                    activeAttachType === type
                      ? 'bg-brand-600 text-white border-brand-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-brand-500 hover:text-brand-600'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded px-2 py-4 text-center cursor-pointer transition-colors ${
                dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Click to upload or drag and drop file
              </p>
            </div>

            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} />

            {/* Notes for attachment */}
            <input
              type="text"
              value={attachNotes}
              onChange={e => setAttachNotes(e.target.value)}
              className="input-base text-xs mt-1.5"
              placeholder="Notes"
            />

            {/* Attached list */}
            {attachments.map((att, idx) => (
              <div key={idx} className="flex items-center justify-between mt-1 text-xs bg-green-50 border border-green-200 rounded px-2 py-1">
                <span className="text-green-700 font-medium flex-shrink-0">[{att.type}]</span>
                <span className="text-gray-600 truncate mx-1 max-w-[70px]" title={att.file.name}>{att.file.name}</span>
                <button onClick={() => removeAttachment(idx)} className="text-red-400 hover:text-red-600 flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200">
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 font-medium px-3 py-1.5 rounded hover:bg-gray-200 transition-colors">
          Close
        </button>
        <button onClick={handleSubmit} disabled={submitting} className="btn-primary">
          <CheckIcon /> {submitting ? 'Creating...' : 'Create Load'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{label}</label>
      {children}
    </div>
  )
}

function ColHeader({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className="px-3 py-2 border-r border-gray-200">
      <div className={`flex items-center gap-1 text-xs font-semibold ${color}`}>
        {icon} {label}
      </div>
    </div>
  )
}

function PickupIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
}
function DeliveryIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
}
function BrokerIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1" /></svg>
}
function DriverIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
}
function NoteIcon() {
  return <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
}
function ClipIcon() {
  return <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
}
function CheckIcon() {
  return <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
}
