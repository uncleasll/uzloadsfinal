import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { loadsApi } from '@/api/loads'
import { brokersApi, dispatchersApi, driversApi, trucksApi } from '@/api/entities'
import type { Broker, Dispatcher, Driver, Truck } from '@/types'

const field = 'h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
const label = 'mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400'

/**
 * The Excel load row as a form: truck, driver, dispatcher, broker, load #, PU/DEL dates, from, to, rate.
 * One entry, and the load appears on the truck's week automatically.
 */
export default function QuickLoadModal({ truckId, defaultDate, weekStart, onClose, onSaved }: {
  truckId?: number
  defaultDate?: string
  /** Saturday of the week the load should be filed in; omit to file by pickup date */
  weekStart?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([])
  const [saving, setSaving] = useState(false)
  const [f, setF] = useState({
    truck_id: truckId ? String(truckId) : '', driver_id: '', dispatcher_id: '', broker_id: '', load_number: '',
    pu_date: defaultDate || '', del_date: '', from_city: '', from_state: '', to_city: '', to_state: '', rate: '', loaded_miles: '', empty_miles: '',
  })

  useEffect(() => {
    Promise.all([trucksApi.list(true), driversApi.list(true), brokersApi.list(true), dispatchersApi.list(true)])
      .then(([t, d, b, di]) => { setTrucks(t); setDrivers(d); setBrokers(b); setDispatchers(di) })
      .catch(e => toast.error(e.message))
  }, [])

  // Driver follows the truck unless the user picks someone else
  const truck = useMemo(() => trucks.find(t => String(t.id) === f.truck_id), [trucks, f.truck_id])
  useEffect(() => { if (truck?.driver_id && !f.driver_id) setF(p => ({ ...p, driver_id: String(truck.driver_id) })) }, [truck]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(p => ({ ...p, [k]: e.target.value }))
  const canSave = f.truck_id && f.pu_date && f.rate && Number(f.rate) > 0

  const save = async () => {
    if (!canSave) return
    setSaving(true)
    try {
      await loadsApi.create({
        status: 'Delivered', billing_status: 'Pending',
        load_date: f.pu_date, actual_delivery_date: f.del_date || undefined, rate: Number(f.rate),
        po_number: f.load_number || undefined,
        statement_week: weekStart || undefined,
        loaded_miles: Number(f.loaded_miles) || 0, empty_miles: Number(f.empty_miles) || 0, total_miles: (Number(f.loaded_miles) || 0) + (Number(f.empty_miles) || 0),
        truck_id: Number(f.truck_id), driver_id: f.driver_id ? Number(f.driver_id) : undefined,
        broker_id: f.broker_id ? Number(f.broker_id) : undefined, dispatcher_id: f.dispatcher_id ? Number(f.dispatcher_id) : undefined,
        stops: [
          { stop_type: 'pickup', stop_order: 1, city: f.from_city || undefined, state: f.from_state || undefined, stop_date: f.pu_date },
          { stop_type: 'delivery', stop_order: 2, city: f.to_city || undefined, state: f.to_state || undefined, stop_date: f.del_date || undefined },
        ],
      })
      toast.success('Load added to the week')
      onSaved()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-container max-w-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-slate-950">Add load</h2>
            <p className="text-[0.6875rem] text-slate-400">Same fields as the statement row. {weekStart ? 'It is filed in the week you are looking at.' : 'It lands on the truck\'s week by pickup date.'}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close"><X className="h-4 w-4" /></button>
        </header>
        <div className="grid gap-3 p-5 sm:grid-cols-2">
          <div><label className={label}>Truck</label>
            <select value={f.truck_id} onChange={set('truck_id')} className={field}><option value="">Choose truck</option>{trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}</select></div>
          <div><label className={label}>Driver</label>
            <select value={f.driver_id} onChange={set('driver_id')} className={field}><option value="">No driver</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div><label className={label}>Dispatcher</label>
            <select value={f.dispatcher_id} onChange={set('dispatcher_id')} className={field}><option value="">—</option>{dispatchers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
          <div><label className={label}>Broker</label>
            <select value={f.broker_id} onChange={set('broker_id')} className={field}><option value="">—</option>{brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div><label className={label}>Broker load #</label><input value={f.load_number} onChange={set('load_number')} placeholder="LD595285" className={field} /></div>
          <div><label className={label}>Rate</label><input value={f.rate} onChange={e => setF(p => ({ ...p, rate: e.target.value.replace(/[^\d.]/g, '') }))} inputMode="decimal" placeholder="1400" className={`${field} text-right`} /></div>
          <div><label className={label}>Pickup date</label><input type="date" value={f.pu_date} onChange={set('pu_date')} className={field} /></div>
          <div><label className={label}>Delivery date</label><input type="date" value={f.del_date} onChange={set('del_date')} className={field} /></div>
          <div className="grid grid-cols-[1fr_4.5rem] gap-2"><div><label className={label}>From</label><input value={f.from_city} onChange={set('from_city')} placeholder="Port Reading" className={field} /></div><div><label className={label}>ST</label><input value={f.from_state} onChange={e => setF(p => ({ ...p, from_state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="NJ" className={field} /></div></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className={label}>Loaded mi</label><input value={f.loaded_miles} onChange={e => setF(p => ({ ...p, loaded_miles: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder="720" className={`${field} text-right`} /></div>
            <div><label className={label}>Deadhead mi</label><input value={f.empty_miles} onChange={e => setF(p => ({ ...p, empty_miles: e.target.value.replace(/\D/g, '') }))} inputMode="numeric" placeholder="48" className={`${field} text-right`} /></div>
          </div>
          <div className="grid grid-cols-[1fr_4.5rem] gap-2"><div><label className={label}>To</label><input value={f.to_city} onChange={set('to_city')} placeholder="Arlington Heights" className={field} /></div><div><label className={label}>ST</label><input value={f.to_state} onChange={e => setF(p => ({ ...p, to_state: e.target.value.toUpperCase().slice(0, 2) }))} placeholder="IL" className={field} /></div></div>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button onClick={onClose} className="btn-secondary h-9 rounded-lg px-3 text-xs">Cancel</button>
          <button onClick={save} disabled={!canSave || saving} className="btn-primary h-9 rounded-lg px-4 text-xs">{saving ? 'Saving…' : 'Add load'}</button>
        </footer>
      </div>
    </div>
  )
}
