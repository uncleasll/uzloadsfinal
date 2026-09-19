import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Plus, RefreshCw, Search, Trash2, Upload } from 'lucide-react'
import toast from 'react-hot-toast'
import { driversExtApi } from '@/api/driversExt'
import { weeksApi, type DriverRules } from '@/api/weeks'
import { useEntities } from '@/hooks/useEntities'
import { formatDate } from '@/utils'
import PageShell, { EmptyRow, Pill, Th } from '@/components/ui/PageShell'
import Drawer, { DrawerTabs } from '@/components/ui/Drawer'
import { Field, Grid, Section, US_STATES, control, textarea } from '@/components/ui/Field'
import RulesPanel from '@/components/weeks/RulesPanel'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

interface Doc { id: number; doc_type: string; number?: string | null; state?: string | null; issue_date?: string | null; exp_date?: string | null; filename?: string | null; original_filename?: string | null; notes?: string | null }
interface Profile { hire_date?: string | null; address?: string; city?: string; state?: string; zip_code?: string; payable_to?: string; truck_id?: number | null; truck_unit?: string | null; trailer_id?: number | null; trailer_unit?: string | null; notes?: string }
interface DriverRow { id: number; name: string; phone?: string | null; email?: string | null; driver_type: string; is_active: boolean; profile: Profile | null; documents: Doc[] }

const DOC_TYPES: Array<[string, string]> = [['cdl', 'CDL'], ['medical_card', 'Medical card'], ['drug_test', 'Drug test'], ['mvr', 'MVR'], ['application', 'Application'], ['ssn_card', 'SSN card'], ['employment_verification', 'Employment verification'], ['other', 'Other']]
const docLabel = (t: string) => DOC_TYPES.find(([k]) => k === t)?.[1] || t
const typeLabel = (t: string) => (t === 'OO' ? 'Owner-operator' : 'Company driver')

/** Days until a document expires; negative when already expired, null when it has no date. */
function daysLeft(d?: string | null) {
  if (!d) return null
  return Math.round((new Date(d).getTime() - Date.now()) / 86_400_000)
}
function expiryTone(days: number | null): 'red' | 'amber' | 'green' | 'slate' {
  if (days == null) return 'slate'
  if (days < 0) return 'red'
  if (days <= 30) return 'amber'
  return 'green'
}
function payLabel(r?: DriverRules) {
  if (!r) return '—'
  if (r.pay_type === 'percent') return `${r.pay_pct}% of gross`
  if (r.pay_type === 'per_mile') return `$${r.per_mile_rate.toFixed(2)} / mile`
  return 'No pay (owner drives)'
}

