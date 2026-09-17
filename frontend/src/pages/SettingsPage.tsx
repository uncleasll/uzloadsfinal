import { useCallback, useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import toast from 'react-hot-toast'
import { dispatchersApi, driversApi, trucksApi } from '@/api/entities'
import { officeApi } from '@/api/office'
import { weeksApi, type DriverRules, type TruckRules } from '@/api/weeks'
import type { Dispatcher, Driver, Truck } from '@/types'
import RulesPanel from '@/components/weeks/RulesPanel'
import { formatCurrency } from '@/utils'
import { companyApi, type CompanyMe } from '@/api/maintenance'
import { useAuth } from '@/hooks/useAuth'

type Tab = 'company' | 'trucks' | 'drivers' | 'dispatchers'
const input = 'h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'

/** The three rule sets behind every weekly statement, in one place. */
export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('trucks')
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-4 py-4 lg:px-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-950">Settings</h1>
          <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">Truck deductions, driver pay and dispatcher commissions. Changes apply to every week that is not paid yet.</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {([['company', 'Company'], ['trucks', 'Trucks'], ['drivers', 'Drivers'], ['dispatchers', 'Dispatchers']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k} className={`rounded-md px-3 py-1.5 text-[0.6875rem] font-semibold transition ${tab === k ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-slate-50/70 p-3">
        {tab === 'company' && <CompanyTab />}
        {tab === 'trucks' && <TrucksTab />}
        {tab === 'drivers' && <DriversTab />}
        {tab === 'dispatchers' && <DispatchersTab />}
      </div>
    </div>
  )
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-slate-200 bg-slate-50/80 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">
          {head.map((h, i) => <th key={h || i} className={`px-3 py-2 ${i > 0 && /amount|fee|%|value/i.test(h) ? 'text-right' : 'text-left'}`}>{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  )
}

function TrucksTab() {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [rules, setRules] = useState<Record<number, TruckRules>>({})
  const [editing, setEditing] = useState<Truck | null>(null)
  const load = useCallback(async () => {
    try {
      const list = await trucksApi.list(true)
      setTrucks(list)
      const all = await Promise.all(list.map(t => weeksApi.truckRules(t.id)))
      setRules(Object.fromEntries(all.map(r => [r.truck_id, r])))
    } catch (e) { toast.error((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])
  return (
    <div className="space-y-3">
      {editing && <RulesPanel truckId={editing.id} driverId={editing.driver_id ?? null} onSaved={() => { setEditing(null); load() }} onClose={() => setEditing(null)} />}
      <Table head={['Truck', 'Driver', 'Fee %', 'Fixed weekly deductions', 'Weekly amount', 'Carry negative', '']}>
        {trucks.map(t => { const r = rules[t.id]; const active = r?.deductions.filter(d => d.is_active) || []; return (
          <tr key={t.id} className="hover:bg-blue-50/40">
            <td className="px-3 py-2 font-bold text-slate-900">{t.unit_number}</td>
            <td className="px-3 py-2 text-slate-700">{t.driver?.name || <span className="text-slate-400">—</span>}</td>
            <td className="px-3 py-2 text-right tabular-nums">{r ? `${r.fee_pct}%` : '…'}</td>
            <td className="px-3 py-2 text-slate-600">{active.length ? active.map(d => d.label).join(', ') : <span className="text-amber-700">None set</span>}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-900">{formatCurrency(active.reduce((s, d) => s + d.amount, 0))}</td>
            <td className="px-3 py-2">{r?.carry_negative ? 'Yes' : 'No'}</td>
            <td className="px-3 py-2 text-right"><button onClick={() => setEditing(t)} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]"><Pencil className="h-3 w-3" />Edit</button></td>
          </tr>) })}
        {trucks.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-slate-400">No active trucks.</td></tr>}
      </Table>
    </div>
  )
}

function DriversTab() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [rules, setRules] = useState<Record<number, DriverRules>>({})
  const [editing, setEditing] = useState<Driver | null>(null)
  const load = useCallback(async () => {
    try {
      const list = await driversApi.list(true)
      setDrivers(list)
      const all = await Promise.all(list.map(d => weeksApi.driverRules(d.id)))
      setRules(Object.fromEntries(all.map(r => [r.driver_id, r])))
    } catch (e) { toast.error((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])
  const describe = (r?: DriverRules) => !r ? '…' : r.pay_type === 'percent' ? `${r.pay_pct}% of gross` : r.pay_type === 'per_mile' ? `${formatCurrency(r.per_mile_rate)} per mile` : 'No driver pay (owner drives)'
  return (
    <div className="space-y-3">
      {editing && <RulesPanel truckId={null} driverId={editing.id} onSaved={() => { setEditing(null); load() }} onClose={() => setEditing(null)} />}
      <Table head={['Driver', 'Pay rule', 'Taken from pay', 'Amount', '']}>
        {drivers.map(d => { const r = rules[d.id]; const ded = r?.deductions.filter(x => x.is_active) || []; return (
          <tr key={d.id} className="hover:bg-blue-50/40">
            <td className="px-3 py-2 font-bold text-slate-900">{d.name}</td>
            <td className="px-3 py-2 text-slate-700">{describe(r)}</td>
            <td className="px-3 py-2 text-slate-600">{ded.length ? ded.map(x => x.label).join(', ') : '—'}</td>
            <td className="px-3 py-2 text-right tabular-nums">{ded.length ? formatCurrency(ded.reduce((s, x) => s + x.amount, 0)) : ''}</td>
            <td className="px-3 py-2 text-right"><button onClick={() => setEditing(d)} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]"><Pencil className="h-3 w-3" />Edit</button></td>
          </tr>) })}
        {drivers.length === 0 && <tr><td colSpan={5} className="py-12 text-center text-slate-400">No active drivers.</td></tr>}
      </Table>
    </div>
  )
}

function DispatchersTab() {
  const [rows, setRows] = useState<Array<Dispatcher & { commission_type: 'pct' | 'flat'; commission_value: number; dirty?: boolean }>>([])
  const load = useCallback(async () => {
    try {
      const list = await dispatchersApi.list(true)
      const rules = await Promise.all(list.map(d => officeApi.dispatcherRules(d.id)))
      setRows(list.map((d, i) => ({ ...d, commission_type: rules[i].commission_type, commission_value: rules[i].commission_value })))
    } catch (e) { toast.error((e as Error).message) }
  }, [])
  useEffect(() => { load() }, [load])
  const save = async (r: typeof rows[number]) => {
    try { await officeApi.saveDispatcherRules(r.id, { commission_type: r.commission_type, commission_value: r.commission_value }); toast.success(`${r.name} saved`); load() }
    catch (e) { toast.error((e as Error).message) }
  }
  const patch = (id: number, p: Partial<typeof rows[number]>) => setRows(rows.map(r => r.id === id ? { ...r, ...p, dirty: true } : r))
  return (
    <Table head={['Dispatcher', 'Commission', 'Value', '']}>
      {rows.map(r => (
        <tr key={r.id} className="hover:bg-blue-50/40">
          <td className="px-3 py-2 font-bold text-slate-900">{r.name}</td>
          <td className="px-3 py-2">
            <select value={r.commission_type} onChange={e => patch(r.id, { commission_type: e.target.value as 'pct' | 'flat' })} className={input}>
              <option value="pct">Percent of weekly gross</option>
              <option value="flat">Flat amount per week</option>
            </select>
          </td>
          <td className="px-3 py-2 text-right">
            <input value={r.commission_value} onChange={e => patch(r.id, { commission_value: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })} inputMode="decimal" className={`${input} w-24 text-right`} />
            <span className="ml-1 text-slate-400">{r.commission_type === 'pct' ? '%' : '$'}</span>
          </td>
          <td className="px-3 py-2 text-right">{r.dirty && <button onClick={() => save(r)} className="btn-primary h-7 rounded-md px-2.5 text-[0.6875rem]">Save</button>}</td>
        </tr>
      ))}
      {rows.length === 0 && <tr><td colSpan={4} className="py-12 text-center text-slate-400">No active dispatchers.</td></tr>}
    </Table>
  )
}


const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function CompanyTab() {
  const { user } = useAuth()
  const [c, setC] = useState<CompanyMe | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => { companyApi.me().then(setC).catch(e => toast.error(e.message)) }, [])
  const save = async () => {
    if (!c) return
    setSaving(true)
    try {
      const saved = await companyApi.update({ name: c.name, week_start_day: c.week_start_day })
      setC(saved)
      const stored = JSON.parse(localStorage.getItem('auth_user') || '{}'); localStorage.setItem('auth_user', JSON.stringify({ ...stored, company_name: saved.name }))
      toast.success('Company saved')
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }
  if (!c) return <div className="text-slate-400">{user?.company_id ? 'Loading…' : 'Sign in to a company to edit its settings.'}</div>
  return (
    <div className="max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="space-y-3 text-xs">
        <div><div className="mb-1 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">Company name</div>
          <input value={c.name} onChange={e => setC({ ...c, name: e.target.value })} className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" /></div>
        <div><div className="mb-1 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">Statement week starts on</div>
          <select value={c.week_start_day} onChange={e => setC({ ...c, week_start_day: Number(e.target.value) })} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs focus:border-blue-400 focus:outline-none">
            {DAYS.map((d, i) => <option key={d} value={i}>{d}{i === 5 ? ' (most carriers)' : ''}</option>)}
          </select>
          <p className="mt-1 text-slate-500">Loads and expenses are grouped into weeks from this day. Weeks already paid are not touched.</p></div>
      </div>
      <button onClick={save} disabled={saving} className="btn-primary mt-4 h-9 rounded-lg px-4 text-xs">{saving ? 'Saving…' : 'Save'}</button>
    </div>
  )
}
