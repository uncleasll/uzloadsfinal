import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { reportsApi } from '@/api/payroll'
import { driversApi, brokersApi, trucksApi, trailersApi, dispatchersApi } from '@/api/entities'
import { formatCurrency, formatDate, PERIOD_OPTIONS } from '@/utils'
import type { Driver, Broker, Truck, Trailer, Dispatcher } from '@/types'
import LoadModal from '@/components/loads/LoadModal'
import toast from 'react-hot-toast'

const ALL_STATUSES = ['New','Canceled','TONU','Dispatched','En Route','Picked-up','Delivered','Closed']
const ALL_BILLING  = ['Pending','Canceled','BOL received','Invoiced','Sent to factoring','Funded','Paid']

// ─── Download helper ───────────────────────────────────────────────────────────
function buildApiUrl(path: string, params: Record<string, unknown>): string {
  const base = (import.meta.env.VITE_API_BASE_URL || '') + '/api/v1/reports' + path
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v))
  }
  const qs = sp.toString()
  return qs ? `${base}?${qs}` : base
}

function downloadFile(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.rel = 'noreferrer'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// ─── Shared hooks ──────────────────────────────────────────────────────────────
function useEntities() {
  const [drivers, setDrivers]       = useState<Driver[]>([])
  const [brokers, setBrokers]       = useState<Broker[]>([])
  const [trucks, setTrucks]         = useState<Truck[]>([])
  const [trailers, setTrailers]     = useState<Trailer[]>([])
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([])
  const [loading, setLoading]       = useState(true)
  useEffect(() => {
    Promise.all([
      driversApi.list(true), brokersApi.list(true), trucksApi.list(true),
      trailersApi.list(true), dispatchersApi.list(true),
    ]).then(([d, b, t, tr, di]) => {
      setDrivers(d); setBrokers(b); setTrucks(t); setTrailers(tr); setDispatchers(di)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])
  return { drivers, brokers, trucks, trailers, dispatchers, loading }
}

function emailReport(pdfUrl: string, xlsxUrl: string) {
  const subject = 'Report export'
  const body = `Please download the report files:\n\nPDF: ${window.location.origin}${pdfUrl}\nExcel: ${window.location.origin}${xlsxUrl}`
  window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function openLoad(loadId: unknown) {
  const id = Number(loadId)
  if (id) window.dispatchEvent(new CustomEvent('reports:open-load', { detail: id }))
}

function LoadNumberLink({ row }: { row: Record<string, unknown> }) {
  return (
    <button onClick={() => openLoad(row.load_id)}
      className="font-semibold text-blue-600 hover:underline">
      {row.load_number as number}
    </button>
  )
}

// ─── Report card (company header + PDF/Excel buttons) ─────────────────────────
function ReportCard({
  children, pdfUrl, xlsxUrl,
}: {
  children: React.ReactNode
  pdfUrl: string
  xlsxUrl: string
}) {
  const exportBtn = 'inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-600 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'
  return (
    <div className="mt-5 overflow-hidden rounded-xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-5 py-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Report results</span>
        <div className="flex gap-1.5">
          <button onClick={() => downloadFile(pdfUrl)} className={exportBtn}>
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            PDF
          </button>
          <button onClick={() => downloadFile(xlsxUrl)} className={exportBtn}>
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M10 3v18M14 3v18M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z"/></svg>
            Excel
          </button>
          <button onClick={() => emailReport(pdfUrl, xlsxUrl)} className={exportBtn}>
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
            Email
          </button>
        </div>
      </div>
      <div className="bg-white px-6 py-5 [&_.table-td]:py-1.5 [&_.table-td]:text-xs [&_.table-th]:py-2 [&_.table-th]:text-[10px]">
        {/* Company header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-16 h-14 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
              <svg className="w-9 h-9 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM3 5h11l3 5 2 1v4h-2m-6 0H5"/>
              </svg>
            </div>
            <div>
              <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">TOPTRUCK</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest">COMPANY</p>
            </div>
          </div>
          <div className="text-right text-xs text-gray-600 leading-5">
            <p className="font-bold text-gray-900">Silkroad llc</p>
            <p>Email: asilbekkarimov066@gmail.com</p>
            <p>Phone: (970) 610-8065</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── Shared filter widgets ─────────────────────────────────────────────────────
function RunSetButtons({ onRun, onReset, running }: { onRun:()=>void; onReset:()=>void; running:boolean }) {
  return (
    <div className="mt-5 flex gap-2">
      <button onClick={onRun} disabled={running}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
        {running
          ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-white" />
          : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>}
        {running ? 'Running...' : 'Run report'}
      </button>
      <button onClick={onReset}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
        Set to default
      </button>
    </div>
  )
}

function Checks({ label, items, selected, toggle }: { label?:string; items:string[]; selected:string[]; toggle:(s:string)=>void }) {
  return (
    <div>
      {label && <p className="text-xs font-semibold text-gray-600 mb-1.5">{label}</p>}
      <div className="space-y-1">
        {items.map(s => (
          <label key={s} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={selected.includes(s)} onChange={()=>toggle(s)} className="accent-brand-600 w-3.5 h-3.5 rounded"/>
            <span className="text-xs text-gray-700">{s}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function Radios({ name, opts, val, set }: { name:string; opts:{v:string;l:string}[]; val:string; set:(v:string)=>void }) {
  return (
    <div className="space-y-1">
      {opts.map(o => (
        <label key={o.v} className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name={name} value={o.v} checked={val===o.v} onChange={()=>set(o.v)} className="accent-brand-600 w-3.5 h-3.5"/>
          <span className="text-xs text-gray-600">{o.l}</span>
        </label>
      ))}
    </div>
  )
}

function MetaLines({ lines }: { lines: string[] }) {
  return (
    <div className="text-xs text-gray-600 mb-4 space-y-0.5">
      {lines.map((l, i) => {
        const [label, ...rest] = l.split(': ')
        return <p key={i}><span className="font-bold">{label}:</span> {rest.join(': ')}</p>
      })}
    </div>
  )
}

// ─── Total Revenue ─────────────────────────────────────────────────────────────
const TR_COLS = [
  {key:'pickup_date',label:'Pickup date',def:true},{key:'actual_delivery_date',label:'Completed date',def:true},
  {key:'load_number',label:'Load #',def:true},{key:'route',label:'Route',def:true},
  {key:'broker',label:'Broker name',def:false},{key:'po_number',label:'PO #',def:false},
  {key:'rate',label:'Invoice amount',def:true},{key:'truck',label:'Truck #',def:false},
  {key:'driver',label:'Driver name',def:false},{key:'driver_pay',label:'Driver pay amount',def:false},
  {key:'paid_to_driver_date',label:'Paid to driver date',def:false},{key:'settlement_number',label:'Settlement #',def:false},
]

function TotalRevenue() {
  const { drivers, brokers, trucks } = useEntities()
  const [running,setRunning]=useState(false)
  const [results,setResults]=useState<Record<string,unknown>|null>(null)
  const [cfg,setCfg]=useState({
    period:'last_30_days', broker_id:'', driver_id:'', truck_id:'',
    group_by:'none', date_type:'pickup',
    statuses: ALL_STATUSES.filter(s=>s!=='Canceled'),
    billing_statuses: ALL_BILLING,
    columns: TR_COLS.filter(c=>c.def).map(c=>c.key),
  })
  const toggle=(k:'statuses'|'billing_statuses'|'columns',v:string)=>
    setCfg(c=>({...c,[k]:c[k].includes(v)?c[k].filter((x:string)=>x!==v):[...c[k],v]}))

  const params=()=>({
    period:cfg.period, broker_id:cfg.broker_id||undefined, driver_id:cfg.driver_id||undefined,
    truck_id:cfg.truck_id||undefined, group_by:cfg.group_by, date_type:cfg.date_type,
    statuses:cfg.statuses.join(',') || undefined, billing_statuses:cfg.billing_statuses.join(',') || undefined,
  })

  const run=async()=>{
    setRunning(true)
    try{ setResults(await reportsApi.totalRevenue(params())) }
    catch(e:unknown){ toast.error((e as Error).message) }
    finally{ setRunning(false) }
  }

  const pdfUrl  = buildApiUrl('/total-revenue/pdf',  {...params(), columns: cfg.columns.join(',')})
  const xlsxUrl = buildApiUrl('/total-revenue/xlsx', {...params(), columns: cfg.columns.join(',')})
  const rows=(results?.rows as Record<string,unknown>[])||[]
  const summary=(results?.summary as Record<string,number>)||{}

  return (
    <div className="px-6 py-5">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-slate-950">Total Revenue Report</h1>
      <div className="grid grid-cols-5 gap-5">
        <div className="space-y-4">
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Period</p>
            <select value={cfg.period} onChange={e=>setCfg(c=>({...c,period:e.target.value}))} className="select-base text-xs">
              {PERIOD_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <Radios name="tr_dt" opts={[{v:'pickup',l:'by pickup date'},{v:'delivery',l:'by delivery date'}]} val={cfg.date_type} set={v=>setCfg(c=>({...c,date_type:v}))} />
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Group By:</p>
            <Radios name="tr_g" opts={[{v:'none',l:'none'},{v:'driver',l:'driver'},{v:'truck',l:'truck'}]} val={cfg.group_by} set={v=>setCfg(c=>({...c,group_by:v}))} />
          </div>
        </div>
        <div className="space-y-3">
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Broker</p>
            <select value={cfg.broker_id} onChange={e=>setCfg(c=>({...c,broker_id:e.target.value}))} className="select-base text-xs">
              <option value="">Search by name</option>
              {brokers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <Checks label="Status" items={ALL_STATUSES} selected={cfg.statuses} toggle={v=>toggle('statuses',v)} />
        </div>
        <div className="space-y-3">
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Driver</p>
            <select value={cfg.driver_id} onChange={e=>setCfg(c=>({...c,driver_id:e.target.value}))} className="select-base text-xs">
              <option value=""></option>
              {drivers.map(d=><option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}
            </select>
          </div>
          <Checks label="Billing status" items={ALL_BILLING} selected={cfg.billing_statuses} toggle={v=>toggle('billing_statuses',v)} />
        </div>
        <div className="space-y-3">
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Truck</p>
            <select value={cfg.truck_id} onChange={e=>setCfg(c=>({...c,truck_id:e.target.value}))} className="select-base text-xs">
              <option value=""></option>
              {trucks.map(t=><option key={t.id} value={t.id}>{t.unit_number}</option>)}
            </select>
          </div>
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Report columns</p>
            {TR_COLS.map(col=>(
              <label key={col.key} className="flex items-center gap-2 cursor-pointer mb-1">
                <input type="checkbox" checked={cfg.columns.includes(col.key)} onChange={()=>toggle('columns',col.key)} className="accent-brand-600 w-3.5 h-3.5 rounded"/>
                <span className="text-xs text-gray-700">{col.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div><p className="text-xs font-semibold text-gray-600 mb-1">Paid to driver</p>
          <select className="select-base text-xs"><option value=""></option><option>Paid</option><option>Unpaid</option></select>
        </div>
      </div>
      <RunSetButtons onRun={run} onReset={()=>setCfg(c=>({...c,statuses:ALL_STATUSES.filter(s=>s!=='Canceled'),billing_statuses:ALL_BILLING}))} running={running} />

      {results && (
        <ReportCard pdfUrl={pdfUrl} xlsxUrl={xlsxUrl}>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Total Revenue Report</h2>
          <MetaLines lines={[
            `Dates range: ${results.date_from} - ${results.date_to}`,
            `Status: ${cfg.statuses.join(', ')}`,
            `Billing status: ${cfg.billing_statuses.join(', ')}`,
          ]} />
          <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-4">
            {[{l:'Total Revenue',v:formatCurrency(summary.total_revenue||0),strong:true},{l:'Total Miles',v:(summary.total_miles||0).toLocaleString()+' mi'},{l:'Total Loads',v:String(summary.total_loads||0)},{l:'Rate/Mile',v:'$'+(summary.rate_per_mile||0).toFixed(2)+'/mi'}].map(s=>(
              <div key={s.l} className={`flex h-11 items-center justify-between gap-2 rounded-lg border px-3 shadow-sm ${s.strong ? 'border-blue-100 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${s.strong ? 'text-blue-500' : 'text-slate-400'}`}>{s.l}</span>
                <span className={`whitespace-nowrap text-sm font-bold ${s.strong ? 'text-blue-800' : 'text-slate-800'}`}>{s.v}</span>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-t border-gray-200">
              <thead className="bg-gray-50"><tr>
                {cfg.columns.includes('pickup_date')&&<th className="table-th">Pickup Date</th>}
                {cfg.columns.includes('actual_delivery_date')&&<th className="table-th">Completed</th>}
                {cfg.columns.includes('load_number')&&<th className="table-th">Load #</th>}
                {cfg.columns.includes('route')&&<th className="table-th">Route</th>}
                {cfg.columns.includes('broker')&&<th className="table-th">Broker</th>}
                {cfg.columns.includes('po_number')&&<th className="table-th">PO #</th>}
                {cfg.columns.includes('rate')&&<th className="table-th text-right">Invoice</th>}
                {cfg.columns.includes('driver')&&<th className="table-th">Driver</th>}
                {cfg.columns.includes('truck')&&<th className="table-th">Truck</th>}
                {cfg.columns.includes('driver_pay')&&<th className="table-th text-right">Driver Pay</th>}
                <th className="table-th">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length===0?<tr><td colSpan={12} className="py-8 text-center text-gray-400">No data</td></tr>:rows.map((r,i)=>(
                  <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
                    {cfg.columns.includes('pickup_date')&&<td className="table-td">{formatDate(r.pickup_date as string)}</td>}
                    {cfg.columns.includes('actual_delivery_date')&&<td className="table-td">{formatDate(r.actual_delivery_date as string)}</td>}
                    {cfg.columns.includes('load_number')&&<td className="table-td"><LoadNumberLink row={r} /></td>}
                    {cfg.columns.includes('route')&&<td className="table-td">{r.pickup_city as string}, {r.pickup_state as string} → {r.delivery_city as string}, {r.delivery_state as string}</td>}
                    {cfg.columns.includes('broker')&&<td className="table-td">{r.broker as string}</td>}
                    {cfg.columns.includes('po_number')&&<td className="table-td">{r.po_number as string}</td>}
                    {cfg.columns.includes('rate')&&<td className="table-td text-right font-medium">{formatCurrency(r.rate as number)}</td>}
                    {cfg.columns.includes('driver')&&<td className="table-td">{r.driver as string}</td>}
                    {cfg.columns.includes('truck')&&<td className="table-td">{r.truck as string}</td>}
                    {cfg.columns.includes('driver_pay')&&<td className="table-td text-right">{formatCurrency(r.driver_pay as number)}</td>}
                    <td className="table-td"><span className="badge bg-gray-100 text-gray-600 text-xs">{r.status as string}</span></td>
                  </tr>
                ))}
              </tbody>
              {rows.length>0&&<tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-xs">
                <td colSpan={cfg.columns.includes('route')?4:3} className="table-td">Total:</td>
                {cfg.columns.includes('rate')&&<td className="table-td text-right">{formatCurrency(summary.total_revenue||0)}</td>}
                <td colSpan={5}/>
              </tr></tfoot>}
            </table>
          </div>
        </ReportCard>
      )}
    </div>
  )
}

// ─── Rate per Mile ─────────────────────────────────────────────────────────────
function RatePerMile() {
  const { drivers, brokers, trucks, dispatchers } = useEntities()
  const [running,setRunning]=useState(false)
  const [results,setResults]=useState<Record<string,unknown>|null>(null)
  const [cfg,setCfg]=useState({
    period:'last_30_days', broker_id:'', driver_id:'', truck_id:'', dispatcher_id:'',
    group_by:'none', date_type:'pickup', change_to_overridden:false,
    statuses:ALL_STATUSES.filter(s=>s!=='Canceled'), billing_statuses:ALL_BILLING,
  })
  const toggle=(k:'statuses'|'billing_statuses',v:string)=>
    setCfg(c=>({...c,[k]:c[k].includes(v)?c[k].filter((x:string)=>x!==v):[...c[k],v]}))

  const dispatcherName = dispatchers.find(d=>String(d.id)===cfg.dispatcher_id)?.name || 'All dispatchers'

  const params=()=>({
    period:cfg.period, broker_id:cfg.broker_id||undefined, driver_id:cfg.driver_id||undefined,
    truck_id:cfg.truck_id||undefined, dispatcher_id:cfg.dispatcher_id||undefined,
    group_by:cfg.group_by, date_type:cfg.date_type,
    statuses:cfg.statuses.join(',') || undefined, billing_statuses:cfg.billing_statuses.join(',') || undefined,
    change_to_overridden:cfg.change_to_overridden||undefined,
  })

  const run=async()=>{
    setRunning(true)
    try{ setResults(await reportsApi.ratePerMile(params())) }
    catch(e:unknown){ toast.error((e as Error).message) }
    finally{ setRunning(false) }
  }

  const pdfUrl  = buildApiUrl('/rate-per-mile/pdf',  {...params(), dispatcher_name: dispatcherName})
  const xlsxUrl = buildApiUrl('/rate-per-mile/xlsx', {...params(), dispatcher_name: dispatcherName})
  const rows=(results?.rows as Record<string,unknown>[])||[]
  const summary=(results?.summary as Record<string,number>)||{}
  const driver=drivers.find(d=>String(d.id)===cfg.driver_id)
  const truck=trucks.find(t=>String(t.id)===cfg.truck_id)
  const broker=brokers.find(b=>String(b.id)===cfg.broker_id)

  return (
    <div className="px-6 py-5">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-slate-950">Rate per Mile Report</h1>
      <div className="grid grid-cols-4 gap-5">
        <div className="space-y-4">
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Period</p>
            <select value={cfg.period} onChange={e=>setCfg(c=>({...c,period:e.target.value}))} className="select-base text-xs">
              {PERIOD_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <Radios name="rpm_dt" opts={[{v:'pickup',l:'by pickup date'},{v:'delivery',l:'by delivery date'}]} val={cfg.date_type} set={v=>setCfg(c=>({...c,date_type:v}))} />
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Group By:</p>
            <Radios name="rpm_g" opts={[{v:'none',l:'none'},{v:'driver',l:'driver'},{v:'truck',l:'truck'}]} val={cfg.group_by} set={v=>setCfg(c=>({...c,group_by:v}))} />
          </div>
        </div>
        <div className="space-y-3">
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Broker</p>
            <select value={cfg.broker_id} onChange={e=>setCfg(c=>({...c,broker_id:e.target.value}))} className="select-base text-xs">
              <option value="">Search by name</option>
              {brokers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <Checks label="Status" items={ALL_STATUSES} selected={cfg.statuses} toggle={v=>toggle('statuses',v)} />
        </div>
        <div className="space-y-3">
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Driver</p>
            <select value={cfg.driver_id} onChange={e=>setCfg(c=>({...c,driver_id:e.target.value}))} className="select-base text-xs">
              <option value=""></option>
              {drivers.map(d=><option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}
            </select>
          </div>
          <Checks label="Billing status" items={ALL_BILLING} selected={cfg.billing_statuses} toggle={v=>toggle('billing_statuses',v)} />
        </div>
        <div className="space-y-3">
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Dispatcher</p>
            <select value={cfg.dispatcher_id} onChange={e=>setCfg(c=>({...c,dispatcher_id:e.target.value}))} className="select-base text-xs">
              <option value="">All dispatchers</option>
              {dispatchers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Truck</p>
            <select value={cfg.truck_id} onChange={e=>setCfg(c=>({...c,truck_id:e.target.value}))} className="select-base text-xs">
              <option value=""></option>
              {trucks.map(t=><option key={t.id} value={t.id}>{t.unit_number}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input type="checkbox" checked={cfg.change_to_overridden} onChange={e=>setCfg(c=>({...c,change_to_overridden:e.target.checked}))} className="rounded accent-brand-600 w-3.5 h-3.5"/>
            <span className="text-xs text-gray-600">Change to overridden rate</span>
          </label>
        </div>
      </div>
      <RunSetButtons onRun={run} onReset={()=>setCfg(c=>({...c,statuses:ALL_STATUSES.filter(s=>s!=='Canceled'),billing_statuses:ALL_BILLING}))} running={running} />

      {results && (
        <ReportCard pdfUrl={pdfUrl} xlsxUrl={xlsxUrl}>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Rate per Mile Report</h2>
          <MetaLines lines={[
            `Dates range: ${results.date_from} - ${results.date_to}`,
            ...(broker?[`Broker: ${broker.name}`]:[]),
            ...(driver?[`Driver: ${driver.name} [${driver.driver_type}]`]:[]),
            ...(truck?[`Truck: ${truck.unit_number}`]:[]),
            `Dispatcher: ${dispatcherName}`,
            `Statuses: ${cfg.statuses.join(', ')}`,
            `Billing statuses: ${cfg.billing_statuses.join(', ')}`,
          ]} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-200 rounded">
              <thead className="bg-gray-50 border-b border-gray-200"><tr>
                <th className="table-th">Pickup date</th><th className="table-th">Completed date</th>
                <th className="table-th">Load #</th><th className="table-th">Truck #</th>
                <th className="table-th">Driver</th><th className="table-th">Dispatcher</th>
                <th className="table-th">Route</th>
                <th className="table-th text-right">Empty miles</th><th className="table-th text-right">Loaded miles</th>
                <th className="table-th text-right">Total miles</th><th className="table-th text-right">Rate</th>
                <th className="table-th text-right">Rate per mile</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length===0?<tr><td colSpan={12} className="py-8 text-center text-gray-400">No data</td></tr>:rows.map((r,i)=>(
                  <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
                    <td className="table-td">{formatDate(r.pickup_date as string)}</td>
                    <td className="table-td">{formatDate(r.actual_delivery_date as string)}</td>
                    <td className="table-td"><LoadNumberLink row={r} /></td>
                    <td className="table-td">{r.truck as string}</td>
                    <td className="table-td">{r.driver as string}</td>
                    <td className="table-td">{r.dispatcher as string}</td>
                    <td className="table-td">{r.pickup_city as string}, {r.pickup_state as string} - {r.delivery_city as string}, {r.delivery_state as string}</td>
                    <td className="table-td text-right">{(r.empty_miles as number)||0}</td>
                    <td className="table-td text-right">{(r.loaded_miles as number)||0}</td>
                    <td className="table-td text-right">{(r.total_miles as number)||0}</td>
                    <td className="table-td text-right font-medium">{formatCurrency(r.rate as number)}</td>
                    <td className="table-td text-right">{formatCurrency(r.rate_per_mile as number)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length>0&&<tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-xs">
                <td colSpan={7} className="table-td text-right">Total:</td>
                <td className="table-td text-right">{rows.reduce((s,r)=>s+(r.empty_miles as number||0),0).toLocaleString()}</td>
                <td className="table-td text-right">{rows.reduce((s,r)=>s+(r.loaded_miles as number||0),0).toLocaleString()}</td>
                <td className="table-td text-right">{(summary.total_miles||0).toLocaleString()}</td>
                <td className="table-td text-right">{formatCurrency(summary.total_revenue||0)}</td>
                <td className="table-td text-right">{formatCurrency(summary.rate_per_mile||0)}</td>
              </tr></tfoot>}
            </table>
          </div>
        </ReportCard>
      )}
    </div>
  )
}

// ─── Revenue by Dispatcher ─────────────────────────────────────────────────────
function RevenueByDispatcher() {
  const { dispatchers } = useEntities()
  const [running,setRunning]=useState(false)
  const [results,setResults]=useState<Record<string,unknown>|null>(null)
  const [cfg,setCfg]=useState({period:'last_30_days',dispatcher_id:'',detailed:false,statuses:[...ALL_STATUSES],billing_statuses:[...ALL_BILLING]})
  const toggle=(k:'statuses'|'billing_statuses',v:string)=>setCfg(c=>({...c,[k]:c[k].includes(v)?c[k].filter((x:string)=>x!==v):[...c[k],v]}))
  const dispatcherName = dispatchers.find(d=>String(d.id)===cfg.dispatcher_id)?.name || 'All'
  const params=()=>({period:cfg.period,dispatcher_id:cfg.dispatcher_id||undefined,statuses:cfg.statuses.join(',')||undefined,billing_statuses:cfg.billing_statuses.join(',')||undefined,detailed:cfg.detailed})
  const run=async()=>{setRunning(true);try{setResults(await reportsApi.revenueByDispatcher(params()))}catch(e:unknown){toast.error((e as Error).message)}finally{setRunning(false)}}
  const pdfUrl=buildApiUrl('/revenue-by-dispatcher/pdf',{...params(),dispatcher_name:dispatcherName})
  const xlsxUrl=buildApiUrl('/revenue-by-dispatcher/xlsx',{...params(),dispatcher_name:dispatcherName})
  const rows=(results?.rows as Record<string,unknown>[])||[]
  const summary=(results?.summary as Record<string,number>)||{}
  return (
    <div className="px-6 py-5">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-slate-950">Revenue by Dispatcher Report</h1>
      <div className="grid grid-cols-3 gap-5 items-start">
        <div className="space-y-3">
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Period</p>
            <select value={cfg.period} onChange={e=>setCfg(c=>({...c,period:e.target.value}))} className="select-base text-xs">
              {PERIOD_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Dispatcher</p>
            <select value={cfg.dispatcher_id} onChange={e=>setCfg(c=>({...c,dispatcher_id:e.target.value}))} className="select-base text-xs">
              <option value="">All dispatchers</option>
              {dispatchers.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={cfg.detailed} onChange={e=>setCfg(c=>({...c,detailed:e.target.checked}))} className="rounded accent-brand-600 w-3.5 h-3.5"/>
            <span className="text-xs text-gray-600">Detailed report</span>
          </label>
        </div>
        <Checks label="Status" items={ALL_STATUSES} selected={cfg.statuses} toggle={v=>toggle('statuses',v)} />
        <Checks label="Billing status" items={ALL_BILLING} selected={cfg.billing_statuses} toggle={v=>toggle('billing_statuses',v)} />
      </div>
      <RunSetButtons onRun={run} onReset={()=>setCfg(c=>({...c,statuses:[...ALL_STATUSES],billing_statuses:[...ALL_BILLING]}))} running={running} />
      {results&&(
        <ReportCard pdfUrl={pdfUrl} xlsxUrl={xlsxUrl}>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Revenue by Dispatcher Report</h2>
          <MetaLines lines={[`Dates range: ${results.date_from} - ${results.date_to}`,`Dispatcher: ${dispatcherName}`,`Status: ${cfg.statuses.join(', ')}`,`Billing status: ${cfg.billing_statuses.join(', ')}`]} />
          <table className="w-full text-xs border border-gray-200 rounded">
            <thead className="bg-gray-50"><tr><th className="table-th w-10">#</th><th className="table-th">Dispatcher</th><th className="table-th text-right">Rate Amount</th><th className="table-th text-right">Overridden Rate</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length===0?<tr><td colSpan={4} className="py-8 text-center text-gray-400">No data</td></tr>:rows.map((r,i)=>(
                <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
                  <td className="table-td">{i+1}</td>
                  <td className="table-td font-medium">{r.dispatcher as string}</td>
                  <td className="table-td text-right">{formatCurrency(r.rate_amount as number)}</td>
                  <td className="table-td text-right">{formatCurrency(r.overridden_rate as number)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-xs"><td colSpan={2} className="table-td text-right">Total:</td><td className="table-td text-right">{formatCurrency(summary.total||0)}</td><td className="table-td text-right">{formatCurrency(summary.total||0)}</td></tr></tfoot>
          </table>
        </ReportCard>
      )}
    </div>
  )
}

// ─── Payment Summary ───────────────────────────────────────────────────────────
function PaymentSummary() {
  const [running,setRunning]=useState(false)
  const [results,setResults]=useState<Record<string,unknown>|null>(null)
  const [period,setPeriod]=useState('last_30_days')
  const run=async()=>{setRunning(true);try{setResults(await reportsApi.paymentSummary({period}))}catch(e:unknown){toast.error((e as Error).message)}finally{setRunning(false)}}
  const pdfUrl=buildApiUrl('/payment-summary/pdf',{period}); const xlsxUrl=buildApiUrl('/payment-summary/xlsx',{period})
  const rows=(results?.rows as Record<string,unknown>[])||[]; const summary=(results?.summary as Record<string,number>)||{}
  return (
    <div className="px-6 py-5">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-slate-950">Driver Payments Summary</h1>
      <div className="flex items-end gap-5"><div><p className="text-xs font-semibold text-gray-600 mb-1">Period</p>
        <select value={period} onChange={e=>setPeriod(e.target.value)} className="select-base text-sm w-48">
          {PERIOD_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select></div>
      </div>
      <RunSetButtons onRun={run} onReset={()=>setPeriod('last_30_days')} running={running} />
      {results&&(
        <ReportCard pdfUrl={pdfUrl} xlsxUrl={xlsxUrl}>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Driver Payments Summary</h2>
          <MetaLines lines={[`Dates range: ${results.date_from} - ${results.date_to}`]} />
          <table className="w-full text-xs border border-gray-200 rounded">
            <thead className="bg-gray-50"><tr><th className="table-th">Driver Name</th><th className="table-th">Payable to</th><th className="table-th text-right">Total Amount</th><th className="table-th text-right">Balance Due</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length===0?<tr><td colSpan={4} className="py-6 text-center text-gray-400">No records</td></tr>:rows.map((r,i)=>(
                <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
                  <td className="table-td font-medium">{r.driver_name as string}</td>
                  <td className="table-td">{r.payable_to as string}</td>
                  <td className="table-td text-right">{formatCurrency(r.total_amount as number)}</td>
                  <td className="table-td text-right">{formatCurrency(r.balance_due as number)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-xs"><td colSpan={2} className="table-td text-right">Total:</td><td className="table-td text-right">{formatCurrency(summary.total_amount||0)}</td><td className="table-td text-right">{formatCurrency(summary.total_balance||0)}</td></tr></tfoot>
          </table>
        </ReportCard>
      )}
    </div>
  )
}

// ─── Expenses ──────────────────────────────────────────────────────────────────
function Expenses() {
  const [running,setRunning]=useState(false)
  const [results,setResults]=useState<Record<string,unknown>|null>(null)
  const [cfg,setCfg]=useState({period:'last_30_days',category:'All',detailed:false})
  const CATS=['All','Carryover Adjustment','Fuel','Tolls','Insurance','Maintenance','Other']
  const run=async()=>{setRunning(true);try{setResults(await reportsApi.expenses({period:cfg.period,category:cfg.category,detailed:cfg.detailed}))}catch(e:unknown){toast.error((e as Error).message)}finally{setRunning(false)}}
  const pdfUrl=buildApiUrl('/expenses/pdf',{period:cfg.period,category:cfg.category}); const xlsxUrl=buildApiUrl('/expenses/xlsx',{period:cfg.period,category:cfg.category})
  const rows=(results?.rows as Record<string,unknown>[])||[]; const summary=(results?.summary as Record<string,number>)||{}
  return (
    <div className="px-6 py-5">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-slate-950">Expenses Report</h1>
      <div className="flex items-end gap-5">
        <div><p className="text-xs font-semibold text-gray-600 mb-1">Period</p><select value={cfg.period} onChange={e=>setCfg(c=>({...c,period:e.target.value}))} className="select-base text-sm w-48">{PERIOD_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div><p className="text-xs font-semibold text-gray-600 mb-1">Category</p><select value={cfg.category} onChange={e=>setCfg(c=>({...c,category:e.target.value}))} className="select-base text-sm w-52">{CATS.map(c=><option key={c}>{c}</option>)}</select></div>
        <label className="flex items-center gap-2 cursor-pointer mb-1.5"><input type="checkbox" checked={cfg.detailed} onChange={e=>setCfg(c=>({...c,detailed:e.target.checked}))} className="rounded accent-brand-600 w-4 h-4"/><span className="text-sm text-gray-600">Detailed report</span></label>
      </div>
      <RunSetButtons onRun={run} onReset={()=>setCfg({period:'last_30_days',category:'All',detailed:false})} running={running} />
      {results&&(
        <ReportCard pdfUrl={pdfUrl} xlsxUrl={xlsxUrl}>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Expenses Report</h2>
          <MetaLines lines={[`Dates range: ${results.date_from} - ${results.date_to}`,`Category: ${cfg.category}`]} />
          <table className="w-full text-xs border border-gray-200 rounded"><thead className="bg-gray-50"><tr><th className="table-th w-10">#</th><th className="table-th">Date</th><th className="table-th">Category</th><th className="table-th">Description</th><th className="table-th">Vendor</th><th className="table-th text-right">Amount</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length===0?<tr><td colSpan={6} className="py-6 text-center text-gray-400">No records</td></tr>:rows.map((r,i)=>(
              <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
                <td className="table-td">{i+1}</td>
                <td className="table-td">{formatDate(r.expense_date as string)}</td>
                <td className="table-td">{r.category as string}</td>
                <td className="table-td">{r.description as string}</td>
                <td className="table-td">{r.vendor as string}</td>
                <td className="table-td text-right">{formatCurrency(r.amount as number)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-xs"><td colSpan={5} className="table-td text-right">Total:</td><td className="table-td text-right">{formatCurrency(summary.total||0)}</td></tr></tfoot></table>
        </ReportCard>
      )}
    </div>
  )
}

// ─── Gross Profit ──────────────────────────────────────────────────────────────
function GrossProfit() {
  const { drivers, trucks } = useEntities()
  const [running,setRunning]=useState(false)
  const [results,setResults]=useState<Record<string,unknown>|null>(null)
  const [cfg,setCfg]=useState({period:'last_30_days',driver_id:'',truck_id:'',date_type:'pickup'})
  const run=async()=>{setRunning(true);try{setResults(await reportsApi.grossProfit({period:cfg.period,driver_id:cfg.driver_id||undefined,truck_id:cfg.truck_id||undefined,date_type:cfg.date_type}))}catch(e:unknown){toast.error((e as Error).message)}finally{setRunning(false)}}
  const pdfUrl=buildApiUrl('/gross-profit/pdf',{period:cfg.period,driver_id:cfg.driver_id||undefined,truck_id:cfg.truck_id||undefined,date_type:cfg.date_type})
  const xlsxUrl=buildApiUrl('/gross-profit/xlsx',{period:cfg.period,driver_id:cfg.driver_id||undefined,truck_id:cfg.truck_id||undefined,date_type:cfg.date_type})
  const summary=(results?.summary as Record<string,number>)||{}
  const driver=drivers.find(d=>String(d.id)===cfg.driver_id); const truck=trucks.find(t=>String(t.id)===cfg.truck_id)
  return (
    <div className="px-6 py-5">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-slate-950">Gross Profit Report</h1>
      <div className="grid grid-cols-4 gap-5 items-start">
        <div><p className="text-xs font-semibold text-gray-600 mb-1">Period</p><select value={cfg.period} onChange={e=>setCfg(c=>({...c,period:e.target.value}))} className="select-base text-sm">{PERIOD_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <div className="mt-2"><Radios name="gp_dt" opts={[{v:'pickup',l:'by pickup date'},{v:'delivery',l:'by delivery date'}]} val={cfg.date_type} set={v=>setCfg(c=>({...c,date_type:v}))} /></div>
        </div>
        <div><p className="text-xs font-semibold text-gray-600 mb-1">Driver</p><select value={cfg.driver_id} onChange={e=>setCfg(c=>({...c,driver_id:e.target.value}))} className="select-base text-sm"><option value=""></option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}</select></div>
        <div><p className="text-xs font-semibold text-gray-600 mb-1">Truck</p><select value={cfg.truck_id} onChange={e=>setCfg(c=>({...c,truck_id:e.target.value}))} className="select-base text-sm"><option value=""></option>{trucks.map(t=><option key={t.id} value={t.id}>{t.unit_number}</option>)}</select></div>
      </div>
      <RunSetButtons onRun={run} onReset={()=>setCfg({period:'last_30_days',driver_id:'',truck_id:'',date_type:'pickup'})} running={running} />
      {results&&(
        <ReportCard pdfUrl={pdfUrl} xlsxUrl={xlsxUrl}>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Gross Profit Report</h2>
          <MetaLines lines={[`Dates range: ${results.date_from} - ${results.date_to}`,...(driver?[`Driver: ${driver.name} [${driver.driver_type}]`]:[]),...(truck?[`Truck: ${truck.unit_number}`]:[])]} />
          <table className="w-full text-sm border border-gray-200 rounded">
            <thead className="bg-gray-50"><tr><th className="table-th flex-1"></th><th className="table-th text-right w-40">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {[['Total Revenue',summary.total_revenue||0,false],['Loads Revenue',summary.loads_revenue||0,true],['Other Revenue',summary.other_revenue||0,true],['Driver Payments',summary.driver_payments||0,false],['Fuel',summary.fuel||0,true],['Tolls',summary.tolls||0,true],['Gross Profit',summary.gross_profit||0,false]].map(([l,v,link])=>(
                <tr key={l as string} className="hover:bg-gray-50"><td className="table-td font-medium">{l as string}</td><td className={`table-td text-right ${link?'text-brand-600':''}`}>{formatCurrency(v as number)}</td></tr>
              ))}
            </tbody>
          </table>
        </ReportCard>
      )}
    </div>
  )
}

// ─── Gross Profit per Load ─────────────────────────────────────────────────────
function GrossProfitPerLoad() {
  const { drivers, brokers, trucks } = useEntities()
  const [running,setRunning]=useState(false)
  const [results,setResults]=useState<Record<string,unknown>|null>(null)
  const [cfg,setCfg]=useState({period:'last_30_days',broker_id:'',driver_id:'',truck_id:'',group_by:'none',date_type:'pickup',statuses:ALL_STATUSES.filter(s=>s!=='Canceled'),billing_statuses:ALL_BILLING})
  const toggle=(k:'statuses'|'billing_statuses',v:string)=>setCfg(c=>({...c,[k]:c[k].includes(v)?c[k].filter((x:string)=>x!==v):[...c[k],v]}))
  const params=()=>({period:cfg.period,broker_id:cfg.broker_id||undefined,driver_id:cfg.driver_id||undefined,truck_id:cfg.truck_id||undefined,group_by:cfg.group_by,date_type:cfg.date_type,statuses:cfg.statuses.join(',')||undefined,billing_statuses:cfg.billing_statuses.join(',')||undefined})
  const run=async()=>{setRunning(true);try{setResults(await reportsApi.grossProfitPerLoad(params()))}catch(e:unknown){toast.error((e as Error).message)}finally{setRunning(false)}}
  const pdfUrl=buildApiUrl('/gross-profit-per-load/pdf',params()); const xlsxUrl=buildApiUrl('/gross-profit-per-load/xlsx',params())
  const rows=(results?.rows as Record<string,unknown>[])||[]; const summary=(results?.summary as Record<string,number>)||{}
  const driver=drivers.find(d=>String(d.id)===cfg.driver_id); const truck=trucks.find(t=>String(t.id)===cfg.truck_id)
  return (
    <div className="px-6 py-5">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-slate-950">Gross Profit per Load Report</h1>
      <div className="grid grid-cols-4 gap-5 items-start">
        <div className="space-y-3"><div><p className="text-xs font-semibold text-gray-600 mb-1">Period</p><select value={cfg.period} onChange={e=>setCfg(c=>({...c,period:e.target.value}))} className="select-base text-xs">{PERIOD_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
          <Radios name="gppl_dt" opts={[{v:'pickup',l:'by pickup date'},{v:'delivery',l:'by delivery date'}]} val={cfg.date_type} set={v=>setCfg(c=>({...c,date_type:v}))} />
          <div><p className="text-xs font-semibold text-gray-600 mb-1">Group By:</p><Radios name="gppl_g" opts={[{v:'none',l:'none'},{v:'driver',l:'driver'},{v:'truck',l:'truck'}]} val={cfg.group_by} set={v=>setCfg(c=>({...c,group_by:v}))} /></div>
        </div>
        <div className="space-y-3"><div><p className="text-xs font-semibold text-gray-600 mb-1">Broker</p><select value={cfg.broker_id} onChange={e=>setCfg(c=>({...c,broker_id:e.target.value}))} className="select-base text-xs"><option value="">Search by name</option>{brokers.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div><Checks label="Status" items={ALL_STATUSES} selected={cfg.statuses} toggle={v=>toggle('statuses',v)} /></div>
        <div className="space-y-3"><div><p className="text-xs font-semibold text-gray-600 mb-1">Driver</p><select value={cfg.driver_id} onChange={e=>setCfg(c=>({...c,driver_id:e.target.value}))} className="select-base text-xs"><option value=""></option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}</select></div><Checks label="Billing status" items={ALL_BILLING} selected={cfg.billing_statuses} toggle={v=>toggle('billing_statuses',v)} /></div>
        <div><p className="text-xs font-semibold text-gray-600 mb-1">Truck</p><select value={cfg.truck_id} onChange={e=>setCfg(c=>({...c,truck_id:e.target.value}))} className="select-base text-xs"><option value=""></option>{trucks.map(t=><option key={t.id} value={t.id}>{t.unit_number}</option>)}</select></div>
      </div>
      <RunSetButtons onRun={run} onReset={()=>setCfg(c=>({...c,statuses:ALL_STATUSES.filter(s=>s!=='Canceled'),billing_statuses:ALL_BILLING}))} running={running} />
      {results&&(
        <ReportCard pdfUrl={pdfUrl} xlsxUrl={xlsxUrl}>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Gross Profit per Load Report</h2>
          <MetaLines lines={[`Dates range: ${results.date_from} - ${results.date_to}`,...(driver?[`Driver: ${driver.name} [${driver.driver_type}]`]:[]),...(truck?[`Truck: ${truck.unit_number}`]:[]),`Status: ${cfg.statuses.join(', ')}`,`Billing status: ${cfg.billing_statuses.join(', ')}`]} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-200 rounded">
              <thead className="bg-gray-50"><tr><th className="table-th">Pickup date</th><th className="table-th">Delivery date</th><th className="table-th">Load #</th><th className="table-th">Truck #</th><th className="table-th">Driver</th><th className="table-th">Route</th><th className="table-th text-right">Total miles</th><th className="table-th text-right">Invoice</th><th className="table-th text-right">QP/Fac fee</th><th className="table-th text-right">Lumpers+Other</th><th className="table-th text-right">Driver Pay</th><th className="table-th text-right">Gross Profit</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rows.length===0?<tr><td colSpan={12} className="py-8 text-center text-gray-400">No data</td></tr>:rows.map((r,i)=>(
                  <tr key={i} className={i%2===0?'bg-white':'bg-gray-50'}>
                    <td className="table-td">{formatDate(r.pickup_date as string)}</td><td className="table-td">{formatDate(r.actual_delivery_date as string)}</td>
                    <td className="table-td"><LoadNumberLink row={r} /></td><td className="table-td">{r.truck as string}</td><td className="table-td">{r.driver as string}</td>
                    <td className="table-td">{r.pickup_city as string}, {r.pickup_state as string} - {r.delivery_city as string}, {r.delivery_state as string}</td>
                    <td className="table-td text-right">{(r.total_miles as number)||0}</td><td className="table-td text-right">{formatCurrency(r.rate as number)}</td>
                    <td className="table-td text-right">{formatCurrency(r.qp_fee as number)}</td>
                    <td className="table-td text-right">{formatCurrency((r.lumpers as number)+(r.other_add_ded as number))}</td>
                    <td className="table-td text-right">{formatCurrency(r.driver_pay as number)}</td>
                    <td className="table-td text-right font-semibold">{formatCurrency(r.gross_profit as number)}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length>0&&<tfoot><tr className="border-t-2 border-gray-300 bg-gray-50 font-bold text-xs"><td colSpan={6} className="table-td text-right">Total:</td><td className="table-td text-right">{rows.reduce((s,r)=>s+(r.total_miles as number||0),0)}</td><td className="table-td text-right">{formatCurrency(summary.total_revenue||0)}</td><td className="table-td text-right">{formatCurrency(rows.reduce((s,r)=>s+(r.qp_fee as number||0),0))}</td><td className="table-td text-right">{formatCurrency(rows.reduce((s,r)=>s+((r.lumpers as number||0)+(r.other_add_ded as number||0)),0))}</td><td className="table-td text-right">{formatCurrency(summary.total_driver_pay||0)}</td><td className="table-td text-right">{formatCurrency(summary.total_gross_profit||0)}</td></tr></tfoot>}
            </table>
          </div>
        </ReportCard>
      )}
    </div>
  )
}

// ─── Profit & Loss ─────────────────────────────────────────────────────────────
function ProfitLoss() {
  const { drivers, trucks } = useEntities()
  const [running,setRunning]=useState(false)
  const [results,setResults]=useState<Record<string,unknown>|null>(null)
  const [cfg,setCfg]=useState({period:'last_30_days',driver_id:'',truck_id:'',date_type:'pickup'})
  const run=async()=>{setRunning(true);try{setResults(await reportsApi.profitLoss({period:cfg.period,driver_id:cfg.driver_id||undefined,truck_id:cfg.truck_id||undefined,date_type:cfg.date_type}))}catch(e:unknown){toast.error((e as Error).message)}finally{setRunning(false)}}
  const pdfUrl=buildApiUrl('/profit-loss/pdf',{period:cfg.period,driver_id:cfg.driver_id||undefined,truck_id:cfg.truck_id||undefined,date_type:cfg.date_type})
  const xlsxUrl=buildApiUrl('/profit-loss/xlsx',{period:cfg.period,driver_id:cfg.driver_id||undefined,truck_id:cfg.truck_id||undefined,date_type:cfg.date_type})
  const summary=(results?.summary as Record<string,number>)||{}
  const driver=drivers.find(d=>String(d.id)===cfg.driver_id); const truck=trucks.find(t=>String(t.id)===cfg.truck_id)
  return (
    <div className="px-6 py-5">
      <h1 className="mb-5 text-xl font-bold tracking-tight text-slate-950">Profit & Loss Report</h1>
      <div className="grid grid-cols-4 gap-5 items-start">
        <div><p className="text-xs font-semibold text-gray-600 mb-1">Period</p><select value={cfg.period} onChange={e=>setCfg(c=>({...c,period:e.target.value}))} className="select-base text-sm">{PERIOD_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select><div className="mt-2"><Radios name="pl_dt" opts={[{v:'pickup',l:'by pickup date'},{v:'delivery',l:'by delivery date'}]} val={cfg.date_type} set={v=>setCfg(c=>({...c,date_type:v}))} /></div></div>
        <div><p className="text-xs font-semibold text-gray-600 mb-1">Driver</p><select value={cfg.driver_id} onChange={e=>setCfg(c=>({...c,driver_id:e.target.value}))} className="select-base text-sm"><option value=""></option>{drivers.map(d=><option key={d.id} value={d.id}>{d.name} [{d.driver_type}]</option>)}</select></div>
        <div><p className="text-xs font-semibold text-gray-600 mb-1">Truck</p><select value={cfg.truck_id} onChange={e=>setCfg(c=>({...c,truck_id:e.target.value}))} className="select-base text-sm"><option value=""></option>{trucks.map(t=><option key={t.id} value={t.id}>{t.unit_number}</option>)}</select></div>
      </div>
      <RunSetButtons onRun={run} onReset={()=>setCfg({period:'last_30_days',driver_id:'',truck_id:'',date_type:'pickup'})} running={running} />
      {results&&(
        <ReportCard pdfUrl={pdfUrl} xlsxUrl={xlsxUrl}>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Profit & Loss Report</h2>
          <MetaLines lines={[`Dates range: ${results.date_from} - ${results.date_to}`,...(driver?[`Driver: ${driver.name} [${driver.driver_type}]`]:[]),...(truck?[`Truck: ${truck.unit_number}`]:[])]} />
          <table className="w-full text-sm border border-gray-200 rounded">
            <thead className="bg-gray-50"><tr><th className="table-th flex-1"></th><th className="table-th text-right w-40">Amount</th></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {[['Total Revenue',summary.total_revenue||0,false],['Loads Revenue',summary.loads_revenue||0,true],['Other Revenue',summary.other_revenue||0,true],['Driver Payments',summary.driver_payments||0,false],['Fuel',summary.fuel||0,true],['Tolls',summary.tolls||0,true],['Expenses',summary.expenses||0,false],['Gross Profit',summary.gross_profit||0,false],['Net Profit',summary.net_profit||0,false]].map(([l,v,link])=>(
                <tr key={l as string} className="hover:bg-gray-50"><td className="table-td">{l as string}</td><td className={`table-td text-right ${link?'text-brand-600':''}`}>{formatCurrency(v as number)}</td></tr>
              ))}
            </tbody>
          </table>
        </ReportCard>
      )}
    </div>
  )
}

// ─── Main ReportsPage ──────────────────────────────────────────────────────────
function EmailReports() {
  const templates = [
    ['Total Revenue', 'total-revenue'],
    ['Rate Per Mile', 'rate-per-mile'],
    ['Gross Profit', 'gross-profit'],
    ['Profit & Loss', 'profit-loss'],
  ]
  return (
    <div className="px-6 py-5">
      <h1 className="mb-1 text-xl font-bold tracking-tight text-slate-950">Email Reports</h1>
      <p className="mb-4 text-[11px] font-medium text-slate-400">Export any report as PDF or Excel and send it through your email client</p>
      <div className="max-w-2xl divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        {templates.map(([label, path]) => (
          <div key={path} className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-slate-50/60">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              </span>
              <div>
                <div className="text-xs font-bold text-slate-800">{label}</div>
                <div className="text-[10px] text-slate-400">Open report, export PDF/XLSX, then attach it through your email client.</div>
              </div>
            </div>
            <NavLink to={`../${path}`}
              className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700">
              Open
            </NavLink>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const entities = useEntities()
  const [openLoadId, setOpenLoadId] = useState<number | null>(null)
  useEffect(() => {
    const handler = (event: Event) => setOpenLoadId((event as CustomEvent<number>).detail)
    window.addEventListener('reports:open-load', handler)
    return () => window.removeEventListener('reports:open-load', handler)
  }, [])
  // Navigation between reports lives in the app sidebar (Reports submenu) —
  // no inner nav here to avoid duplicate menus.
  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex-1 overflow-auto bg-white">
        <Routes>
          <Route index element={<Navigate to="total-revenue" replace />} />
          <Route path="total-revenue" element={<TotalRevenue />} />
          <Route path="rate-per-mile" element={<RatePerMile />} />
          <Route path="revenue-by-dispatcher" element={<RevenueByDispatcher />} />
          <Route path="payment-summary" element={<PaymentSummary />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="gross-profit" element={<GrossProfit />} />
          <Route path="gross-profit-per-load" element={<GrossProfitPerLoad />} />
          <Route path="profit-loss" element={<ProfitLoss />} />
          <Route path="emails" element={<EmailReports />} />
          <Route path="*" element={<Navigate to="total-revenue" replace />} />
        </Routes>
      </div>
      {openLoadId !== null && (
        <LoadModal loadId={openLoadId} onClose={() => setOpenLoadId(null)}
          onSaved={() => {}} entities={entities} />
      )}
    </div>
  )
}
