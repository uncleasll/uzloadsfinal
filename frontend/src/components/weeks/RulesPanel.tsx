import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { weeksApi, type Deduction, type DriverRules, type TruckRules } from '@/api/weeks'

const input = 'h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'

// ── Rules panel: truck template + driver pay, edited in place ────────────────

export default function RulesPanel({ truckId, driverId, onSaved, onClose }: { truckId: number | null; driverId: number | null; onSaved: () => void; onClose: () => void }) {
  const [truck, setTruck] = useState<TruckRules | null>(null)
  const [driver, setDriver] = useState<DriverRules | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (truckId) weeksApi.truckRules(truckId).then(setTruck).catch(e => toast.error(e.message))
    if (driverId) weeksApi.driverRules(driverId).then(setDriver).catch(e => toast.error(e.message))
  }, [truckId, driverId])

  const save = async () => {
    if (truckId && !truck) return
    setSaving(true)
    try {
      if (truckId && truck) await weeksApi.saveTruckRules(truckId, { fee_pct: truck.fee_pct, carry_negative: truck.carry_negative, deductions: truck.deductions.filter(d => d.label.trim()) })
      if (driver && driverId) await weeksApi.saveDriverRules(driverId, { pay_type: driver.pay_type, pay_pct: driver.pay_pct, per_mile_rate: driver.per_mile_rate, deductions: driver.deductions.filter(d => d.label.trim()) })
      toast.success('Rules saved. Unpaid weeks are recalculated.')
      onSaved()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <section className="rounded-lg border border-blue-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{truckId ? 'Rules for this truck and driver' : 'Driver pay rules'}</h2>
          <p className="text-[0.6875rem] text-slate-400">These apply to every week that is not paid yet.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="btn-secondary h-8 rounded-lg px-3 text-xs">Cancel</button>
          <button onClick={save} disabled={saving || (!!truckId && !truck)} className="btn-primary h-8 rounded-lg px-3 text-xs">{saving ? 'Saving…' : 'Save rules'}</button>
        </div>
      </header>
      <div className={`grid gap-4 p-4 ${truckId ? 'md:grid-cols-2' : ''}`}>
        {truckId && <div>
          <div className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">Truck {truck?.unit_number ?? ''}</div>
          {truck && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 text-slate-600">Fee % of gross
                  <input inputMode="decimal" value={truck.fee_pct} onChange={e => setTruck({ ...truck, fee_pct: Number(e.target.value) || 0 })} className={`${input} w-20 text-right`} /></label>
                <label className="flex items-center gap-1.5 text-slate-600">
                  <input type="checkbox" checked={truck.carry_negative} onChange={e => setTruck({ ...truck, carry_negative: e.target.checked })} className="h-3.5 w-3.5 accent-blue-600" />
                  Carry a negative week forward
                </label>
              </div>
              <DeductionList title="Fixed weekly deductions" items={truck.deductions} onChange={d => setTruck({ ...truck, deductions: d })}
                presets={['CARGO INS', 'ELD', 'SAFETY', 'PHYSICAL DAMAGE INS', 'TRAILER', 'TRUCK PAYMENT', 'PARKING', 'IFTA']} />
            </>
          )}
        </div>}
        <div>
          <div className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">Driver {driver?.name ?? ''}</div>
          {!driverId && <div className="text-xs text-slate-400">Assign a driver to a load or to the truck to set pay rules.</div>}
          {driver && (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
                <select value={driver.pay_type} onChange={e => setDriver({ ...driver, pay_type: e.target.value as DriverRules['pay_type'] })} className={input}>
                  <option value="percent">Percent of gross</option>
                  <option value="per_mile">Per mile</option>
                  <option value="none">No driver pay (owner drives)</option>
                </select>
                {driver.pay_type === 'percent' && <label className="flex items-center gap-1.5 text-slate-600">% <input inputMode="decimal" value={driver.pay_pct} onChange={e => setDriver({ ...driver, pay_pct: Number(e.target.value) || 0 })} className={`${input} w-20 text-right`} /></label>}
                {driver.pay_type === 'per_mile' && <label className="flex items-center gap-1.5 text-slate-600">$ per mile <input inputMode="decimal" value={driver.per_mile_rate} onChange={e => setDriver({ ...driver, per_mile_rate: Number(e.target.value) || 0 })} className={`${input} w-20 text-right`} /></label>}
              </div>
              <DeductionList title="Taken from the driver's pay" items={driver.deductions} onChange={d => setDriver({ ...driver, deductions: d })} presets={['Occupational health']} />
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function DeductionList({ title, items, onChange, presets }: { title: string; items: Deduction[]; onChange: (d: Deduction[]) => void; presets: string[] }) {
  const set = (i: number, patch: Partial<Deduction>) => onChange(items.map((d, j) => (j === i ? { ...d, ...patch } : d)))
  return (
    <div>
      <div className="mb-1 text-[0.6875rem] font-semibold text-slate-500">{title}</div>
      <div className="space-y-1">
        {items.map((d, i) => (
          <div key={d.id ?? `new-${i}`} className="flex items-center gap-1.5">
            <input list={`presets-${title}`} value={d.label} onChange={e => set(i, { label: e.target.value })} placeholder="Label" className={`${input} min-w-0 flex-1`} />
            <input inputMode="decimal" value={d.amount} onChange={e => set(i, { amount: Number(e.target.value) || 0 })} className={`${input} w-24 text-right`} />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-600" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        <datalist id={`presets-${title}`}>{presets.map(p => <option key={p} value={p} />)}</datalist>
        <button onClick={() => onChange([...items, { label: '', amount: 0, is_active: true }])} className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-blue-700 hover:underline"><Plus className="h-3 w-3" />Add deduction</button>
      </div>
    </div>
  )
}
