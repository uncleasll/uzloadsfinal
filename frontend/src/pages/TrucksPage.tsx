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
const IcoOk    = () => <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
const IcoX     = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
const IcoCheck = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
const IcoDn    = () => <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
const IcoSort  = () => <span className="ml-0.5 opacity-30 text-[10px]">⇅</span>

function emptyForm(): Partial<Truck> {
  return { unit_number:'', vin:'', eld_provider:'', eld_id:'', year: undefined, make:'', model:'', ownership:'Owned', is_active:true, driver_id:undefined, plate:'', plate_state:'', purchase_date:'', purchase_price:undefined, notes:'' }
}

export default function TrucksPage() {
  const [trucks, setTrucks]     = useState<Truck[]>([])
  const [drivers, setDrivers]   = useState<Driver[]>([])
  const [loading, setLoading]   = useState(true)
  const [editTruck, setEditTruck] = useState<Truck|null>(null)
  const [showNew, setShowNew]   = useState(false)

  const load = () => {
    setLoading(true)
    trucksApi.list().then(setTrucks).catch(e=>toast.error(e.message)).finally(()=>setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => { driversApi.list().then(setDrivers).catch(()=>{}) }, [])

  const handleRowClick = (t: Truck) => {
    trucksApi.get(t.id).then(full => { setEditTruck(full); setShowNew(false) }).catch(e=>toast.error(e.message))
  }

  const hasDocWarning = (t: Truck) => {
    const docs = t.documents || []
    const ai = docs.find(d=>d.doc_type==='annual_inspection')
    const reg = docs.find(d=>d.doc_type==='registration')
    return !ai?.exp_date || !reg?.exp_date
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-200 flex-shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Trucks</h1>
        <a href="#" className="text-xs text-green-600 hover:underline">Pdf</a>
        <span className="text-gray-300 text-xs">|</span>
        <a href="#" className="text-xs text-green-600 hover:underline">Excel</a>
        <div className="flex-1"/>
        <button onClick={()=>{setShowNew(true);setEditTruck(null)}}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors">
          + New Truck
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b border-gray-200 z-10">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                UNIT <IcoSort/>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td className="py-16 text-center text-gray-400">Loading...</td></tr>
            ) : trucks.length===0 ? (
              <tr><td className="py-16 text-center text-gray-400">No trucks found</td></tr>
            ) : trucks.map(t=>(
              <tr key={t.id} onClick={()=>handleRowClick(t)}
                className="cursor-pointer hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 flex items-center gap-2">
                  {hasDocWarning(t) ? <IcoWarn/> : <IcoOk/>}
                  <button className="text-green-600 hover:underline font-medium">{t.unit_number}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" placeholder="TRK001"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Vin <span className="text-red-500">*</span></label>
              <input value={form.vin||''} onChange={e=>sf('vin',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" placeholder="1HGCM82633A123456"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">ELD Provider</label>
              <div className="relative">
                <select value={form.eld_provider||''} onChange={e=>sf('eld_provider',e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none">
                  {ELD_PROVIDERS.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
                <IcoDn/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">ELD ID</label>
              <input value={form.eld_id||''} onChange={e=>sf('eld_id',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500"/>
            </div>
          </div>

          {/* Row 2: Year, Make, Model | Ownership, Active toggle */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Year <span className="text-red-500">*</span></label>
              <input type="number" value={form.year||''} onChange={e=>sf('year',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" placeholder="2020"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Make <span className="text-red-500">*</span></label>
              <input value={form.make||''} onChange={e=>sf('make',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" placeholder="Volvo"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Model</label>
              <input value={form.model||''} onChange={e=>sf('model',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" placeholder="VNL 760"/>
            </div>
            <div className="flex flex-col gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Ownership</label>
                <div className="relative">
                  <select value={form.ownership||'Owned'} onChange={e=>sf('ownership',e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none">
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
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none">
                  <option value=""></option>
                  {drivers.map(d=><option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}
                </select>
                <IcoDn/>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Plate</label>
              <input value={form.plate||''} onChange={e=>sf('plate',e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:border-green-500" placeholder="TX93827"/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Plate state</label>
              <div className="relative">
                <select value={form.plate_state||''} onChange={e=>sf('plate_state',e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-white focus:outline-none focus:border-green-500 appearance-none">
                  <option value=""></option>
                  {US_STATES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
                <IcoDn/>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Date</label>
                <div className="flex items-center gap-1 border border-gray-300 rounded px-2 py-2 focus-within:border-green-500">
                  <input type="date" value={form.purchase_date||''} onChange={e=>sf('purchase_date',e.target.value)}
                    className="flex-1 text-xs focus:outline-none"/>
                  {form.purchase_date && <button onClick={()=>sf('purchase_date','')} className="text-gray-400 hover:text-gray-600"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></button>}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Purchase Price</label>
                <div className="flex items-center border border-gray-300 rounded px-2 py-2 focus-within:border-green-500">
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
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:border-green-500"/>
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
          <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded disabled:opacity-50">
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
                className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500 w-32" placeholder="MM/DD/YYYY"/>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Exp Date</label>
              <input type="date" value={rowForm.exp_date} onChange={e=>setRowForm(p=>({...p,exp_date:e.target.value}))}
                className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500 w-32" placeholder="MM/DD/YYYY"/>
            </div>
            {docType.hasNameNotes && (
              <>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Name</label>
                  <input value={rowForm.name} onChange={e=>setRowForm(p=>({...p,name:e.target.value}))}
                    className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500 w-28"/>
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Notes</label>
                  <input value={rowForm.notes} onChange={e=>setRowForm(p=>({...p,notes:e.target.value}))}
                    className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500 w-36"/>
                </div>
              </>
            )}
            <div className="flex flex-col gap-0.5 flex-1">
              <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Attachments</label>
              <input className="border border-gray-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:border-green-500 w-full" readOnly placeholder=""/>
            </div>
            <input type="file" ref={fileRef} className="hidden"/>
            <button onClick={()=>fileRef.current?.click()} className="text-xs text-gray-400 hover:text-gray-600 mt-4 whitespace-nowrap">upload</button>
            <button onClick={handleSave} disabled={saving||isNew}
              title={isNew?'Save the truck first':''}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded disabled:opacity-40 mt-4 whitespace-nowrap">
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
