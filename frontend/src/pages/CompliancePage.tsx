import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { complianceApi, type ExpiringDoc } from '@/api/compliance'
import { formatDate } from '@/utils'
import PageShell, { EmptyRow, Pill, Th } from '@/components/ui/PageShell'
import { control } from '@/components/ui/Field'

/** Every paper that has expired or is about to: drivers, trucks, trailers. */
export default function CompliancePage() {
  const [days, setDays] = useState(30)
  const [rows, setRows] = useState<ExpiringDoc[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    try { setRows(await complianceApi.expiring(days)) } catch (e) { toast.error((e as Error).message) } finally { setLoading(false) }
  }, [days])
  useEffect(() => { load() }, [load])
  const expired = rows.filter(r => r.status === 'expired').length
  return (
    <PageShell title="Documents due" count={rows.length} subtitle={expired ? `${expired} already expired` : 'Nothing expired'}
      actions={<button onClick={load} disabled={loading} className="btn-secondary h-9 rounded-lg px-3 text-xs"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>}
      toolbar={<select aria-label="Window" value={days} onChange={e => setDays(Number(e.target.value))} className={`${control} w-auto`}>
        {[7, 30, 60, 90].map(n => <option key={n} value={n}>Next {n} days</option>)}
      </select>}>
      <table className="w-full border-collapse text-xs">
        <thead className="sticky top-0 z-10 bg-slate-50"><tr className="border-b border-slate-200"><Th>Who</Th><Th>Document</Th><Th>Expires</Th><Th>Status</Th><Th /></tr></thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length === 0 ? <EmptyRow colSpan={5} title="All papers are in order" hint={`Nothing expires in the next ${days} days.`} />
          : rows.map((r, i) => (
            <tr key={i} className={`hover:bg-blue-50/40 ${r.status === 'expired' ? 'bg-red-50/40' : ''}`}>
              <td className="px-3 py-2.5"><div className="font-semibold text-slate-900">{r.owner}</div><div className="text-[0.6875rem] capitalize text-slate-500">{r.kind}</div></td>
              <td className="px-3 py-2.5 text-slate-800">{r.document}</td>
              <td className="px-3 py-2.5 text-slate-700">{formatDate(r.exp_date)}</td>
              <td className="px-3 py-2.5">{r.status === 'expired' ? <Pill tone="red">Expired {-r.days_left}d ago</Pill> : <Pill tone="amber">{r.days_left}d left</Pill>}</td>
              <td className="px-3 py-2.5 text-right"><Link to={r.link} className="btn-ghost h-7 rounded-md px-2 text-[0.6875rem]">Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </PageShell>
  )
}
