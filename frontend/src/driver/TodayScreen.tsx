import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Gauge, Phone, Receipt, Truck as TruckIcon, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import { driverApi, type DriverHome, type DriverLoad } from '@/api/driver'
import { BigButton, Card, Header, PhotoButton, SignOut, money } from './shared'
import { enqueue, newId } from './outbox'
import { whereAmI } from './geo'
import { usePending } from './DriverApp'

const CACHE_KEY = 'karvan.driver.home'

/** Today: my truck, the load I am on with one big next-step button, and quick actions. */
export default function TodayScreen() {
  const [home, setHome] = useState<DriverHome | null>(() => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') } catch { return null } })
  const [odo, setOdo] = useState('')
  const [expense, setExpense] = useState<{ amount: string; category: string; note: string } | null>(null)
  const pending = usePending()

  const load = useCallback(async () => {
    try { const h = await driverApi.me(); setHome(h); localStorage.setItem(CACHE_KEY, JSON.stringify(h)) }
    catch { /* offline: keep the cached screen */ }
  }, [])
  useEffect(() => { load() }, [load, pending.length])

  const cur = home?.current_load

  const advance = async (l: DriverLoad) => {
    if (!l.next_status) return
    if (l.next_status === 'Delivered' && !l.pod) return toast.error('Take the POD photo first')
    const pos = await whereAmI()
    await enqueue({ id: newId(), kind: 'status', url: `/api/v1/driver/loads/${l.id}/status`, label: `${l.number}: ${l.next_status}`,
      json: { status: l.next_status, at: new Date().toISOString(), ...(pos || {}) } })
    setHome(h => h && h.current_load?.id === l.id ? { ...h, current_load: { ...h.current_load, status: l.next_status!, next_status: nextAfter(l.next_status!) } } : h)
    toast.success(`${l.next_status}`)
  }

  const saveOdometer = async () => {
    const n = Number(odo.replace(/\D/g, ''))
    if (!n) return
    await enqueue({ id: newId(), kind: 'odometer', url: '/api/v1/driver/odometer', label: `Odometer ${n.toLocaleString()}`, json: { reading: n } })
    setOdo(''); toast.success('Odometer saved')
  }

  const saveExpense = async (blob?: Blob) => {
    if (!expense) return
    const amount = Number(expense.amount)
    if (!amount) return toast.error('Enter the amount')
    const pos = await whereAmI()
    await enqueue({ id: newId(), kind: 'expense', url: '/api/v1/driver/expenses', label: `${expense.category} ${money(amount)}`,
      fields: { amount: String(amount), category: expense.category, note: expense.note, ...(pos ? { lat: String(pos.lat), lng: String(pos.lng) } : {}) },
      files: blob ? [{ field: 'file', name: 'receipt.jpg', type: blob.type || 'image/jpeg', blob }] : [] })
    setExpense(null); toast.success('Receipt saved')
  }

  if (!home) return <div className="p-6 text-center text-sm text-slate-400">Loading…</div>

  return (
    <div className="space-y-3 p-3">
      <Header title={`Hi ${home.driver.name.split(' ')[0]}`} sub={home.truck ? `Truck ${home.truck.unit_number}${home.truck.make ? ` · ${home.truck.make} ${home.truck.model || ''}` : ''}` : 'No truck assigned yet'} action={<SignOut />} />

      {cur ? (
        <Card className="border-blue-200">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.6875rem] font-bold uppercase tracking-wide text-blue-700">Current load</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6875rem] font-bold text-slate-600">{cur.status}</span>
          </div>
          <div className="text-lg font-bold text-slate-950">#{cur.number} <span className="text-sm font-semibold text-slate-500">· {cur.broker?.name}</span></div>
          <Route stop={cur.pickup} label="Pickup" /><Route stop={cur.delivery} label="Delivery" />
          <div className="mt-3 grid gap-2">
            {cur.next_status && <BigButton onClick={() => advance(cur)}>{cur.next_status === 'Delivered' ? 'Mark delivered' : cur.next_status === 'Picked-up' ? 'Loaded, leaving' : cur.next_status === 'En Route' ? 'On my way' : 'Accept load'}<ArrowRight className="h-4 w-4" /></BigButton>}
            <PhotoButton label={cur.pod ? 'Add another POD photo' : 'Take POD photo'} tone={cur.next_status === 'Delivered' && !cur.pod ? 'primary' : 'secondary'} url={`/api/v1/driver/loads/${cur.id}/photos`} fields={{ category: 'pod' }} onQueued={load} />
            <div className="grid grid-cols-2 gap-2">
              <PhotoButton label="BOL" tone="secondary" url={`/api/v1/driver/loads/${cur.id}/photos`} fields={{ category: 'bol' }} />
              {cur.broker?.phone ? <a href={`tel:${cur.broker.phone}`} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800"><Phone className="h-4 w-4" />Call broker</a>
                : <Link to={`/driver/loads/${cur.id}`} className="flex h-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800">Details</Link>}
            </div>
          </div>
        </Card>
      ) : (
        <Card><div className="text-sm font-semibold text-slate-800">No load right now</div><p className="text-xs text-slate-500">Dispatch will send the next one here.</p></Card>
      )}

      {home.upcoming.length > 0 && (
        <Card>
          <div className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">Next up</div>
          {home.upcoming.map(l => (
            <Link key={l.id} to={`/driver/loads/${l.id}`} className="flex items-center justify-between border-t border-slate-100 py-2 text-sm first:border-0">
              <span><b>#{l.number}</b> <span className="text-slate-500">{l.pickup?.city}, {l.pickup?.state} → {l.delivery?.city}, {l.delivery?.state}</span></span>
              <span className="text-xs text-slate-400">{l.pickup?.date ? new Date(l.pickup.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
            </Link>
          ))}
        </Card>
      )}

      {home.week && (
        <Card>
          <div className="flex items-center justify-between">
            <div><div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">This week · {home.week.period}</div>
              <div className="text-2xl font-bold tabular-nums text-slate-950">{money(home.week.driver_pay)}</div>
              <div className="text-xs text-slate-500">{home.week.loads} loads · {money(home.week.gross)} gross</div></div>
            <Link to="/driver/week" className="text-xs font-semibold text-blue-700">Details</Link>
          </div>
        </Card>
      )}

      <Card>
        <div className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">Quick actions</div>
        <div className="grid grid-cols-2 gap-2">
          <PhotoButton label="Truck inspection" multiple tone="secondary" url="/api/v1/driver/inspections" fields={{ kind: 'pre_trip' }}><TruckIcon className="h-5 w-5" />Inspection</PhotoButton>
          <BigButton tone="secondary" onClick={() => setExpense({ amount: '', category: 'Fuel', note: '' })}><Receipt className="h-5 w-5" />Receipt</BigButton>
          <PhotoButton label="Breakdown report" multiple tone="secondary" url="/api/v1/driver/inspections" fields={{ kind: 'breakdown' }}><Wrench className="h-5 w-5" />Breakdown</PhotoButton>
          <div className="flex h-12 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2">
            <Gauge className="h-5 w-5 shrink-0 text-slate-500" />
            <input value={odo} onChange={e => setOdo(e.target.value)} inputMode="numeric" placeholder={home.week?.odometer ? home.week.odometer.toLocaleString() : 'Odometer'} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" onKeyDown={e => e.key === 'Enter' && saveOdometer()} />
            {odo && <button onClick={saveOdometer} className="text-xs font-bold text-blue-700">Save</button>}
          </div>
        </div>
      </Card>

      {expense && (
        <div className="fixed inset-0 z-20 flex items-end bg-slate-900/50" onClick={() => setExpense(null)}>
          <div className="w-full rounded-t-2xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
            <div className="mb-3 text-base font-bold">Receipt</div>
            <div className="grid grid-cols-2 gap-2">
              <input autoFocus value={expense.amount} onChange={e => setExpense({ ...expense, amount: e.target.value })} inputMode="decimal" placeholder="Amount $" className="h-12 rounded-xl border border-slate-200 px-3 text-lg font-bold" />
              <select value={expense.category} onChange={e => setExpense({ ...expense, category: e.target.value })} className="h-12 rounded-xl border border-slate-200 px-3 text-sm font-semibold">
                {['Fuel', 'Tolls', 'Scale', 'Lumper', 'Parking', 'Repair', 'Other'].map(c => <option key={c}>{c}</option>)}
              </select>
              <input value={expense.note} onChange={e => setExpense({ ...expense, note: e.target.value })} placeholder="Where, what (optional)" className="col-span-2 h-11 rounded-xl border border-slate-200 px-3 text-sm" />
            </div>
            <div className="mt-3 grid gap-2">
              <ReceiptPhoto onPick={saveExpense} />
              <BigButton tone="secondary" onClick={() => saveExpense()}>Save without photo</BigButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ReceiptPhoto({ onPick }: { onPick: (blob: Blob) => void }) {
  return (
    <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-bold text-white">
      <Receipt className="h-5 w-5" />Photo of the receipt
      <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) onPick(await (await import('./geo')).shrinkPhoto(f)) }} />
    </label>
  )
}

function Route({ stop, label }: { stop: DriverLoad['pickup']; label: string }) {
  if (!stop) return null
  const addr = [stop.address, [stop.city, stop.state].filter(Boolean).join(', '), stop.zip].filter(Boolean).join(', ')
  return (
    <div className="mt-2 flex gap-2 text-sm">
      <span className="w-14 shrink-0 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}</span>
      <div className="min-w-0"><div className="font-semibold text-slate-900">{stop.title || stop.city}</div>
        <a href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline-offset-2 hover:underline">{addr}</a>
        {stop.date && <div className="text-xs text-slate-500">{new Date(stop.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>}</div>
    </div>
  )
}

export function nextAfter(s: string) { const f = ['Dispatched', 'En Route', 'Picked-up', 'Delivered']; const i = f.indexOf(s); return i >= 0 && i < f.length - 1 ? f[i + 1] : null }
