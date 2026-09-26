import { useCallback, useEffect, useState } from 'react'
import { Pencil, RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { complianceApi, type IftaWorksheet } from '@/api/compliance'
import { formatCurrency } from '@/utils'
import PageShell, { Th } from '@/components/ui/PageShell'
import Drawer from '@/components/ui/Drawer'
import { Section, US_STATES, control } from '@/components/ui/Field'

/** The IFTA quarter: miles per state (entered from the ELD), gallons bought per state (from receipts), and what is owed or credited. */
export default function IftaPage() {
  const [yq, setYq] = useState<{ year: number; quarter: number } | null>(null)
  const [w, setW] = useState<IftaWorksheet | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<IftaWorksheet['trucks'][number] | null>(null)

  useEffect(() => { complianceApi.iftaCurrent().then(setYq).catch(() => setYq({ year: new Date().getFullYear(), quarter: Math.floor(new Date().getMonth() / 3) + 1 })) }, [])
  const load = useCallback(async () => {
    if (!yq) return
    setLoading(true)
    try { setW(await complianceApi.ifta(yq.year, yq.quarter)) } catch (e) { toast.error((e as Error).message) } finally { setLoading(false) }
  }, [yq])
  useEffect(() => { load() }, [load])

  const years = [new Date().getFullYear() - 1, new Date().getFullYear()]
  const t = w?.totals
  return (
    <PageShell title="IFTA" subtitle={w ? `Q${w.quarter} ${w.year} · ${w.from} to ${w.to}` : 'Loading…'}
      actions={<button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>}
      toolbar={yq && <>
        <select aria-label="Year" value={yq.year} onChange={e => setYq({ ...yq, year: Number(e.target.value) })} className={`${control} w-auto`}>{years.map(y => <option key={y}>{y}</option>)}</select>
        <select aria-label="Quarter" value={yq.quarter} onChange={e => setYq({ ...yq, quarter: Number(e.target.value) })} className={`${control} w-auto`}>{[1, 2, 3, 4].map(q => <option key={q} value={q}>Q{q}</option>)}</select>
        <span className="text-slate-500">Fuel comes from the expense ledger. Miles per state come from your ELD's quarterly summary, entered per truck below.</span>
      </>}>
      {!w ? <div className="py-16 text-center text-slate-400">Loading…</div> : (
        <div className="space-y-3 p-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {[['Miles', t!.miles.toLocaleString(), ''], ['Gallons bought', t!.gallons.toLocaleString(), ''], ['Fuel cost', formatCurrency(t!.cost), ''], ['Fleet MPG', t!.mpg != null ? String(t!.mpg) : '—', t!.mpg == null ? 'enter miles first' : ''], ['Unknown state', `${t!.unknown_state_gallons} gal`, t!.unknown_state_receipts ? `${t!.unknown_state_receipts} receipts without a state` : 'all receipts have a state']].map(([l, v, s]) => (
              <div key={l} className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"><div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-400">{l}</div><div className="mt-0.5 text-sm font-bold tabular-nums text-slate-950">{v}</div>{s && <div className="text-[0.6875rem] text-slate-500">{s}</div>}</div>
            ))}
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,1fr)]">
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">By state</h2><p className="text-[0.6875rem] text-slate-400">Taxable gallons = miles ÷ fleet MPG. Net above zero means you owe that state; below zero you bought more there than you burned.</p></header>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-200 bg-slate-50/80"><Th>State</Th><Th align="right">Miles</Th><Th align="right">Bought (gal)</Th><Th align="right">Cost</Th><Th align="right">Taxable (gal)</Th><Th align="right">Net (gal)</Th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {w.states.map(s => (
                    <tr key={s.state} className="hover:bg-blue-50/40">
                      <td className="px-3 py-2 font-bold text-slate-900">{s.state}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.miles.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.gallons}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatCurrency(s.cost)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{s.taxable_gallons ?? '—'}</td>
                      <td className={`px-3 py-2 text-right font-semibold tabular-nums ${s.net_gallons == null ? 'text-slate-400' : s.net_gallons > 0 ? 'text-red-600' : 'text-emerald-700'}`}>{s.net_gallons == null ? '—' : `${s.net_gallons > 0 ? '+' : ''}${s.net_gallons}`}</td>
                    </tr>
                  ))}
                  {w.states.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-slate-400">No fuel or miles in this quarter yet.</td></tr>}
                </tbody>
              </table>
            </section>
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <header className="border-b border-slate-100 px-4 py-3"><h2 className="text-sm font-bold text-slate-900">Miles per truck</h2><p className="text-[0.6875rem] text-slate-400">Load miles are a sanity check; IFTA uses the ELD miles you enter.</p></header>
              <table className="w-full text-xs">
                <thead><tr className="border-b border-slate-200 bg-slate-50/80"><Th>Truck</Th><Th align="right">ELD miles</Th><Th align="right">Load miles</Th><Th /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {w.trucks.map(tr => (
                    <tr key={tr.truck_id} className="hover:bg-blue-50/40">
                      <td className="px-3 py-2 font-bold text-slate-900">{tr.unit_number}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${tr.ifta_miles ? 'text-slate-900' : 'text-slate-300'}`}>{tr.ifta_miles ? tr.ifta_miles.toLocaleString() : 'not entered'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{tr.load_miles.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right"><button onClick={() => setEditing(tr)} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]"><Pencil className="h-3 w-3" />Miles by state</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </div>
      )}
      {editing && yq && <MilesEditor truck={editing} year={yq.year} quarter={yq.quarter} onClose={() => setEditing(null)} onSaved={ws => { setW(ws); setEditing(null) }} />}
    </PageShell>
  )
}

function MilesEditor({ truck, year, quarter, onClose, onSaved }: { truck: IftaWorksheet['trucks'][number]; year: number; quarter: number; onClose: () => void; onSaved: (w: IftaWorksheet) => void }) {
  const [rows, setRows] = useState<Array<{ state: string; miles: string }>>(() => { const r = Object.entries(truck.states).map(([state, miles]) => ({ state, miles: String(miles) })); return r.length ? r : [{ state: '', miles: '' }] })
  const [busy, setBusy] = useState(false)
  const total = rows.reduce((s, r) => s + (Number(r.miles) || 0), 0)
  const save = async () => {
    const miles: Record<string, number> = {}
    for (const r of rows) if (r.state && Number(r.miles) > 0) miles[r.state] = Number(r.miles)
    setBusy(true)
    try { onSaved(await complianceApi.setIftaMiles(year, quarter, truck.truck_id, miles)); toast.success(`Truck ${truck.unit_number}: ${total.toLocaleString()} miles`) }
    catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <Drawer title={`Truck ${truck.unit_number} · Q${quarter} ${year}`} subtitle="Miles per state from the ELD's IFTA summary" width={480} onClose={onClose}
      footer={<><span className="mr-auto text-slate-500">Total {total.toLocaleString()} mi · loads say {truck.load_miles.toLocaleString()}</span><button onClick={onClose} className="btn-ghost h-9 rounded-lg px-3 text-xs">Cancel</button><button onClick={save} disabled={busy} className="btn-primary h-9 rounded-lg px-4 text-xs">{busy ? 'Saving…' : 'Save'}</button></>}>
      <Section title="States">
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select value={r.state} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, state: e.target.value } : x))} className={`${control} w-24`}><option value="">State</option>{US_STATES.map(s => <option key={s}>{s}</option>)}</select>
              <input value={r.miles} onChange={e => setRows(rows.map((x, j) => j === i ? { ...x, miles: e.target.value.replace(/\D/g, '') } : x))} inputMode="numeric" placeholder="Miles" className={`${control} text-right`} />
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-600">×</button>
            </div>
          ))}
          <button onClick={() => setRows([...rows, { state: '', miles: '' }])} className="text-[0.6875rem] font-semibold text-blue-700 hover:underline">+ Add a state</button>
        </div>
      </Section>
    </Drawer>
  )
}
