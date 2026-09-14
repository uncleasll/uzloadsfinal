import { useMemo, useRef, useState } from 'react'
import { Check, FileText, Upload, X } from 'lucide-react'
import toast from 'react-hot-toast'
import client from '@/api/client'
import { loadsApi } from '@/api/loads'
import type { LoadCreatePayload, StopType } from '@/types'
import type { useEntities } from '@/hooks/useEntities'

type Entities = ReturnType<typeof useEntities>

interface Props {
  onClose: () => void
  onSaved: () => void
  entities: Entities
}

interface ExtractedStop {
  stop_type: StopType
  stop_order: number
  company_name?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  stop_date?: string
  stop_time?: string
  notes?: string
}

interface ExtractedLoad {
  load_number?: string
  broker_name?: string
  driver_name?: string
  po_number?: string
  rate?: number
  load_date?: string
  actual_delivery_date?: string
  notes?: string
  raw_text?: string
  stops: ExtractedStop[]
}

const emptyLoad = (): ExtractedLoad => ({
  rate: 0,
  load_date: new Date().toISOString().slice(0, 10),
  stops: [
    { stop_type: 'pickup', stop_order: 1 },
    { stop_type: 'delivery', stop_order: 2 },
  ],
})

export default function AutoCreateLoadModal({ onClose, onSaved, entities }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [extracting, setExtracting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [data, setData] = useState<ExtractedLoad | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)

  const previewUrl = useMemo(() => files[previewIndex] ? URL.createObjectURL(files[previewIndex]) : '', [files, previewIndex])
  const activePreview = files[previewIndex]

  const addFiles = (incoming: FileList | File[]) => {
    const next = [...files, ...Array.from(incoming)]
      .filter(file => /pdf|png|jpe?g/i.test(file.type) || /\.(pdf|png|jpe?g)$/i.test(file.name))
      .slice(0, 10)
    setFiles(next)
  }

  const extract = async () => {
    if (!files.length) return toast.error('Select at least one document')
    const form = new FormData()
    files.forEach(file => form.append('files', file))
    setExtracting(true)
    try {
      const res = await client.post('/api/v1/loads-import/extract-documents', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      setData({ ...emptyLoad(), ...res.data.load })
      toast.success('Document extracted. Review before approving.')
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e.message || 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  const setField = (key: keyof ExtractedLoad, value: string | number) => setData(prev => ({ ...(prev || emptyLoad()), [key]: value }))
  const setStop = (idx: number, key: keyof ExtractedStop, value: string) => {
    setData(prev => {
      const next = { ...(prev || emptyLoad()) }
      next.stops = [...next.stops]
      next.stops[idx] = { ...next.stops[idx], [key]: value }
      return next
    })
  }

  const approve = async () => {
    if (!data) return
    setSaving(true)
    try {
      const broker = entities.brokers.find(b => b.name.toLowerCase() === (data.broker_name || '').toLowerCase())
      const driver = entities.drivers.find(d => d.name.toLowerCase() === (data.driver_name || '').toLowerCase())
      const payload: LoadCreatePayload = {
        status: 'New',
        billing_status: 'Pending',
        load_date: data.load_date || new Date().toISOString().slice(0, 10),
        actual_delivery_date: data.actual_delivery_date || undefined,
        rate: Number(data.rate || 0),
        po_number: data.po_number || undefined,
        notes: data.notes || undefined,
        broker_id: broker?.id,
        driver_id: driver?.id,
        stops: data.stops.map((stop, idx) => ({
          stop_type: stop.stop_type,
          stop_order: idx + 1,
          company_name: stop.company_name || undefined,
          address: stop.address || undefined,
          city: stop.city || undefined,
          state: stop.state || undefined,
          zip_code: stop.zip_code || undefined,
          country: 'US',
          stop_date: stop.stop_date || undefined,
          stop_time: stop.stop_time || undefined,
        })),
      }
      const created = await loadsApi.create(payload)
      for (const file of files) {
        await loadsApi.uploadDocument(created.id, file, 'Confirmation').catch(() => undefined)
      }
      toast.success(`Load #${created.load_number} created`)
      onSaved()
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || e.message || 'Could not create load')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">{data ? 'Review Load Details' : 'Create New Loads'}</h2>
            <p className="text-[0.6875rem] font-medium text-slate-400">Upload PDF, JPG, JPEG or PNG. Review extracted fields before approving.</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>

        {!data ? (
          <div className="flex flex-1 flex-col items-center justify-center p-6">
            <div
              onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
              onDragOver={e => e.preventDefault()}
              className="grid w-full max-w-2xl place-items-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-8 py-14 text-center"
            >
              <Upload className="h-9 w-9 text-slate-400" />
              <button onClick={() => inputRef.current?.click()} className="mt-4 text-sm font-bold text-blue-600">Click to select</button>
              <p className="mt-1 text-xs font-medium text-slate-500">or drag and drop up to 10 files</p>
              <p className="mt-1 text-[0.6875rem] font-medium text-slate-400">Supported: PDF, JPG, JPEG, PNG</p>
              <input ref={inputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => e.target.files && addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <div className="mt-4 w-full max-w-2xl divide-y divide-slate-100 rounded-lg border border-slate-200">
                {files.map((file, idx) => (
                  <div key={`${file.name}-${idx}`} className="flex items-center gap-3 px-3 py-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{file.name}</span>
                    <button onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))} className="text-red-500"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
            <div className="min-h-0 overflow-auto bg-slate-100 p-4">
              <div className="mb-2 flex items-center gap-2">
                {files.map((file, idx) => (
                  <button key={file.name + idx} onClick={() => setPreviewIndex(idx)} className={`rounded-md px-2 py-1 text-[0.6875rem] font-bold ${previewIndex === idx ? 'bg-blue-600 text-white' : 'bg-white text-slate-500'}`}>{idx + 1}</button>
                ))}
              </div>
              {activePreview?.type.includes('pdf') || activePreview?.name.toLowerCase().endsWith('.pdf')
                ? <iframe src={previewUrl} className="h-[calc(92vh-150px)] w-full rounded-lg bg-white" />
                : <img src={previewUrl} alt="Uploaded document" className="mx-auto max-h-[calc(92vh-150px)] rounded-lg bg-white object-contain" />}
            </div>
            <div className="min-h-0 overflow-auto p-4">
              <Section title="Load Details">
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Broker" value={data.broker_name || ''} onChange={v => setField('broker_name', v)} />
                  <Input label="PO #" value={data.po_number || ''} onChange={v => setField('po_number', v)} />
                  <Input label="Driver" value={data.driver_name || ''} onChange={v => setField('driver_name', v)} />
                  <Input label="Rate" value={String(data.rate || '')} onChange={v => setField('rate', v)} />
                  <Input label="Load date" type="date" value={data.load_date || ''} onChange={v => setField('load_date', v)} />
                  <Input label="Delivery date" type="date" value={data.actual_delivery_date || ''} onChange={v => setField('actual_delivery_date', v)} />
                </div>
                <label className="mt-3 block">
                  <span className="mb-1 block text-[0.6875rem] font-bold text-slate-500">Notes</span>
                  <textarea value={data.notes || ''} onChange={e => setField('notes', e.target.value)} className="h-20 w-full rounded-md border border-slate-200 px-3 py-2 text-xs focus:border-blue-400 focus:outline-none" />
                </label>
              </Section>

              <Section title="Stops">
                <div className="space-y-3">
                  {data.stops.map((stop, idx) => (
                    <div key={idx} className="rounded-lg border border-slate-200 p-3">
                      <div className="mb-3 text-xs font-bold text-slate-800">Stop information #{idx + 1}</div>
                      <div className="grid grid-cols-2 gap-3">
                        <Input label="Type" value={stop.stop_type} onChange={v => setStop(idx, 'stop_type', v as StopType)} />
                        <Input label="Date" type="date" value={stop.stop_date || ''} onChange={v => setStop(idx, 'stop_date', v)} />
                        <Input label="Start time" value={stop.stop_time || ''} onChange={v => setStop(idx, 'stop_time', v)} />
                        <Input label="Company" value={stop.company_name || ''} onChange={v => setStop(idx, 'company_name', v)} />
                        <Input label="Street" value={stop.address || ''} onChange={v => setStop(idx, 'address', v)} />
                        <Input label="City" value={stop.city || ''} onChange={v => setStop(idx, 'city', v)} />
                        <Input label="State" value={stop.state || ''} onChange={v => setStop(idx, 'state', v)} />
                        <Input label="Zip" value={stop.zip_code || ''} onChange={v => setStop(idx, 'zip_code', v)} />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
          <button onClick={onClose} className="btn-secondary h-9 rounded-lg text-xs"><X className="h-4 w-4" />Close</button>
          {!data ? (
            <button onClick={extract} disabled={!files.length || extracting} className="btn-primary h-9 rounded-lg text-xs">{extracting ? 'Processing...' : 'Upload & Process'}</button>
          ) : (
            <button onClick={approve} disabled={saving} className="btn-primary h-9 rounded-lg bg-emerald-600 text-xs hover:bg-emerald-700"><Check className="h-4 w-4" />{saving ? 'Creating...' : 'Approve'}</button>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-5"><h3 className="mb-3 border-b border-slate-200 pb-2 text-base font-bold text-slate-900">{title}</h3>{children}</section>
}

function Input({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.6875rem] font-bold text-slate-500">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 px-3 text-xs text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
    </label>
  )
}