export default function DriversPage() {
  const entities = useEntities()
  const [rows, setRows] = useState<DriverRow[]>([])
  const [rules, setRules] = useState<Record<number, DriverRules>>({})
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
      const res = await driversExtApi.list({ search: search.trim() || undefined, is_active: showInactive ? undefined : true, page_size: 200 })
      if (id !== requestId.current) return
      const items: DriverRow[] = res.items
      setRows(items)
      const pairs = await Promise.all(items.map(d => weeksApi.driverRules(d.id).then(r => [d.id, r] as const).catch(() => null)))
      if (id !== requestId.current) return
      setRules(Object.fromEntries(pairs.filter(Boolean) as Array<readonly [number, DriverRules]>))
    } catch (e) { toast.error((e as Error).message) }
    finally { if (id === requestId.current) setLoading(false) }
  }, [search, showInactive])

  useEffect(() => { const t = setTimeout(load, search ? 300 : 0); return () => clearTimeout(t) }, [load, search])

  const open = useMemo(() => rows.find(r => r.id === openId) || null, [rows, openId])
  const truckOf = (driverId: number) => entities.trucks.find(t => t.driver_id === driverId)?.unit_number

  return (
    <PageShell
      title="Drivers" count={rows.length} subtitle="Who drives, how they are paid, and whether their papers are in order"
      actions={<>
        <button onClick={load} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        <button onClick={() => setCreating(true)} className="btn-primary h-9 rounded-lg px-3.5 text-xs"><Plus className="h-4 w-4" />New driver</button>
      </>}
      toolbar={<>
        <div className="relative w-72 max-w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drivers…" className={`${control} pl-8`} />
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="h-3.5 w-3.5 accent-blue-600" />Show inactive
        </label>
      </>}
    >
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr className="border-b border-slate-200">
            <Th>Driver</Th><Th>Type</Th><Th>Truck</Th><Th>Pay</Th><Th>Documents</Th><Th>Status</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {loading && rows.length === 0 ? <tr><td colSpan={6} className="py-16 text-center text-slate-400">Loading drivers…</td></tr>
          : rows.length === 0 ? <EmptyRow colSpan={6} title={search ? 'No drivers match' : 'No drivers yet'} hint={search ? 'Try a different name.' : 'Add the first driver to assign loads.'} />
          : rows.map(d => {
            const soon = d.documents.filter(x => { const n = daysLeft(x.exp_date); return n != null && n <= 30 })
            return (
              <tr key={d.id} onClick={() => setOpenId(d.id)} className="cursor-pointer transition-colors hover:bg-blue-50/60">
                <td className="px-3 py-2.5">
                  <div className="font-semibold text-slate-900">{d.name}</div>
                  <div className="text-[0.6875rem] text-slate-500">{d.phone || d.email || <span className="text-slate-300">No contact</span>}</div>
                </td>
                <td className="px-3 py-2.5 text-slate-700">{typeLabel(d.driver_type)}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-800">{truckOf(d.id) || <span className="font-normal text-slate-300">—</span>}</td>
                <td className="px-3 py-2.5 text-slate-700">{payLabel(rules[d.id])}</td>
                <td className="px-3 py-2.5">
                  {d.documents.length === 0 ? <span className="text-slate-300">None</span>
                    : soon.length === 0 ? <Pill tone="green">{d.documents.length} on file</Pill>
                    : <Pill tone={soon.some(x => (daysLeft(x.exp_date) ?? 0) < 0) ? 'red' : 'amber'}>{docLabel(soon[0].doc_type)} {(daysLeft(soon[0].exp_date) ?? 0) < 0 ? 'expired' : `in ${daysLeft(soon[0].exp_date)}d`}</Pill>}
                </td>
                <td className="px-3 py-2.5">{d.is_active ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Inactive</Pill>}</td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {open && <DriverDrawer driver={open} truckUnit={truckOf(open.id)} onClose={() => setOpenId(null)} onSaved={load} />}
      {creating && (
        <Drawer title="New driver" subtitle="Pay rules and documents can be added after saving." onClose={() => setCreating(false)}>
          <DriverFields onSaved={() => { setCreating(false); load() }} />
        </Drawer>
      )}
    </PageShell>
  )
}

// ── Drawer ────────────────────────────────────────────────────────────────────

type Tab = 'details' | 'pay' | 'documents'

function DriverDrawer({ driver, truckUnit, onClose, onSaved }: { driver: DriverRow; truckUnit?: string; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<Tab>('details')
  return (
    <Drawer
      title={driver.name}
      subtitle={`${typeLabel(driver.driver_type)}${truckUnit ? ` · Truck ${truckUnit}` : ' · No truck'}${driver.phone ? ` · ${driver.phone}` : ''}`}
      badge={driver.is_active ? <Pill tone="green">Active</Pill> : <Pill tone="slate">Inactive</Pill>}
      tabs={<DrawerTabs value={tab} onChange={setTab} items={[{ key: 'details', label: 'Details' }, { key: 'pay', label: 'Pay' }, { key: 'documents', label: 'Documents', count: driver.documents.length }]} />}
      onClose={onClose}
    >
      {tab === 'details' && <DriverFields driver={driver} onSaved={onSaved} />}
      {tab === 'pay' && <RulesPanel truckId={null} driverId={driver.id} onSaved={onSaved} onClose={() => setTab('details')} />}
      {tab === 'documents' && <Documents driver={driver} onChanged={onSaved} />}
    </Drawer>
  )
}

// ── Form (create + edit share it) ─────────────────────────────────────────────

type Form = { name: string; phone: string; email: string; driver_type: string; hire_date: string; address: string; city: string; state: string; zip_code: string; payable_to: string; notes: string; is_active: boolean }

function fromDriver(d?: DriverRow): Form {
  const p = d?.profile
  return {
    name: d?.name || '', phone: d?.phone || '', email: d?.email || '', driver_type: d?.driver_type || 'Drv',
    hire_date: p?.hire_date || '',
    address: p?.address || '', city: p?.city || '', state: p?.state || '', zip_code: p?.zip_code || '', payable_to: p?.payable_to || '', notes: p?.notes || '',
    is_active: d?.is_active ?? true,
  }
}

function toPayload(f: Form) {
  return {
    name: f.name.trim(), phone: f.phone || null, email: f.email || null, driver_type: f.driver_type, is_active: f.is_active,
    hire_date: f.hire_date || null,
    address: f.address, city: f.city, state: f.state, zip_code: f.zip_code, payable_to: f.payable_to || f.name.trim(), notes: f.notes,
    driver_status: 'Active',
  }
}

function DriverFields({ driver, onSaved }: { driver?: DriverRow; onSaved: () => void }) {
  const [f, setF] = useState<Form>(() => fromDriver(driver))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setF(fromDriver(driver)) }, [driver])
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const dirty = JSON.stringify(f) !== JSON.stringify(fromDriver(driver))

  const save = async () => {
    if (!f.name.trim()) return toast.error('Name is required')
    setSaving(true)
    try {
      if (driver) { await driversExtApi.update(driver.id, toPayload(f)); toast.success('Driver updated') }
      else { await driversExtApi.create(toPayload(f)); toast.success('Driver added') }
      onSaved()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <Section title="Driver">
        <Grid cols={3}>
          <Field label="Full name" required span={2}><input value={f.name} onChange={set('name')} className={control} placeholder="First Last" autoFocus={!driver} /></Field>
          <Field label="Type"><select value={f.driver_type} onChange={set('driver_type')} className={control}><option value="Drv">Company driver</option><option value="OO">Owner-operator</option></select></Field>
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} className={control} placeholder="(555) 555-5555" /></Field>
          <Field label="Email" span={2}><input type="email" value={f.email} onChange={set('email')} className={control} /></Field>
        </Grid>
      </Section>
      <Section title="Employment" description="Which truck this driver runs is set on the Trucks page; the truck decides the weekly statement.">
        <Grid cols={3}>
          <Field label="Hire date"><input type="date" value={f.hire_date} onChange={set('hire_date')} className={control} /></Field>
        </Grid>
      </Section>
      <Section title="Address and payee">
        <Grid cols={3}>
          <Field label="Street" span={3}><input value={f.address} onChange={set('address')} className={control} /></Field>
          <Field label="City"><input value={f.city} onChange={set('city')} className={control} /></Field>
          <Field label="State"><select value={f.state} onChange={set('state')} className={control}><option value="">—</option>{US_STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="ZIP"><input value={f.zip_code} onChange={set('zip_code')} className={control} /></Field>
          <Field label="Payable to" span={3} hint="Name on the ACH or check. Defaults to the driver's name."><input value={f.payable_to} onChange={set('payable_to')} className={control} placeholder={f.name || 'Driver name'} /></Field>
          <Field label="Notes" span={3}><textarea value={f.notes} onChange={set('notes')} className={textarea} /></Field>
        </Grid>
      </Section>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={f.is_active} onChange={e => setF({ ...f, is_active: e.target.checked })} className="h-3.5 w-3.5 accent-blue-600" />Active driver
        </label>
        <button onClick={save} disabled={saving || (!!driver && !dirty)} className="btn-primary h-9 rounded-lg px-4 text-xs">{saving ? 'Saving…' : driver ? 'Save changes' : 'Add driver'}</button>
      </div>
    </div>
  )
}

// ── Documents ─────────────────────────────────────────────────────────────────

function Documents({ driver, onChanged }: { driver: DriverRow; onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ doc_type: 'cdl', number: '', state: '', issue_date: '', exp_date: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  const add = async () => {
    setBusy(true)
    try {
      const doc = await driversExtApi.addDocument(driver.id, { doc_type: form.doc_type, number: form.number || undefined, state: form.state || undefined, issue_date: form.issue_date || undefined, exp_date: form.exp_date || undefined })
      if (file) await driversExtApi.uploadDocFile(driver.id, doc.id, file)
      toast.success('Document added')
      setAdding(false); setFile(null); setForm({ doc_type: 'cdl', number: '', state: '', issue_date: '', exp_date: '' })
      onChanged()
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  const upload = async (doc: Doc, f: File) => {
    try { await driversExtApi.uploadDocFile(driver.id, doc.id, f); toast.success('File uploaded'); onChanged() }
    catch (e) { toast.error((e as Error).message) }
  }
  const remove = async (doc: Doc) => {
    if (!confirm(`Remove ${docLabel(doc.doc_type)}?`)) return
    try { await driversExtApi.deleteDocument(driver.id, doc.id); onChanged() } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <Section title="Documents" description="CDL, medical card and the rest. Expiring ones are flagged on the list."
        action={!adding && <button onClick={() => setAdding(true)} className="btn-secondary h-8 rounded-lg px-2.5 text-xs"><Plus className="h-3.5 w-3.5" />Add</button>}>
        {adding && (
          <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
            <Grid cols={3}>
              <Field label="Type"><select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })} className={control}>{DOC_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Number"><input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} className={control} /></Field>
              <Field label="State"><select value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} className={control}><option value="">—</option>{US_STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
              <Field label="Issued"><input type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} className={control} /></Field>
              <Field label="Expires"><input type="date" value={form.exp_date} onChange={e => setForm({ ...form, exp_date: e.target.value })} className={control} /></Field>
              <Field label="File"><input type="file" onChange={e => setFile(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1.5 file:text-xs file:font-semibold file:text-slate-700" /></Field>
            </Grid>
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setAdding(false)} className="btn-ghost h-8 rounded-lg px-3 text-xs">Cancel</button>
              <button onClick={add} disabled={busy} className="btn-primary h-8 rounded-lg px-3 text-xs">{busy ? 'Saving…' : 'Save document'}</button>
            </div>
          </div>
        )}
        {driver.documents.length === 0 ? <p className="py-6 text-center text-slate-400">No documents yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {driver.documents.map(doc => {
              const days = daysLeft(doc.exp_date)
              return (
                <li key={doc.id} className="flex items-center gap-3 py-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{docLabel(doc.doc_type)}{doc.number && <span className="ml-1.5 font-normal text-slate-500">#{doc.number}{doc.state ? ` · ${doc.state}` : ''}</span>}</div>
                    <div className="text-[0.6875rem] text-slate-500">
                      {doc.exp_date ? `Expires ${formatDate(doc.exp_date)}` : 'No expiry'}
                      {doc.filename && <> · <a href={`${API_BASE}/uploads/${doc.filename}`} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 hover:underline">{doc.original_filename || 'Open file'}</a></>}
                    </div>
                  </div>
                  {days != null && <Pill tone={expiryTone(days)}>{days < 0 ? 'Expired' : days <= 30 ? `${days}d left` : 'Valid'}</Pill>}
                  <label className="cursor-pointer text-slate-400 hover:text-blue-700" title="Upload file"><Upload className="h-3.5 w-3.5" /><input type="file" className="hidden" onChange={e => e.target.files?.[0] && upload(doc, e.target.files[0])} /></label>
                  <button onClick={() => remove(doc)} aria-label="Remove document" className="text-slate-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              )
            })}
          </ul>
        )}
      </Section>
    </div>
  )
}
