import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { brokersApi } from '@/api/entities'
import type { Broker } from '@/types'
import PageShell, { EmptyRow, Pill, Th } from '@/components/ui/PageShell'
import Drawer from '@/components/ui/Drawer'
import { Field, Grid, Section, US_STATES, control, textarea } from '@/components/ui/Field'

type Kind = 'all' | 'brokers' | 'shippers'
const STATUS_TONE: Record<Broker['status'], 'green' | 'amber' | 'red'> = { Approved: 'green', Pending: 'amber', 'No buy': 'red' }

export default function BrokersPage() {
  const [rows, setRows] = useState<Broker[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<Kind>('all')
  const [showInactive, setShowInactive] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const requestId = useRef(0)

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const list = await brokersApi.list(showInactive ? {} : { is_active: true })
      if (id === requestId.current) setRows(list)
    } catch (e) { toast.error((e as Error).message) }
    finally { if (id === requestId.current) setLoading(false) }
  }, [showInactive])
  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(b => {
      if (kind === 'brokers' && !b.is_broker) return false
      if (kind === 'shippers' && !b.is_shipper_receiver) return false
      if (!q) return true
      return [b.name, b.mc_number, b.dot_number, b.city, b.phone, b.email].some(v => v?.toLowerCase().includes(q))
    })
  }, [rows, search, kind])
  const open = useMemo(() => rows.find(r => r.id === openId) || null, [rows, openId])

  const remove = async (b: Broker) => {
    if (!confirm(`Delete ${b.name}? Its loads stay.`)) return
    try { await brokersApi.delete(b.id); toast.success('Deleted'); load() } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <PageShell
      title="Brokers" count={visible.length} subtitle="Who you haul for, how they pay, and whether they are cleared to book"
      actions={<>
        <button onClick={load} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
        <button onClick={() => setCreating(true)} className="btn-primary h-9 rounded-lg px-3.5 text-xs"><Plus className="h-4 w-4" />New broker</button>
      </>}
      toolbar={<>
        <div className="relative w-72 max-w-full">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, MC, city…" className={`${control} pl-8`} />
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {([['all', 'All'], ['brokers', 'Brokers'], ['shippers', 'Shippers / receivers']] as Array<[Kind, string]>).map(([k, l]) => (
            <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={`rounded-md px-2.5 py-1 text-[0.6875rem] font-semibold transition ${kind === k ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{l}</button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="h-3.5 w-3.5 accent-blue-600" />Show inactive
        </label>
      </>}
    >
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-slate-50">
          <tr className="border-b border-slate-200">
            <Th>Name</Th><Th>MC / DOT</Th><Th>Contact</Th><Th>Location</Th><Th>Payment</Th><Th>Status</Th><Th />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {loading && rows.length === 0 ? <tr><td colSpan={7} className="py-16 text-center text-slate-400">Loading…</td></tr>
          : visible.length === 0 ? <EmptyRow colSpan={7} title={search || kind !== 'all' ? 'Nothing matches' : 'No brokers yet'} hint={search ? 'Try another name or MC number.' : 'Add a broker to book loads against.'} />
          : visible.map(b => (
            <tr key={b.id} onClick={() => setOpenId(b.id)} className="cursor-pointer transition-colors hover:bg-blue-50/60">
              <td className="px-3 py-2.5">
                <div className="font-semibold text-slate-900">{b.name}</div>
                <div className="text-[0.6875rem] text-slate-400">{[b.is_broker && 'Broker', b.is_shipper_receiver && 'Shipper / receiver'].filter(Boolean).join(' · ') || '—'}</div>
              </td>
              <td className="px-3 py-2.5 tabular-nums text-slate-700">{b.mc_number ? `MC ${b.mc_number}` : ''}{b.mc_number && b.dot_number ? ' · ' : ''}{b.dot_number ? `DOT ${b.dot_number}` : ''}{!b.mc_number && !b.dot_number && <span className="text-slate-300">—</span>}</td>
              <td className="px-3 py-2.5">
                <div className="text-slate-800">{b.phone || <span className="text-slate-300">—</span>}</div>
                {b.email && <div className="text-[0.6875rem] text-slate-500">{b.email}</div>}
              </td>
              <td className="px-3 py-2.5 text-slate-700">{[b.city, b.state].filter(Boolean).join(', ') || <span className="text-slate-300">—</span>}</td>
              <td className="px-3 py-2.5 text-slate-700">
                {b.factoring ? `Factoring${b.factoring_company ? ` · ${b.factoring_company}` : ''}` : b.pay_terms || 'Direct'}
                {b.avg_days_to_pay ? <span className="text-slate-400"> · {b.avg_days_to_pay}d avg</span> : null}
              </td>
              <td className="px-3 py-2.5"><Pill tone={b.is_active ? STATUS_TONE[b.status] || 'slate' : 'slate'}>{b.is_active ? b.status : 'Inactive'}</Pill></td>
              <td className="px-3 py-2.5 text-right">
                <button onClick={e => { e.stopPropagation(); remove(b) }} aria-label={`Delete ${b.name}`} className="text-slate-300 transition hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {open && (
        <Drawer title={open.name} subtitle={[open.mc_number && `MC ${open.mc_number}`, [open.city, open.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || undefined}
          badge={<Pill tone={STATUS_TONE[open.status] || 'slate'}>{open.status}</Pill>} onClose={() => setOpenId(null)}>
          <BrokerFields broker={open} onSaved={load} />
        </Drawer>
      )}
      {creating && (
        <Drawer title="New broker" onClose={() => setCreating(false)}>
          <BrokerFields onSaved={() => { setCreating(false); load() }} />
        </Drawer>
      )}
    </PageShell>
  )
}

type Form = { name: string; is_broker: boolean; is_shipper_receiver: boolean; mc_number: string; dot_number: string; fid_ein: string; phone: string; email: string; address: string; city: string; state: string; zip_code: string; status: Broker['status']; pay_terms: string; factoring: boolean; factoring_company: string; quickpay_fee: string; credit: string; avg_days_to_pay: string; notes: string; is_active: boolean }

const fromBroker = (b?: Broker): Form => ({
  name: b?.name || '', is_broker: b?.is_broker ?? true, is_shipper_receiver: b?.is_shipper_receiver ?? false,
  mc_number: b?.mc_number || '', dot_number: b?.dot_number || '', fid_ein: b?.fid_ein || '', phone: b?.phone || '', email: b?.email || '',
  address: b?.address || '', city: b?.city || '', state: b?.state || '', zip_code: b?.zip_code || '',
  status: b?.status || 'Pending', pay_terms: b?.pay_terms || '', factoring: b?.factoring ?? false, factoring_company: b?.factoring_company || '',
  quickpay_fee: b?.quickpay_fee != null ? String(b.quickpay_fee) : '', credit: b?.credit || '', avg_days_to_pay: b?.avg_days_to_pay != null ? String(b.avg_days_to_pay) : '',
  notes: b?.notes || '', is_active: b?.is_active ?? true,
})

function BrokerFields({ broker, onSaved }: { broker?: Broker; onSaved: () => void }) {
  const [f, setF] = useState<Form>(() => fromBroker(broker))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setF(fromBroker(broker)) }, [broker])
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  const check = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.checked })
  const dirty = JSON.stringify(f) !== JSON.stringify(fromBroker(broker))

  const save = async () => {
    if (!f.name.trim()) return toast.error('Name is required')
    if (!f.is_broker && !f.is_shipper_receiver) return toast.error('Pick at least one type')
    const payload: Record<string, unknown> = {
      name: f.name.trim(), is_broker: f.is_broker, is_shipper_receiver: f.is_shipper_receiver,
      mc_number: f.mc_number || null, dot_number: f.dot_number || null, fid_ein: f.fid_ein || null, phone: f.phone || null, email: f.email || null,
      address: f.address || null, city: f.city || null, state: f.state || null, zip_code: f.zip_code || null,
      status: f.status, pay_terms: f.pay_terms || null, factoring: f.factoring, factoring_company: f.factoring ? f.factoring_company || null : null,
      quickpay_fee: f.quickpay_fee ? Number(f.quickpay_fee) : null, credit: f.credit || null, avg_days_to_pay: f.avg_days_to_pay ? Number(f.avg_days_to_pay) : null,
      notes: f.notes || null, is_active: f.is_active,
    }
    setSaving(true)
    try {
      if (broker) { await brokersApi.update(broker.id, payload as Partial<Broker>); toast.success('Broker updated') }
      else { await brokersApi.create(payload as Partial<Broker> & { name: string }); toast.success('Broker added') }
      onSaved()
    } catch (e) { toast.error((e as Error).message) }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-3">
      <Section title="Company">
        <Grid cols={3}>
          <Field label="Name" required span={3}><input value={f.name} onChange={set('name')} className={control} autoFocus={!broker} /></Field>
          <Field label="MC number"><input value={f.mc_number} onChange={set('mc_number')} className={control} /></Field>
          <Field label="DOT number"><input value={f.dot_number} onChange={set('dot_number')} className={control} /></Field>
          <Field label="EIN"><input value={f.fid_ein} onChange={set('fid_ein')} className={control} /></Field>
          <div className="flex items-end gap-4 sm:col-span-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={f.is_broker} onChange={check('is_broker')} className="h-3.5 w-3.5 accent-blue-600" />Broker</label>
            <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={f.is_shipper_receiver} onChange={check('is_shipper_receiver')} className="h-3.5 w-3.5 accent-blue-600" />Shipper / receiver</label>
          </div>
        </Grid>
      </Section>
      <Section title="Contact">
        <Grid cols={3}>
          <Field label="Phone"><input value={f.phone} onChange={set('phone')} className={control} /></Field>
          <Field label="Email" span={2}><input type="email" value={f.email} onChange={set('email')} className={control} /></Field>
          <Field label="Street" span={3}><input value={f.address} onChange={set('address')} className={control} /></Field>
          <Field label="City"><input value={f.city} onChange={set('city')} className={control} /></Field>
          <Field label="State"><select value={f.state} onChange={set('state')} className={control}><option value="">—</option>{US_STATES.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="ZIP"><input value={f.zip_code} onChange={set('zip_code')} className={control} /></Field>
        </Grid>
      </Section>
      <Section title="Billing and credit" description="Status decides whether dispatch may book with them.">
        <Grid cols={3}>
          <Field label="Status"><select value={f.status} onChange={set('status')} className={control}><option>Pending</option><option>Approved</option><option>No buy</option></select></Field>
          <Field label="Pay terms"><input value={f.pay_terms} onChange={set('pay_terms')} className={control} placeholder="Net 30" /></Field>
          <Field label="Avg days to pay"><input inputMode="numeric" value={f.avg_days_to_pay} onChange={set('avg_days_to_pay')} className={control} /></Field>
          <div className="flex items-center sm:col-span-1">
            <label className="flex items-center gap-1.5 text-xs text-slate-700"><input type="checkbox" checked={f.factoring} onChange={check('factoring')} className="h-3.5 w-3.5 accent-blue-600" />Paid through factoring</label>
          </div>
          <Field label="Factoring company"><input value={f.factoring_company} onChange={set('factoring_company')} disabled={!f.factoring} className={control} /></Field>
          <Field label="Quick-pay fee %"><input inputMode="decimal" value={f.quickpay_fee} onChange={set('quickpay_fee')} className={control} /></Field>
          <Field label="Credit rating"><input value={f.credit} onChange={set('credit')} className={control} placeholder="A, B, C…" /></Field>
          <Field label="Notes" span={3}><textarea value={f.notes} onChange={set('notes')} className={textarea} /></Field>
        </Grid>
      </Section>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={f.is_active} onChange={check('is_active')} className="h-3.5 w-3.5 accent-blue-600" />Active</label>
        <button onClick={save} disabled={saving || (!!broker && !dirty)} className="btn-primary h-9 rounded-lg px-4 text-xs">{saving ? 'Saving…' : broker ? 'Save changes' : 'Add broker'}</button>
      </div>
    </div>
  )
}
