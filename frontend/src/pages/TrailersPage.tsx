import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { trailersApi } from '@/api/entities'
import { useEntities } from '@/hooks/useEntities'
import type { Trailer } from '@/types'
import PageShell, { EmptyRow, Pill, Th } from '@/components/ui/PageShell'
import Drawer, { DrawerTabs } from '@/components/ui/Drawer'
import { Field, Grid, Section, US_STATES, control, textarea } from '@/components/ui/Field'
import UnitDocuments, { DocsSummary } from '@/components/ui/UnitDocuments'

const TYPES = ['Dry van', 'Reefer', 'Flatbed', 'Step deck', 'Tanker', 'Other']
const OWNERSHIP = ['Owned', 'Leased', 'Rented', 'Owner-operator']

export default function TrailersPage() {
  const entities = useEntities()
  const [rows, setRows] = useState<Trailer[]>([])
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
      const list = await trailersApi.list(showInactive ? undefined : true)
      if (id === requestId.current) setRows(list)
    } catch (e) { toast.error((e as Error).message) }
    finally { if (id === requestId.current) setLoading(false) }
  }, [showInactive])
  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(t => [t.unit_number, t.trailer_type, t.make, t.vin, t.plate, t.driver?.name].some(v => v?.toLowerCase().includes(q)))
  }, [rows, search])
  const open = useMemo(() => rows.find(r => r.id === openId) || null, [rows, openId])

  const remove = async (t: Trailer) => {
    if (!confirm(`Delete trailer ${t.unit_number}?`)) return
    try { await trailersApi.delete(t.id); toast.success('Trailer deleted'); load() } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <PageShell
      title="Trailers" count={visible.length} subtitle="Units, who pulls them, and when registration and inspection run out"
      actions={<>
        <button onClick={load} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        <button onClick={() => setCreating(true)} className="btn-primary h-9 rounded-lg px-3.5 text-xs"><Plus className="h-4 w-4" />New trailer</button>
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
            <Th>Unit</Th><Th>Type</Th><Th>Trailer</Th><Th>Plate</Th><Th>Driver</Th><Th>Ownership</Th><Th>Documents</Th><Th>Status</Th><Th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {loading && rows.length === 0 ? <tr><td colSpan={9} className="py-16 text-center text-slate-400">Loading trailers…</td></tr>
          : visible.length === 0 ? <EmptyRow colSpan={9} title={search ? 'No trailers match' : 'No trailers yet'} hint={search ? 'Try a unit number.' : 'Add a trailer to assign it to a truck or a driver.'} />
          : visible.map(t => (
            <tr key={t.id} onClick={() => setOpenId(t.id)} className="cursor-pointer transition-colors hover:bg-blue-50/60">
              <td className="px-3 py-2.5 text-sm font-bold text-blue-700">{t.unit_number}</td>
              <td className="px-3 py-2.5 text-slate-700">{t.trailer_type || <span className="text-slate-300">—</span>}</td>
              <td className="px-3 py-2.5">
                <div className="text-slate-800">{[t.year, t.make, t.model].filter(Boolean).join(' ') || <span className="text-slate-300">—</span>}</div>
                {t.vin && <div className="text-[0.6875rem] uppercase tracking-wide text-slate-400">{t.vin}</div>}
              </td>
              <td className="px-3 py-2.5 text-slate-700">{t.plate ? `${t.plate}${t.plate_state ? ` · ${t.plate_state}` : ''}` : <span className="text-slate-300">—</span>}</td>
              <td className="px-3 py-2.5 font-semibold text-slate-800">{t.driver?.name || <span className="font-normal text-slate-300">Unassigned</span>}</td>
              <td className="px-3 py-2.5 text-slate-700">{t.ownership || '—'}</td>
              <td className="px-3 py-2.5"><DocsSummary docs={t.documents} /></td>
              <td className="px-3 py-2.5">{t.is_active ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Inactive</Pill>}</td>
              <td className="px-3 py-2.5 text-right">
                <button onClick={e => { e.stopPropagation(); remove(t) }} aria-label={`Delete trailer ${t.unit_number}`} className="text-slate-300 transition hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {open && <TrailerDrawer trailer={open} drivers={entities.drivers} onClose={() => setOpenId(null)} onSaved={load} />}
      {creating && (
        <Drawer title="New trailer" onClose={() => setCreating(false)}>
          <TrailerFields drivers={entities.drivers} onSaved={() => { setCreating(false); load() }} />
        </Drawer>
      )}
    </PageShell>
  )
}

type Tab = 'details' | 'documents'

function TrailerDrawer({ trailer, drivers, onClose, onSaved }: { trailer: Trailer; drivers: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<Tab>('details')
  const docs = trailer.documents || []
  return (
    <Drawer
      title={`Trailer ${trailer.unit_number}`}
      subtitle={[trailer.trailer_type, [trailer.year, trailer.make, trailer.model].filter(Boolean).join(' '), trailer.driver?.name].filter(Boolean).join(' · ') || 'Unassigned'}
      badge={trailer.is_active ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Inactive</Pill>}
      tabs={<DrawerTabs value={tab} onChange={setTab} items={[{ key: 'details', label: 'Details' }, { key: 'documents', label: 'Documents', count: docs.length }]} />}
      onClose={onClose}
    >
      {tab === 'details' && <TrailerFields trailer={trailer} drivers={drivers} onSaved={onSaved} />}
      {tab === 'documents' && (
        <UnitDocuments docs={docs}
          onAdd={async p => { await trailersApi.addDocument(trailer.id, p); toast.success('Document added'); onSaved() }}
          onRemove={async d => { if (!confirm(`Remove ${d.doc_type}?`)) return; await trailersApi.deleteDocument(trailer.id, d.id); onSaved() }} />
      )}
    </Drawer>
  )
}

type Form = { unit_number: string; trailer_type: string; year: string; make: string; model: string; vin: string; plate: string; plate_state: string; ownership: string; driver_id: string; notes: string; is_active: boolean }

const fromTrailer = (t?: Trailer): Form => ({
  unit_number: t?.unit_number || '', trailer_type: t?.trailer_type || 'Dry van', year: t?.year ? String(t.year) : '', make: t?.make || '', model: t?.model || '', vin: t?.vin || '',
  plate: t?.plate || '', plate_state: t?.plate_state || '', ownership: t?.ownership || 'Owned', driver_id: t?.driver_id ? String(t.driver_id) : '', notes: t?.notes || '', is_active: t?.is_active ?? true,
})

function TrailerFields({ trailer, drivers, onSaved }: { trailer?: Trailer; drivers: { id: number; name: string }[]; onSaved: () => void }) {
  const [f, setF] = useState<Form>(() => fromTrailer(trailer))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setF(fromTrailer(trailer)) }, [trailer])
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const dirty = JSON.stringify(f) !== JSON.stringify(fromTrailer(trailer))

  const save = async () => {
    if (!f.unit_number.trim()) return toast.error('Unit number is required')
    const payload: Record<string, unknown> = {
      unit_number: f.unit_number.trim(), trailer_type: f.trailer_type, year: f.year ? Number(f.year) : null, make: f.make || null, model: f.model || null, vin: f.vin || null,
      plate: f.plate || null, plate_state: f.plate_state || null, ownership: f.ownership, driver_id: f.driver_id ? Number(f.driver_id) : null, notes: f.notes || null, is_active: f.is_active,
    }
    setSaving(true)
    try {
      if (trailer) { await trailersApi.update(trailer.id, payload as Partial<Trailer>); toast.success('Trailer updated') }
      else { await trailersApi.create(payload as Partial<Trailer>); toast.success('Trailer added') }
      onSaved()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <Section title="Unit">
        <Grid cols={3}>
          <Field label="Unit number" required><input value={f.unit_number} onChange={set('unit_number')} className={control} placeholder="T-101" autoFocus={!trailer} /></Field>
          <Field label="Type"><select value={f.trailer_type} onChange={set('trailer_type')} className={control}>{TYPES.map(o => <option key={o}>{o}</option>)}</select></Field>
          <Field label="Ownership"><select value={f.ownership} onChange={set('ownership')} className={control}>{OWNERSHIP.map(o => <option key={o}>{o}</option>)}</select></Field>
          <Field label="Year"><input inputMode="numeric" value={f.year} onChange={set('year')} className={control} /></Field>
          <Field label="Make"><input value={f.make} onChange={set('make')} className={control} placeholder="Great Dane" /></Field>
          <Field label="Model"><input value={f.model} onChange={set('model')} className={control} /></Field>
          <Field label="VIN" span={3}><input value={f.vin} onChange={set('vin')} className={`${control} uppercase`} maxLength={17} /></Field>
          <Field label="Plate" span={2}><input value={f.plate} onChange={set('plate')} className={control} /></Field>
          <Field label="Plate state"><select value={f.plate_state} onChange={set('plate_state')} className={control}><option value="">—</option>{US_STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
        </Grid>
      </Section>
      <Section title="Assignment and notes">
        <Grid cols={3}>
          <Field label="Driver"><select value={f.driver_id} onChange={set('driver_id')} className={control}><option value="">Unassigned</option>{drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Notes" span={2}><textarea value={f.notes} onChange={set('notes')} className={textarea} /></Field>
        </Grid>
      </Section>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} className="h-3.5 w-3.5 accent-blue-600" />Active trailer
        </label>
        <button onClick={save} disabled={saving || (!!trailer && !dirty)} className="btn-primary h-9 rounded-lg px-4 text-xs">{saving ? 'Saving…' : trailer ? 'Save changes' : 'Add trailer'}</button>
      </div>
    </div>
  )
}
