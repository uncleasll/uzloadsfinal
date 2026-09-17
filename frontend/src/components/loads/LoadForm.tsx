import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { loadsApi } from '@/api/loads'
import type { Broker, Dispatcher, Driver, Load, LoadCreatePayload, LoadStatus, BillingStatus, Trailer, Truck } from '@/types'
import { ALL_BILLING_STATUSES, ALL_STATUSES } from '@/utils'

export const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

export type Entities = LoadFormEntities
export interface LoadFormEntities { drivers: Driver[]; trucks: Truck[]; trailers: Trailer[]; brokers: Broker[]; dispatchers: Dispatcher[] }

const field = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50'
const label = 'mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400'
const invalidRing = 'border-red-300 focus:border-red-400 focus:ring-red-100'

type Stop = { title: string; address: string; city: string; state: string; zip_code: string; stop_date: string }
const emptyStop = (): Stop => ({ title: '', address: '', city: '', state: '', zip_code: '', stop_date: '' })

type Form = {
  status: LoadStatus; billing_status: BillingStatus; po_number: string; rate: string
  loaded_miles: string; empty_miles: string; notes: string
  driver_id: string; truck_id: string; trailer_id: string; broker_id: string; dispatcher_id: string
  pickup: Stop; delivery: Stop
}

function fromLoad(load?: Load | null): Form {
  const stop = (kind: 'pickup' | 'delivery'): Stop => {
    const s = load?.stops?.find(x => x.stop_type === kind)
    return s ? { title: s.title || s.company_name || '', address: s.address || '', city: s.city || '', state: s.state || '', zip_code: s.zip_code || '', stop_date: s.stop_date || '' } : emptyStop()
  }
  return {
    status: load?.status || 'New', billing_status: load?.billing_status || 'Pending',
    po_number: load?.po_number || '', rate: load?.rate ? String(load.rate) : '',
    loaded_miles: load?.loaded_miles ? String(load.loaded_miles) : '', empty_miles: load?.empty_miles ? String(load.empty_miles) : '',
    notes: load?.notes || '',
    driver_id: load?.driver?.id ? String(load.driver.id) : '', truck_id: load?.truck?.id ? String(load.truck.id) : '', trailer_id: load?.trailer?.id ? String(load.trailer.id) : '',
    broker_id: load?.broker?.id ? String(load.broker.id) : '', dispatcher_id: load?.dispatcher?.id ? String(load.dispatcher.id) : '',
    pickup: stop('pickup'), delivery: stop('delivery'),
  }
}

/**
 * One form for creating and editing a load. Two columns on wide screens, stacked on narrow ones.
 * Required: truck or driver, pickup date, rate. Everything else can be filled in later.
 */
