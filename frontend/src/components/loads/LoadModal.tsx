import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, FileText, Plus, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { loadsApi, loadsApiExtended, type Invoice } from '@/api/loads'
import type { Load } from '@/types'
import { formatCurrency, formatDate, formatDateTime, STATUS_COLORS, BILLING_COLORS } from '@/utils'
import type { useEntities } from '@/hooks/useEntities'
import DocumentCenter from './DocumentCenter'
import LoadForm from './LoadForm'
import { documentUploadFields } from './documents'

type Tab = 'overview' | 'documents' | 'money' | 'history'
type Entities = ReturnType<typeof useEntities>

interface Props {
  loadId: number
  initialTab?: Tab
  onClose: () => void
  onSaved: () => void
  entities: Entities
}

const TABS: Array<[Tab, string]> = [['overview', 'Details'], ['documents', 'Documents'], ['history', 'Activity']]
const field = 'h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'

/**
 * Read-only view of one load. Everything is edited in one place: the Edit button opens LoadForm.
 * Documents, accessorials, notes and the invoice are actions, not fields, so they live here.
 */
export default function LoadModal({ loadId, onClose, onSaved, entities, initialTab = 'overview' }: Props) {
  const [load, setLoad] = useState<Load | null>(null)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>(initialTab === 'money' ? 'overview' : initialTab)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)

  const refetch = useCallback(async () => {
    try {
      const [l, inv] = await Promise.all([loadsApi.get(loadId), loadsApi.getInvoiceByLoad(loadId).catch(() => null)])
      setLoad(l); setInvoice(inv)
    } catch (e) { toast.error((e as Error).message) }
  }, [loadId])

  useEffect(() => { setLoading(true); refetch().finally(() => setLoading(false)) }, [refetch])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !editing) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true)
    try { await fn(); await refetch(); onSaved(); if (done) toast.success(done) }
    catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }

  const pickup = load?.stops.find(s => s.stop_type === 'pickup')
  const delivery = load?.stops.find(s => s.stop_type === 'delivery')
  const place = (s?: typeof pickup) => (s ? [s.city, s.state].filter(Boolean).join(', ') || '—' : '—')
  const accessorials = (load?.services || []).reduce((sum, s) => sum + (s.add_deduct === 'Add' ? 1 : -1) * (s.invoice_amount || 0), 0)
  const invoiceTotal = (load?.rate || 0) + accessorials

  return (
    <>
      <div className="drawer-overlay" onClick={() => !editing && onClose()} />
      <div className="drawer-panel" style={{ maxWidth: 880 }}>
        <header className="flex flex-shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <h2 className="whitespace-nowrap text-sm font-bold text-slate-900">Load #{load?.po_number || load?.load_number || ''}</h2>
            {load && <span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold ${STATUS_COLORS[load.status] || 'bg-slate-100 text-slate-500'}`}>{load.status}</span>}
            {load && <span className="hidden min-w-0 items-center gap-1.5 truncate text-xs text-slate-500 sm:flex">
              <span className="truncate">{place(pickup)}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300" /><span className="truncate">{place(delivery)}</span>
            </span>}
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {load && <button onClick={() => setEditing(true)} className="btn-primary h-8 rounded-lg px-3 text-xs">Edit load</button>}
            <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <nav className="flex flex-shrink-0 gap-1 border-b border-slate-200 px-4" aria-label="Load sections">
          {TABS.map(([key, name]) => (
            <button key={key} onClick={() => setTab(key)} aria-pressed={tab === key}
              className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition ${tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
              {name}{key === 'documents' && load ? ` ${load.documents.length}` : ''}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 p-4">
          {loading || !load ? <div className="py-16 text-center text-xs text-slate-400">Loading…</div> : tab === 'documents' ? (
            <DocumentCenter loadId={loadId} documents={load.documents} uploading={busy}
              onUpload={async (kind, file) => { const f = documentUploadFields(kind); await run(() => loadsApi.uploadDocument(loadId, file, f.type, f.notes), `${kind} uploaded`) }}
              onDelete={id => { if (confirm('Delete this document?')) run(() => loadsApi.deleteDocument(loadId, id), 'Document deleted') }} />
          ) : tab === 'history' ? (
            <Card title="Activity">
              {load.history.length === 0 ? <Empty text="Nothing has happened to this load yet." /> : (
                <ul className="divide-y divide-slate-100">
                  {load.history.map(h => (
                    <li key={h.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs">
                      <span className="text-slate-700">{h.description}</span>
                      <span className="shrink-0 text-[0.6875rem] text-slate-400">{formatDateTime(h.created_at)}{h.author ? ` · ${h.author}` : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Route */}
              <Card title="Route">
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {([['Pickup', pickup], ['Delivery', delivery]] as const).map(([name, s]) => (
                    <div key={name} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{name}</div>
                      <div className="mt-1 text-sm font-bold text-slate-900">{place(s)}</div>
                      {s?.title && <div className="text-xs text-slate-600">{s.title}</div>}
                      {s?.address && <div className="text-[0.6875rem] text-slate-500">{s.address}{s.zip_code ? `, ${s.zip_code}` : ''}</div>}
                      <div className="mt-1 text-xs font-semibold text-slate-700">{formatDate(s?.stop_date)}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Facts */}
              <Card title="Load">
                <dl className="grid gap-x-6 gap-y-2.5 p-4 sm:grid-cols-2">
                  <Fact label="Broker" value={load.broker?.name} />
                  <Fact label="Broker load / PO #" value={load.po_number} />
                  <Fact label="Driver" value={load.driver?.name} />
                  <Fact label="Truck / trailer" value={[load.truck?.unit_number, load.trailer?.unit_number].filter(Boolean).join(' / ')} />
                  <Fact label="Dispatcher" value={load.dispatcher?.name} />
                  <Fact label="Billing" value={<span className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold ${BILLING_COLORS[load.billing_status] || 'bg-slate-100 text-slate-500'}`}>{load.billing_status}</span>} />
                  <Fact label="Rate" value={<span className="font-bold text-slate-900">{formatCurrency(load.rate)}</span>} />
                  <Fact label="Miles" value={load.total_miles ? `${load.total_miles.toLocaleString()} total · ${load.loaded_miles || 0} loaded · ${load.empty_miles || 0} deadhead` : undefined} />
                  <Fact label="Rate per mile" value={load.total_miles ? formatCurrency(load.rate / load.total_miles) : undefined} />
                </dl>
                {load.notes && <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-600"><span className="font-semibold text-slate-500">Notes: </span>{load.notes}</div>}
              </Card>

              {/* Money */}
              <Card title="Invoice" actions={
                invoice
                  ? <div className="flex items-center gap-2">
                      <a href={loadsApi.getInvoiceRecordPdfUrl(invoice.id)} target="_blank" rel="noreferrer" className="btn-secondary h-8 rounded-lg px-3 text-[0.6875rem]"><FileText className="h-3.5 w-3.5" />PDF</a>
                      {invoice.status.toLowerCase() !== 'paid' && <button disabled={busy} onClick={() => run(() => loadsApi.markInvoicePaid(invoice.id), 'Invoice marked paid')} className="btn-primary h-8 rounded-lg px-3 text-[0.6875rem]">Mark paid</button>}
                    </div>
                  : <button disabled={busy} onClick={() => run(() => loadsApi.createInvoiceFromLoad(loadId), 'Invoice created')} className="btn-primary h-8 rounded-lg px-3 text-[0.6875rem]">Create invoice</button>
              }>
                <div className="space-y-1.5 px-4 py-3 text-xs">
                  <Line label="Rate" value={formatCurrency(load.rate)} />
                  {load.services.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-slate-700">
                      <span className="min-w-0 truncate">{s.service_type}{s.notes ? ` · ${s.notes}` : ''}{s.drivers_payable ? ` · driver ${formatCurrency(s.drivers_payable)}` : ''}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular-nums">{s.add_deduct === 'Add' ? '' : '−'}{formatCurrency(s.invoice_amount || 0)}</span>
                        <button onClick={() => confirm('Remove this accessorial?') && run(() => loadsApi.deleteService(loadId, s.id), 'Removed')} className="text-slate-300 hover:text-red-600" aria-label="Remove"><Trash2 className="h-3.5 w-3.5" /></button>
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                    <span>Invoice total</span><span className="tabular-nums">{formatCurrency(invoiceTotal)}</span>
                  </div>
                  {invoice && <div className="text-[0.6875rem] text-slate-500">Invoice #{invoice.invoice_number} · {invoice.status}{invoice.due_date ? ` · due ${formatDate(invoice.due_date)}` : ''}</div>}
                  <AddAccessorial busy={busy} onAdd={(payload) => run(() => loadsApi.addService(loadId, payload), 'Accessorial added')} />
                </div>
              </Card>

              {/* Notes */}
              <Card title="Notes">
                {load.notes_list.length > 0 && (
                  <ul className="divide-y divide-slate-100">
                    {load.notes_list.map(n => (
                      <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-xs">
                        <span className="text-slate-700">{n.content}</span>
                        <span className="flex shrink-0 items-center gap-2 text-[0.6875rem] text-slate-400">
                          {formatDateTime(n.created_at)}
                          <button onClick={() => confirm('Delete this note?') && run(() => loadsApiExtended.deleteNote(loadId, n.id), 'Note deleted')} className="text-slate-300 hover:text-red-600" aria-label="Delete note"><Trash2 className="h-3.5 w-3.5" /></button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <AddNote busy={busy} onAdd={text => run(() => loadsApi.addNote(loadId, text, 'Office'), 'Note added')} />
              </Card>
            </div>
          )}
        </div>

        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-2.5 text-xs">
          <span className="text-slate-500">Invoice total <span className="font-bold text-slate-900">{formatCurrency(invoiceTotal)}</span></span>
          {load?.truck?.id && (load.statement_week || load.load_date) && (
            <Link to={`/weeks/${load.statement_week || load.load_date}/trucks/${load.truck.id}`} onClick={onClose}
              className="btn-secondary h-8 rounded-lg px-3 text-[0.6875rem]">Open this week<ArrowRight className="h-3.5 w-3.5" /></Link>
          )}
        </footer>
      </div>

      {editing && load && <LoadForm load={load} entities={entities} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); await refetch(); onSaved() }} />}
    </>
  )
}

function Card({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <h3 className="text-xs font-bold text-slate-900">{title}</h3>
        {actions}
      </header>
      {children}
    </section>
  )
}

function Fact({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-slate-800">{value || <span className="text-slate-300">—</span>}</dd>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-slate-700"><span>{label}</span><span className="tabular-nums">{value}</span></div>
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-8 text-center text-xs text-slate-400">{text}</div>
}

function AddAccessorial({ busy, onAdd }: { busy: boolean; onAdd: (p: { service_type: 'Lumper' | 'Detention' | 'Other'; add_deduct: string; invoice_amount: number; drivers_payable: number; notes?: string }) => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ service_type: 'Lumper' as 'Lumper' | 'Detention' | 'Other', add_deduct: 'Add', invoice_amount: '', drivers_payable: '', notes: '' })
  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 pt-1 text-[0.6875rem] font-semibold text-blue-700 hover:underline"><Plus className="h-3 w-3" />Add lumper, detention or other</button>
  return (
    <div className="mt-1 grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-50/70 p-2 sm:grid-cols-5">
      <select value={f.service_type} onChange={e => setF({ ...f, service_type: e.target.value as typeof f.service_type })} className={field}><option>Lumper</option><option>Detention</option><option>Other</option></select>
      <select value={f.add_deduct} onChange={e => setF({ ...f, add_deduct: e.target.value })} className={field}><option value="Add">Add to invoice</option><option value="Deduct">Deduct</option></select>
      <input value={f.invoice_amount} onChange={e => setF({ ...f, invoice_amount: e.target.value.replace(/[^\d.]/g, '') })} placeholder="Invoice $" inputMode="decimal" className={`${field} text-right`} />
      <input value={f.drivers_payable} onChange={e => setF({ ...f, drivers_payable: e.target.value.replace(/[^\d.]/g, '') })} placeholder="Driver $" inputMode="decimal" className={`${field} text-right`} />
      <div className="flex gap-1.5">
        <button disabled={busy || !f.invoice_amount} onClick={() => { onAdd({ ...f, invoice_amount: Number(f.invoice_amount) || 0, drivers_payable: Number(f.drivers_payable) || 0, notes: f.notes || undefined }); setOpen(false); setF({ ...f, invoice_amount: '', drivers_payable: '', notes: '' }) }} className="btn-primary h-8 flex-1 rounded-md px-2 text-[0.6875rem]">Add</button>
        <button onClick={() => setOpen(false)} className="btn-secondary h-8 rounded-md px-2 text-[0.6875rem]">Cancel</button>
      </div>
    </div>
  )
}

function AddNote({ busy, onAdd }: { busy: boolean; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')
  return (
    <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5">
      <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onAdd(text.trim()); setText('') } }}
        placeholder="Add a note…" className="h-8 flex-1 rounded-md border border-slate-200 px-2.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
      <button disabled={busy || !text.trim()} onClick={() => { onAdd(text.trim()); setText('') }} className="btn-secondary h-8 rounded-md px-3 text-[0.6875rem]">Add</button>
    </div>
  )
}
