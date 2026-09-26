import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, RefreshCw, Send } from 'lucide-react'
import toast from 'react-hot-toast'
import { billingApi, type BillingOverview, type InvoiceRow, type ReadyLoad } from '@/api/billing'
import { useEntities } from '@/hooks/useEntities'
import { formatCurrency, formatDate } from '@/utils'
import PageShell, { EmptyRow, Pill, Th } from '@/components/ui/PageShell'
import { control } from '@/components/ui/Field'
import LoadModal from '@/components/loads/LoadModal'

type Tab = 'ready' | 'open' | 'factoring' | 'paid'
const TABS: Array<[Tab, string]> = [['ready', 'Ready to invoice'], ['open', 'Outstanding'], ['factoring', 'At the factor'], ['paid', 'Paid']]

/** Bill delivered loads, send them direct or to the factor, and watch the money come back. */
export default function InvoicesPage() {
  const entities = useEntities()
  const [o, setO] = useState<BillingOverview | null>(null)
  const [tab, setTab] = useState<Tab>('ready')
  const [ready, setReady] = useState<ReadyLoad[]>([])
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [broker, setBroker] = useState('')
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [openLoad, setOpenLoad] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ov, rd, inv] = await Promise.all([billingApi.overview(), billingApi.ready(), billingApi.invoices(undefined, broker ? Number(broker) : undefined)])
      setO(ov); setReady(rd); setRows(inv)
    } catch (e) { toast.error((e as Error).message) } finally { setLoading(false) }
  }, [broker])
  useEffect(() => { load() }, [load])

  const visibleReady = useMemo(() => ready.filter(r => !broker || String(r.broker_id) === broker), [ready, broker])
  const visible = useMemo(() => rows.filter(r => tab === 'open' ? ['Pending', 'Sent'].includes(r.status) : tab === 'factoring' ? ['Factored', 'Funded'].includes(r.status) : tab === 'paid' ? r.status === 'Paid' : false), [rows, tab])

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await fn(); toast.success(ok); setPicked(new Set()); await load() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const createAndSend = (send?: 'direct' | 'factoring') => {
    const ids = [...picked]
    if (!ids.length) return toast.error('Pick the loads first')
    run(() => billingApi.create(ids, send), send ? `${ids.length} invoice${ids.length === 1 ? '' : 's'} sent` : `${ids.length} invoice${ids.length === 1 ? '' : 's'} created`)
  }
  const togglePick = (id: number) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const pickedFactoring = visibleReady.filter(r => picked.has(r.load_id) && r.factoring_broker).length

  return (
    <PageShell title="Invoices" subtitle={o ? `${formatCurrency(o.outstanding.amount)} outstanding · ${formatCurrency(o.overdue.amount)} overdue` : 'Loading…'}
      actions={<button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>}
      toolbar={<>
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {TABS.map(([k, l]) => {
            const n = k === 'ready' ? o?.ready.count : k === 'open' ? (o?.drafts.count ?? 0) + (o?.direct.count ?? 0) : k === 'factoring' ? (o?.at_factor.count ?? 0) + (o?.funded_waiting_reserve.count ?? 0) : undefined
            return <button key={k} onClick={() => { setTab(k); setPicked(new Set()) }} aria-pressed={tab === k} className={`rounded-md px-2.5 py-1 text-[0.6875rem] font-semibold transition ${tab === k ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>{l}{n ? <span className="ml-1 text-slate-400">{n}</span> : null}</button>
          })}
        </div>
        <select aria-label="Broker" value={broker} onChange={e => setBroker(e.target.value)} className={`${control} w-auto`}>
          <option value="">All brokers</option>{entities.brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {tab === 'ready' && picked.size > 0 && (
          <span className="ml-auto flex items-center gap-2">
            <span className="text-slate-500">{picked.size} picked</span>
            <button onClick={() => createAndSend('direct')} disabled={busy} className="btn-secondary h-9 rounded-lg px-3 text-xs"><Send className="h-3.5 w-3.5" />Invoice to broker</button>
            <button onClick={() => createAndSend('factoring')} disabled={busy} className="btn-primary h-9 rounded-lg px-3 text-xs"><Send className="h-3.5 w-3.5" />Send to factoring{pickedFactoring ? ` (${pickedFactoring} usual)` : ''}</button>
          </span>
        )}
      </>}
    >
      {o && (
        <div className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-white px-4 py-3 md:grid-cols-4 xl:grid-cols-7">
          <Stat label="Ready to invoice" value={formatCurrency(o.ready.amount)} sub={`${o.ready.count} loads${o.ready.without_pod ? ` · ${o.ready.without_pod} without POD` : ''}`} tone="blue" />
          <Stat label="Outstanding" value={formatCurrency(o.outstanding.amount)} sub={`${o.outstanding.count} invoices`} />
          <Stat label="Overdue" value={formatCurrency(o.overdue.amount)} sub={`${o.overdue.count} past terms`} tone={o.overdue.count ? 'red' : 'slate'} />
          <Stat label="At the factor" value={formatCurrency(o.at_factor.amount)} sub={`advance ${formatCurrency(o.at_factor.advance_expected)} expected`} tone="amber" />
          <Stat label="Reserve due back" value={formatCurrency(o.funded_waiting_reserve.amount)} sub={`${o.funded_waiting_reserve.count} funded`} />
          <Stat label="31–60 days" value={formatCurrency(o.aging['31_60'])} sub={`61–90: ${formatCurrency(o.aging['61_90'])}`} tone={o.aging['61_90'] ? 'amber' : 'slate'} />
          <Stat label="Over 90 days" value={formatCurrency(o.aging['90_plus'])} sub="needs a call" tone={o.aging['90_plus'] ? 'red' : 'slate'} />
        </div>
      )}

      {tab === 'ready' ? (
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50"><tr className="border-b border-slate-200">
            <th className="w-8 px-3 py-2"><input type="checkbox" aria-label="Pick all" checked={visibleReady.length > 0 && picked.size === visibleReady.length} onChange={e => setPicked(e.target.checked ? new Set(visibleReady.map(r => r.load_id)) : new Set())} className="h-3.5 w-3.5 accent-blue-600" /></th>
            <Th>Load</Th><Th>Broker</Th><Th>Route</Th><Th>Delivered</Th><Th>POD</Th><Th align="right">Amount</Th><Th />
          </tr></thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {loading && ready.length === 0 ? <tr><td colSpan={8} className="py-16 text-center text-slate-400">Loading…</td></tr>
            : visibleReady.length === 0 ? <EmptyRow colSpan={8} title="Nothing to invoice" hint="Delivered loads show up here until they have an invoice." />
            : visibleReady.map(r => (
              <tr key={r.load_id} className={`transition hover:bg-blue-50/40 ${picked.has(r.load_id) ? 'bg-blue-50/60' : ''}`}>
                <td className="px-3 py-2.5"><input type="checkbox" checked={picked.has(r.load_id)} onChange={() => togglePick(r.load_id)} className="h-3.5 w-3.5 accent-blue-600" /></td>
                <td className="px-3 py-2.5"><button onClick={() => setOpenLoad(r.load_id)} className="font-bold text-blue-700 hover:underline">#{r.load_number}</button><div className="text-[0.6875rem] text-slate-500">{r.truck} · {r.driver}</div></td>
                <td className="px-3 py-2.5 text-slate-800">{r.broker || '—'}{r.factoring_broker && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[0.625rem] font-bold text-amber-700">FACTOR</span>}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.pickup} → {r.delivery}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.delivered_on ? formatDate(r.delivered_on) : '—'}</td>
                <td className="px-3 py-2.5">{r.pod ? <Pill tone="green">POD</Pill> : <Pill tone="amber">No POD</Pill>}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(r.amount)}</td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => run(() => billingApi.create([r.load_id], 'direct'), 'Invoice sent')} disabled={busy} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]">To broker</button>
                  <button onClick={() => run(() => billingApi.create([r.load_id], 'factoring'), 'Sent to factoring')} disabled={busy} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]">To factor</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50"><tr className="border-b border-slate-200">
            <Th>Invoice</Th><Th>Load</Th><Th>Broker</Th><Th>Sent</Th><Th>Due</Th><Th>Status</Th><Th align="right">Amount</Th>{tab === 'factoring' && <><Th align="right">Advance</Th><Th align="right">Fee</Th></>}{tab === 'paid' && <Th align="right">Received</Th>}<Th />
          </tr></thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {visible.length === 0 ? <EmptyRow colSpan={11} title={tab === 'open' ? 'No open invoices' : tab === 'factoring' ? 'Nothing at the factor' : 'No paid invoices yet'} />
            : visible.map(r => (
              <tr key={r.id} className={`transition hover:bg-blue-50/40 ${r.overdue ? 'bg-red-50/40' : ''}`}>
                <td className="px-3 py-2.5 font-bold text-slate-900">#{r.invoice_number}</td>
                <td className="px-3 py-2.5"><button onClick={() => setOpenLoad(r.load_id)} className="font-semibold text-blue-700 hover:underline">#{r.load_number}</button><div className="text-[0.6875rem] text-slate-500">{r.pickup} → {r.delivery}</div></td>
                <td className="px-3 py-2.5 text-slate-800">{r.broker || '—'}</td>
                <td className="px-3 py-2.5 text-slate-600">{r.sent_at ? formatDate(r.sent_at) : <span className="text-slate-300">draft</span>}</td>
                <td className="px-3 py-2.5">{r.due_date ? <span className={r.overdue ? 'font-bold text-red-600' : 'text-slate-600'}>{formatDate(r.due_date)}{r.overdue ? ` · ${r.days_overdue}d late` : ''}</span> : '—'}</td>
                <td className="px-3 py-2.5"><Pill tone={r.status === 'Paid' ? 'green' : r.status === 'Pending' ? 'slate' : r.overdue ? 'red' : r.status === 'Funded' ? 'blue' : 'amber'}>{r.status === 'Pending' ? 'Draft' : r.status}</Pill></td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(r.amount)}</td>
                {tab === 'factoring' && <><td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{r.advance_amount != null ? formatCurrency(r.advance_amount) : '—'}</td><td className="px-3 py-2.5 text-right tabular-nums text-red-700">{r.fee_amount != null ? `−${formatCurrency(r.fee_amount)}` : '—'}</td></>}
                {tab === 'paid' && <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{r.paid_amount != null ? formatCurrency(r.paid_amount) : '—'}</td>}
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <button onClick={() => billingApi.openPacket(r.id).catch(e => toast.error((e as Error).message))} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]"><FileText className="h-3 w-3" />Packet</button>
                  {r.status === 'Pending' && <><button onClick={() => run(() => billingApi.send(r.id, 'direct'), 'Sent to broker')} disabled={busy} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]">Send</button><button onClick={() => run(() => billingApi.send(r.id, 'factoring'), 'Sent to factoring')} disabled={busy} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]">To factor</button></>}
                  {r.status === 'Sent' && <button onClick={() => run(() => billingApi.paid(r.id), 'Marked paid')} disabled={busy} className="btn-primary h-7 rounded-md px-2 text-[0.6875rem]">Paid</button>}
                  {r.status === 'Factored' && <button onClick={() => run(() => billingApi.funded(r.id), 'Advance received')} disabled={busy} className="btn-primary h-7 rounded-md px-2 text-[0.6875rem]">Funded</button>}
                  {r.status === 'Funded' && <button onClick={() => run(() => billingApi.paid(r.id), 'Closed')} disabled={busy} className="btn-primary h-7 rounded-md px-2 text-[0.6875rem]">Reserve in</button>}
                  {r.status !== 'Paid' && r.status !== 'Pending' && <button onClick={() => run(() => billingApi.reopen(r.id), 'Back to draft')} disabled={busy} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem] text-slate-400">Undo</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {openLoad != null && <LoadModal loadId={openLoad} entities={entities} onClose={() => setOpenLoad(null)} onSaved={load} />}
    </PageShell>
  )
}

function Stat({ label, value, sub, tone = 'slate' }: { label: string; value: string; sub?: string; tone?: 'slate' | 'blue' | 'amber' | 'red' }) {
  const t = { slate: 'text-slate-950', blue: 'text-blue-700', amber: 'text-amber-700', red: 'text-red-600' }[tone]
  return <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{label}</div><div className={`mt-0.5 text-sm font-bold tabular-nums ${t}`}>{value}</div>{sub && <div className="truncate text-[0.6875rem] text-slate-500">{sub}</div>}</div>
}