export default function LoadForm({ load, entities, onClose, onSaved, presetTruckId, presetWeekStart }: {
  load?: Load | null
  entities: LoadFormEntities
  onClose: () => void
  onSaved: (load: Load) => void
  presetTruckId?: number
  presetWeekStart?: string
}) {
  const editing = !!load
  const [f, setF] = useState<Form>(() => {
    const base = fromLoad(load)
    if (!load && presetTruckId) base.truck_id = String(presetTruckId)
    if (!load && presetWeekStart) base.pickup.stop_date = presetWeekStart
    return base
  })
  const [saving, setSaving] = useState(false)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Driver follows the truck until the user picks someone
  const truck = useMemo(() => entities.trucks.find(t => String(t.id) === f.truck_id), [entities.trucks, f.truck_id])
  useEffect(() => { if (!editing && truck?.driver_id && !f.driver_id) setF(p => ({ ...p, driver_id: String(truck.driver_id) })) }, [truck]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(p => ({ ...p, [k]: v }))
  const setStop = (kind: 'pickup' | 'delivery', patch: Partial<Stop>) => setF(p => ({ ...p, [kind]: { ...p[kind], ...patch } }))

  const errors = {
    who: !f.truck_id && !f.driver_id ? 'Pick a truck or a driver' : '',
    pickup: !f.pickup.stop_date ? 'Pickup date is required' : '',
    rate: !(Number(f.rate) > 0) ? 'Rate is required' : '',
    delivery: f.delivery.stop_date && f.pickup.stop_date && f.delivery.stop_date < f.pickup.stop_date ? 'Delivery is before pickup' : '',
  }
  const invalid = Object.values(errors).some(Boolean)
  const totalMiles = (Number(f.loaded_miles) || 0) + (Number(f.empty_miles) || 0)
  const rpm = totalMiles && Number(f.rate) ? Number(f.rate) / totalMiles : null

  const save = async () => {
    setTried(true)
    if (invalid) { toast.error(Object.values(errors).find(Boolean) as string); return }
    setSaving(true)
    const stopPayload = (kind: 'pickup' | 'delivery', order: number, s: Stop) => ({
      stop_type: kind, stop_order: order, title: s.title || undefined, address: s.address || undefined, city: s.city || undefined, state: s.state || undefined,
      zip_code: s.zip_code || undefined, country: 'US', stop_date: s.stop_date || undefined,
    })
    const payload: LoadCreatePayload = {
      status: f.status, billing_status: f.billing_status, load_date: f.pickup.stop_date,
      actual_delivery_date: f.status === 'Delivered' || f.status === 'Closed' ? f.delivery.stop_date || undefined : undefined,
      rate: Number(f.rate), po_number: f.po_number || undefined, notes: f.notes || undefined,
      loaded_miles: Number(f.loaded_miles) || 0, empty_miles: Number(f.empty_miles) || 0, total_miles: totalMiles,
      driver_id: f.driver_id ? Number(f.driver_id) : undefined, truck_id: f.truck_id ? Number(f.truck_id) : undefined,
      trailer_id: f.trailer_id ? Number(f.trailer_id) : undefined, broker_id: f.broker_id ? Number(f.broker_id) : undefined,
      dispatcher_id: f.dispatcher_id ? Number(f.dispatcher_id) : undefined,
      statement_week: !editing && presetWeekStart ? presetWeekStart : undefined,
      stops: [stopPayload('pickup', 1, f.pickup), stopPayload('delivery', 2, f.delivery)],
    }
    let body: Record<string, unknown> = { ...payload }
    if (editing) {
      const orig = fromLoad(load)
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
      body = {}
      if (f.status !== orig.status) body.status = payload.status
      if (f.billing_status !== orig.billing_status) body.billing_status = payload.billing_status
      if (f.po_number !== orig.po_number) body.po_number = payload.po_number ?? ''
      if (f.notes !== orig.notes) body.notes = payload.notes ?? ''
      if (f.rate !== orig.rate) body.rate = payload.rate
      if (f.loaded_miles !== orig.loaded_miles || f.empty_miles !== orig.empty_miles) { body.loaded_miles = payload.loaded_miles; body.empty_miles = payload.empty_miles; body.total_miles = payload.total_miles }
      for (const k of ['driver_id', 'truck_id', 'trailer_id', 'broker_id', 'dispatcher_id'] as const) if (f[k] !== orig[k]) body[k] = payload[k] ?? null   // null clears the assignment
      if (!same(f.pickup, orig.pickup) || !same(f.delivery, orig.delivery)) { body.stops = payload.stops; body.load_date = payload.load_date; body.actual_delivery_date = payload.actual_delivery_date }
      if (!Object.keys(body).length) { onClose(); return }
    }
    try {
      const saved = editing ? await loadsApi.update(load!.id, body as Partial<LoadCreatePayload>) : await loadsApi.create(payload)
      toast.success(editing ? 'Load updated' : `Load #${saved.load_number} created`)
      onSaved(saved)
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  const err = (key: keyof typeof errors) => tried && errors[key] ? invalidRing : ''

  // Portal to <body> with a higher layer so the form sits above the load drawer it may be opened from
  return createPortal(
    <div className="modal-overlay !z-[60]" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-container max-w-4xl overflow-hidden rounded-xl" role="dialog" aria-modal="true" aria-label={editing ? 'Edit load' : 'New load'}>
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">{editing ? `Edit load #${load!.load_number}` : 'New load'}</h2>
            <p className="text-[0.6875rem] text-slate-400">{editing ? 'Changes apply to the week this load is filed in.' : 'Truck or driver, pickup date and rate are enough to start. The rest can be added later.'}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-4 w-4" /></button>
        </header>

        <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-5">
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            {/* Route */}
            <section className="space-y-3">
              <StopCard kind="pickup" stop={f.pickup} onChange={p => setStop('pickup', p)} error={tried ? errors.pickup : ''} />
              <StopCard kind="delivery" stop={f.delivery} onChange={p => setStop('delivery', p)} error={tried ? errors.delivery : ''} />
            </section>

            {/* Load + assignment */}
            <section className="space-y-4">
              <div>
                <div className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">Load</div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div><label className={label}>Broker</label>
                    <select value={f.broker_id} onChange={e => set('broker_id', e.target.value)} className={field}><option value="">—</option>{entities.brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
                  <div><label className={label}>Broker load / PO #</label><input value={f.po_number} onChange={e => set('po_number', e.target.value)} placeholder="LD595285" className={field} /></div>
                  <div><label className={label}>Rate</label><input value={f.rate} onChange={e => set('rate', e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" placeholder="2400" className={`${field} text-right ${err('rate')}`} /></div>
                  <div><label className={label}>Dispatcher</label>
                    <select value={f.dispatcher_id} onChange={e => set('dispatcher_id', e.target.value)} className={field}><option value="">—</option>{entities.dispatchers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  <div><label className={label}>Loaded miles</label><input value={f.loaded_miles} onChange={e => set('loaded_miles', e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="720" className={`${field} text-right`} /></div>
                  <div><label className={label}>Deadhead miles</label><input value={f.empty_miles} onChange={e => set('empty_miles', e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="48" className={`${field} text-right`} /></div>
                </div>
                {totalMiles > 0 && <div className="mt-1.5 text-[0.6875rem] text-slate-500">{totalMiles.toLocaleString()} miles total{rpm ? ` · $${rpm.toFixed(2)} per mile` : ''}</div>}
              </div>

              <div>
                <div className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">Assignment</div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div><label className={label}>Truck</label>
                    <select value={f.truck_id} onChange={e => set('truck_id', e.target.value)} className={`${field} ${err('who')}`}><option value="">—</option>{entities.trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}</select></div>
                  <div><label className={label}>Driver</label>
                    <select value={f.driver_id} onChange={e => set('driver_id', e.target.value)} className={`${field} ${err('who')}`}><option value="">—</option>{entities.drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                  <div><label className={label}>Trailer</label>
                    <select value={f.trailer_id} onChange={e => set('trailer_id', e.target.value)} className={field}><option value="">—</option>{entities.trailers.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}</select></div>
                  <div><label className={label}>Status</label>
                    <select value={f.status} onChange={e => set('status', e.target.value as LoadStatus)} className={field}>{ALL_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
                  <div><label className={label}>Billing</label>
                    <select value={f.billing_status} onChange={e => set('billing_status', e.target.value as BillingStatus)} className={field}>{ALL_BILLING_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
                </div>
                {tried && errors.who && <div className="mt-1.5 text-[0.6875rem] font-semibold text-red-600">{errors.who}</div>}
              </div>

              <div><label className={label}>Notes</label>
                <textarea value={f.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Anything the driver or the office should know" className="w-full resize-y rounded-lg border border-slate-200 px-2.5 py-2 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" /></div>
            </section>
          </div>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50/70 px-5 py-3">
          <div className="text-[0.6875rem] text-slate-500">{tried && invalid ? <span className="font-semibold text-red-600">{Object.values(errors).find(Boolean)}</span> : 'Esc closes without saving'}</div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary h-9 rounded-lg px-3 text-xs">Cancel</button>
            <button onClick={save} disabled={saving} className="btn-primary h-9 rounded-lg px-4 text-xs">{saving ? 'Saving…' : editing ? 'Save changes' : 'Create load'}</button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

function StopCard({ kind, stop, onChange, error }: { kind: 'pickup' | 'delivery'; stop: Stop; onChange: (p: Partial<Stop>) => void; error: string }) {
  const pickup = kind === 'pickup'
  return (
    <div className={`rounded-lg border p-3.5 ${error ? 'border-red-300 bg-red-50/30' : 'border-slate-200 bg-slate-50/60'}`}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className={`grid h-6 w-6 place-items-center rounded-md ${pickup ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{pickup ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}</span>
        <span className="text-xs font-bold text-slate-900">{pickup ? 'Pickup' : 'Delivery'}</span>
        {error && <span className="ml-auto text-[0.6875rem] font-semibold text-red-600">{error}</span>}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div><label className={label}>Date</label><input type="date" value={stop.stop_date} onChange={e => onChange({ stop_date: e.target.value })} className={`${field} ${error ? invalidRing : ''}`} /></div>
        <div><label className={label}>{pickup ? 'Shipper' : 'Receiver'}</label><input value={stop.title} onChange={e => onChange({ title: e.target.value })} placeholder={pickup ? 'Shipper name' : 'Receiver name'} className={field} /></div>
        <div className="col-span-2"><label className={label}>Address</label><input value={stop.address} onChange={e => onChange({ address: e.target.value })} placeholder="Street address" className={field} /></div>
        <div><label className={label}>City</label><input value={stop.city} onChange={e => onChange({ city: e.target.value })} placeholder={pickup ? 'Port Reading' : 'Arlington Heights'} className={field} /></div>
        <div className="grid grid-cols-[1fr_1.2fr] gap-2">
          <div><label className={label}>State</label>
            <select value={stop.state} onChange={e => onChange({ state: e.target.value })} className={field}><option value="">—</option>{US_STATES.map(s => <option key={s}>{s}</option>)}</select></div>
          <div><label className={label}>ZIP</label><input value={stop.zip_code} onChange={e => onChange({ zip_code: e.target.value.replace(/\D/g, '').slice(0, 5) })} inputMode="numeric" placeholder="07064" className={field} /></div>
        </div>
      </div>
    </div>
  )
}
