import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { trucksApi } from '@/api/entities'
import { weeksApi, type TruckRules } from '@/api/weeks'
import { useEntities } from '@/hooks/useEntities'
import type { Truck } from '@/types'
import { formatCurrency } from '@/utils'
import PageShell, { EmptyRow, Pill, Th } from '@/components/ui/PageShell'
import Drawer, { DrawerTabs } from '@/components/ui/Drawer'
import { Field, Grid, Section, US_STATES, control, textarea } from '@/components/ui/Field'
import UnitDocuments, { DocsSummary } from '@/components/ui/UnitDocuments'
import RulesPanel from '@/components/weeks/RulesPanel'

const OWNERSHIP = ['Owned', 'Leased', 'Owner-operator']

export default function TrucksPage() {
  const entities = useEntities()
  const [rows, setRows] = useState<Truck[]>([])
  const [rules, setRules] = useState<Record<number, TruckRules>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const list = await trucksApi.list(showInactive ? undefined : true)
      if (id !== requestId.current) return
      setRows(list)
      const pairs = await Promise.all(list.map(t => weeksApi.truckRules(t.id).then(r => [t.id, r] as const).catch(() => null)))
      if (id !== requestId.current) return
      setRules(Object.fromEntries(pairs.filter(Boolean) as Array<readonly [number, TruckRules]>))
    } catch (e) { toast.error((e as Error).message) }
    finally { if (id === requestId.current) setLoading(false) }
  }, [showInactive])
  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(t => [t.unit_number, t.make, t.model, t.vin, t.plate, t.driver?.name].some(v => v?.toLowerCase().includes(q)))
  }, [rows, search])
  const open = useMemo(() => rows.find(r => r.id === openId) || null, [rows, openId])

  const remove = async (t: Truck) => {
    if (!confirm(`Delete truck ${t.unit_number}? Its loads and statements stay.`)) return
    try { await trucksApi.delete(t.id); toast.success('Truck deleted'); load() } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <PageShell
      title="Trucks" count={visible.length} subtitle="Every unit, its driver, and the fee and fixed deductions on its weekly statement"
      actions={<>
        <button onClick={load} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        <button onClick={() => setCreating(true)} className="btn-primary h-9 rounded-lg px-3.5 text-xs"><Plus className="h-4 w-4" />New truck</button>
      </>}
      toolbar={<>
        <div className="relative w-72 max-w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Unit, VIN, plate or driver…" className={`${control} pl-8`} />
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="h-3.5 w-3.5 accent-blue-600" />Show inactive
        </label>
      </>}
    >
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr className="border-b border-slate-200">
            <Th>Unit</Th><Th>Truck</Th><Th>Plate</Th><Th>Driver</Th><Th>Ownership</Th><Th align="right">Fee</Th><Th align="right">Fixed / week</Th><Th>Documents</Th><Th>Status</Th><Th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {loading && rows.length === 0 ? <tr><td colSpan={10} className="py-16 text-center text-slate-400">Loading trucks…</td></tr>
          : visible.length === 0 ? <EmptyRow colSpan={10} title={search ? 'No trucks match' : 'No trucks yet'} hint={search ? 'Try a unit number or a driver.' : 'Add the first truck to start a weekly statement.'} />
          : visible.map(t => {
            const r = rules[t.id]
            const fixed = r ? r.deductions.filter(d => d.is_active !== false).reduce((s, d) => s + Number(d.amount || 0), 0) : null
            return (
              <tr key={t.id} onClick={() => setOpenId(t.id)} className="cursor-pointer transition-colors hover:bg-blue-50/60">
                <td className="px-3 py-2.5 text-sm font-bold text-blue-700">{t.unit_number}</td>
                <td className="px-3 py-2.5">
                  <div className="text-slate-800">{[t.year, t.make, t.model].filter(Boolean).join(' ') || <span className="text-slate-300">—</span>}</div>
                  {t.vin && <div className="text-[0.6875rem] uppercase tracking-wide text-slate-400">{t.vin}</div>}
                </td>
                <td className="px-3 py-2.5 text-slate-700">{t.plate ? `${t.plate}${t.plate_state ? ` · ${t.plate_state}` : ''}` : <span className="text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-800">{t.driver?.name || <span className="font-normal text-slate-300">No driver</span>}</td>
                <td className="px-3 py-2.5 text-slate-700">{t.ownership || '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r ? `${r.fee_pct}%` : '—'}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{fixed == null ? '—' : formatCurrency(fixed)}</td>
                <td className="px-3 py-2.5"><DocsSummary docs={t.documents} /></td>
                <td className="px-3 py-2.5">{t.is_active ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Inactive</Pill>}</td>
                <td className="px-3 py-2.5 text-right">
                  <button onClick={e => { e.stopPropagation(); remove(t) }} aria-label={`Delete truck ${t.unit_number}`} className="text-slate-300 transition hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {open && <TruckDrawer truck={open} drivers={entities.drivers} onClose={() => setOpenId(null)} onSaved={load} />}
      {creating && (
        <Drawer title="New truck" subtitle="Fee and fixed deductions can be set after saving." onClose={() => setCreating(false)}>
          <TruckFields drivers={entities.drivers} onSaved={() => { setCreating(false); load() }} />
        </Drawer>
      )}
    </PageShell>
  )
}

// ── Drawer ────────────────────────────────────────────────────────────────────

type Tab = 'details' | 'rules' | 'documents'

function TruckDrawer({ truck, drivers, onClose, onSaved }: { truck: Truck; drivers: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<Tab>('details')
  const docs = truck.documents || []
  return (
    <Drawer
      title={`Truck ${truck.unit_number}`}
      subtitle={[[truck.year, truck.make, truck.model].filter(Boolean).join(' '), truck.driver?.name].filter(Boolean).join(' · ') || 'No driver assigned'}
      badge={truck.is_active ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Inactive</Pill>}
      tabs={<DrawerTabs value={tab} onChange={setTab} items={[{ key: 'details', label: 'Details' }, { key: 'rules', label: 'Statement rules' }, { key: 'documents', label: 'Documents', count: docs.length }]} />}
      onClose={onClose}
    >
      {tab === 'details' && <TruckFields truck={truck} drivers={drivers} onSaved={onSaved} />}
      {tab === 'rules' && <RulesPanel truckId={truck.id} driverId={truck.driver_id ?? null} onSaved={onSaved} onClose={() => setTab('details')} />}
      {tab === 'documents' && (
        <UnitDocuments docs={docs}
          onAdd={async p => { await trucksApi.addDocument(truck.id, p); toast.success('Document added'); onSaved() }}
          onRemove={async d => { if (!confirm(`Remove ${d.doc_type}?`)) return; await trucksApi.deleteDocument(truck.id, d.id); onSaved() }} />
      )}
    </Drawer>
  )
}

// ── Form ──────────────────────────────────────────────────────────────────────

type Form = { unit_number: string; year: string; make: string; model: string; vin: string; plate: string; plate_state: string; ownership: string; driver_id: string; eld_provider: string; eld_id: string; notes: string; is_active: boolean }

const fromTruck = (t?: Truck): Form => ({
  unit_number: t?.unit_number || '', year: t?.year ? String(t.year) : '', make: t?.make || '', model: t?.model || '', vin: t?.vin || '',
  plate: t?.plate || '', plate_state: t?.plate_state || '', ownership: t?.ownership || 'Owned', driver_id: t?.driver_id ? String(t.driver_id) : '',
  eld_provider: t?.eld_provider || '', eld_id: t?.eld_id || '', notes: t?.notes || '', is_active: t?.is_active ?? true,
})

function TruckFields({ truck, drivers, onSaved }: { truck?: Truck; drivers: { id: number; name: string }[]; onSaved: () => void }) {
  const [f, setF] = useState<Form>(() => fromTruck(truck))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setF(fromTruck(truck)) }, [truck])
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const dirty = JSON.stringify(f) !== JSON.stringify(fromTruck(truck))

  const save = async () => {
    if (!f.unit_number.trim()) return toast.error('Unit number is required')
    const payload: Record<string, unknown> = {
      unit_number: f.unit_number.trim(), year: f.year ? Number(f.year) : null, make: f.make || null, model: f.model || null, vin: f.vin || null,
      plate: f.plate || null, plate_state: f.plate_state || null, ownership: f.ownership, driver_id: f.driver_id ? Number(f.driver_id) : null,
      eld_provider: f.eld_provider || null, eld_id: f.eld_id || null, notes: f.notes || null, is_active: f.is_active,
    }
    setSaving(true)
    try {
      if (truck) { await trucksApi.update(truck.id, payload as Partial<Truck>); toast.success('Truck updated') }
      else { await trucksApi.create(payload as Partial<Truck>); toast.success('Truck added') }
      onSaved()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <Section title="Unit">
        <Grid cols={3}>
          <Field label="Unit number" required><input value={f.unit_number} onChange={set('unit_number')} className={control} placeholder="551" autoFocus={!truck} /></Field>
          <Field label="Ownership"><select value={f.ownership} onChange={set('ownership')} className={control}>{OWNERSHIP.map(o => <option key={o}>{o}</option>)}</select></Field>
          <Field label="Driver"><select value={f.driver_id} onChange={set('driver_id')} className={control}><option value="">No driver</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Year"><input inputMode="numeric" value={f.year} onChange={set('year')} className={control} placeholder="2022" /></Field>
          <Field label="Make"><input value={f.make} onChange={set('make')} className={control} placeholder="Freightliner" /></Field>
          <Field label="Model"><input value={f.model} onChange={set('model')} className={control} placeholder="Cascadia" /></Field>
          <Field label="VIN" span={3}><input value={f.vin} onChange={set('vin')} className={`${control} uppercase`} maxLength={17} /></Field>
          <Field label="Plate" span={2}><input value={f.plate} onChange={set('plate')} className={control} /></Field>
          <Field label="Plate state"><select value={f.plate_state} onChange={set('plate_state')} className={control}><option value="">—</option>{US_STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
        </Grid>
      </Section>
      <Section title="ELD and notes">
        <Grid cols={3}>
          <Field label="ELD provider"><input value={f.eld_provider} onChange={set('eld_provider')} className={control} placeholder="Motive, Samsara…" /></Field>
          <Field label="ELD ID" span={2}><input value={f.eld_id} onChange={set('eld_id')} className={control} /></Field>
          <Field label="Notes" span={3}><textarea value={f.notes} onChange={set('notes')} className={textarea} /></Field>
        </Grid>
      </Section>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} className="h-3.5 w-3.5 accent-blue-600" />Active truck
        </label>
        <button onClick={save} disabled={saving || (!!truck && !dirty)} className="btn-primary h-9 rounded-lg px-4 text-xs">{saving ? 'Saving…' : truck ? 'Save changes' : 'Add truck'}</button>
      </div>
    </div>
  )
}
