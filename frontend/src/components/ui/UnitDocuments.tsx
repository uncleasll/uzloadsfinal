import { useState } from 'react'
import { FileText, Plus, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatDate } from '@/utils'
import { Field, Grid, Section, control } from '@/components/ui/Field'
import { Pill } from '@/components/ui/PageShell'

export interface UnitDoc { id: number; doc_type: string; name?: string; issue_date?: string; exp_date?: string; notes?: string }

export const UNIT_DOC_TYPES = ['Registration', 'Insurance', 'Annual inspection', 'IFTA', 'Title', 'Lease agreement', 'Other']

export function daysLeft(d?: string | null) {
  if (!d) return null
  return Math.round((new Date(d).getTime() - Date.now()) / 86_400_000)
}
export function expiryTone(days: number | null): 'red' | 'amber' | 'green' | 'slate' {
  if (days == null) return 'slate'
  if (days < 0) return 'red'
  if (days <= 30) return 'amber'
  return 'green'
}

/** Registration, insurance and inspection records for a truck or trailer. Dates only, no files. */
export default function UnitDocuments({ docs, onAdd, onRemove }: {
  docs: UnitDoc[]
  onAdd: (payload: { doc_type: string; issue_date?: string; exp_date?: string; notes?: string }) => Promise<void>
  onRemove: (doc: UnitDoc) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ doc_type: 'Registration', issue_date: '', exp_date: '', notes: '' })
  const [busy, setBusy] = useState(false)

  const add = async () => {
    setBusy(true)
    try {
      await onAdd({ doc_type: form.doc_type, issue_date: form.issue_date || undefined, exp_date: form.exp_date || undefined, notes: form.notes || undefined })
      setAdding(false); setForm({ doc_type: 'Registration', issue_date: '', exp_date: '', notes: '' })
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <Section title="Documents" description="Registration, insurance and inspections. Expiring ones are flagged on the list."
      action={!adding && <button onClick={() => setAdding(true)} className="btn-secondary h-8 rounded-lg px-2.5 text-xs"><Plus className="h-3.5 w-3.5" />Add</button>}>
      {adding && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
          <Grid cols={3}>
            <Field label="Type"><select value={form.doc_type} onChange={e => setForm({ ...form, doc_type: e.target.value })} className={control}>{UNIT_DOC_TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Issued"><input type="date" value={form.issue_date} onChange={e => setForm({ ...form, issue_date: e.target.value })} className={control} /></Field>
            <Field label="Expires"><input type="date" value={form.exp_date} onChange={e => setForm({ ...form, exp_date: e.target.value })} className={control} /></Field>
            <Field label="Notes" span={3}><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={control} placeholder="Policy number, provider…" /></Field>
          </Grid>
          <div className="mt-3 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="btn-ghost h-8 rounded-lg px-3 text-xs">Cancel</button>
            <button onClick={add} disabled={busy} className="btn-primary h-8 rounded-lg px-3 text-xs">{busy ? 'Saving…' : 'Save document'}</button>
          </div>
        </div>
      )}
      {docs.length === 0 ? <p className="py-6 text-center text-slate-400">No documents yet.</p> : (
        <ul className="divide-y divide-slate-100">
          {docs.map(doc => {
            const days = daysLeft(doc.exp_date)
            return (
              <li key={doc.id} className="flex items-center gap-3 py-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-900">{doc.doc_type}{doc.notes && <span className="ml-1.5 font-normal text-slate-500">{doc.notes}</span>}</div>
                  <div className="text-[0.6875rem] text-slate-500">{doc.exp_date ? `Expires ${formatDate(doc.exp_date)}` : 'No expiry'}{doc.issue_date ? ` · issued ${formatDate(doc.issue_date)}` : ''}</div>
                </div>
                {days != null && <Pill tone={expiryTone(days)}>{days < 0 ? 'Expired' : days <= 30 ? `${days}d left` : 'Valid'}</Pill>}
                <button onClick={() => onRemove(doc).catch(e => toast.error((e as Error).message))} aria-label="Remove document" className="text-slate-300 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

/** One pill summarising a unit's documents for the list view. */
export function DocsSummary({ docs }: { docs?: UnitDoc[] }) {
  if (!docs || docs.length === 0) return <span className="text-slate-300">None</span>
  const soon = docs.filter(d => { const n = daysLeft(d.exp_date); return n != null && n <= 30 }).sort((a, b) => (daysLeft(a.exp_date) ?? 0) - (daysLeft(b.exp_date) ?? 0))
  if (soon.length === 0) return <Pill tone="green">{docs.length} on file</Pill>
  const n = daysLeft(soon[0].exp_date) ?? 0
  return <Pill tone={n < 0 ? 'red' : 'amber'}>{soon[0].doc_type} {n < 0 ? 'expired' : `in ${n}d`}</Pill>
}
