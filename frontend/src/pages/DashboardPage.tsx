import { useEffect, useMemo, useState } from 'react'
import { driversApi, trucksApi, trailersApi, brokersApi, dispatchersApi } from '@/api/entities'
import { loadsApi } from '@/api/loads'
import { reportsApi } from '@/api/payroll'
import type { Driver, Truck, Trailer, Broker, Dispatcher, LoadListItem } from '@/types'

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0)
const money2 = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)

const IN_TRANSIT_STATUSES = new Set(['Dispatched', 'En Route', 'Picked-up'])

function localISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function thisMonthRange() {
  const now = new Date()
  return {
    from: localISO(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localISO(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  }
}

export default function DashboardPage() {
  const defaultRange = useMemo(thisMonthRange, [])
  const [loads, setLoads] = useState<LoadListItem[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [brokers, setBrokers] = useState<Broker[]>([])
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([])
  const [grossProfit, setGrossProfit] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<'overview' | 'reports'>('overview')

  // Filters
  const [dateFrom, setDateFrom] = useState(defaultRange.from)
  const [dateTo, setDateTo] = useState(defaultRange.to)
  const [driverId, setDriverId] = useState('')
  const [truckId, setTruckId] = useState('')
  const [brokerId, setBrokerId] = useState('')
  const [dispatcherId, setDispatcherId] = useState('')

  useEffect(() => {
    Promise.allSettled([
      driversApi.list(true),
      trucksApi.list(true),
      trailersApi.list(true),
      brokersApi.list(true),
      dispatchersApi.list(true),
    ]).then(([driverRes, truckRes, trailerRes, brokerRes, dispatcherRes]) => {
      if (driverRes.status === 'fulfilled') setDrivers(driverRes.value)
      if (truckRes.status === 'fulfilled') setTrucks(truckRes.value)
      if (trailerRes.status === 'fulfilled') setTrailers(trailerRes.value)
      if (brokerRes.status === 'fulfilled') setBrokers(brokerRes.value)
      if (dispatcherRes.status === 'fulfilled') setDispatchers(dispatcherRes.value)
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    const range = { date_from: dateFrom || undefined, date_to: dateTo || undefined }
    // Canceled loads are excluded from stats; everything else (incl. Paid/Closed) counts
    const fetchAllLoads = async (): Promise<LoadListItem[]> => {
      const first = await loadsApi.list({ page: 1, page_size: 100, ...range })
      const items: LoadListItem[] = first.items || []
      const totalPages = Math.min(first.total_pages || 1, 5)
      for (let p = 2; p <= totalPages; p++) {
        const next = await loadsApi.list({ page: p, page_size: 100, ...range })
        items.push(...(next.items || []))
      }
      return items.filter(l => l.status !== 'Canceled')
    }
    Promise.allSettled([
      fetchAllLoads(),
      reportsApi.grossProfit({ ...range, date_type: 'pickup' }),
    ]).then(([loadRes, gpRes]) => {
      if (loadRes.status === 'fulfilled') setLoads(loadRes.value)
      if (gpRes.status === 'fulfilled') setGrossProfit(gpRes.value)
    }).finally(() => setLoading(false))
  }, [dateFrom, dateTo])

  const hasEntityFilter = Boolean(driverId || truckId || brokerId || dispatcherId)

  const filteredLoads = useMemo(() => loads.filter(load => (
    (!driverId || String(load.driver?.id ?? '') === driverId) &&
    (!truckId || String(load.truck?.id ?? '') === truckId) &&
    (!brokerId || String(load.broker?.id ?? '') === brokerId) &&
    (!dispatcherId || String(load.dispatcher?.id ?? '') === dispatcherId)
  )), [loads, driverId, truckId, brokerId, dispatcherId])

  const resetFilters = () => {
    setDriverId(''); setTruckId(''); setBrokerId(''); setDispatcherId('')
    setDateFrom(defaultRange.from); setDateTo(defaultRange.to)
  }

  const stats = useMemo(() => {
    const source = filteredLoads
    const revenue = source.reduce((sum, load) => sum + Number(load.rate || 0), 0)
    const miles = source.reduce((sum, load) => sum + Number(load.total_miles || 0), 0)
    const emptyMiles = source.reduce((sum, load) => sum + Number(load.empty_miles || 0), 0)
    const driverPay = source.reduce((sum, load) => sum + Number(load.drivers_payable_snapshot || 0), 0)
    const apiProfit = Number(grossProfit?.summary?.gross_profit ?? grossProfit?.gross_profit ?? NaN)
    const profit = hasEntityFilter || Number.isNaN(apiProfit) ? revenue - driverPay : apiProfit
    const loadedMiles = Math.max(0, miles - emptyMiles)
    return {
      revenue,
      profit,
      cost: Math.max(0, revenue - profit),
      margin: revenue ? (profit / revenue) * 100 : 0,
      loads: source.length,
      drivers: drivers.length,
      fleet: trucks.length,
      emptyPct: miles ? (emptyMiles / miles) * 100 : 0,
      miles,
      loadedMiles,
      emptyMiles,
      rpm: miles ? revenue / miles : 0,
      rpmLoaded: loadedMiles ? revenue / loadedMiles : 0,
      cpm: miles ? Math.max(0, revenue - profit) / miles : 0,
    }
  }, [filteredLoads, drivers.length, trucks.length, grossProfit, hasEntityFilter])

  const truckOwnership = useMemo(() => {
    const counts = trucks.reduce<Record<string, number>>((acc, truck) => {
      const key = truck.ownership || 'company'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    return Object.entries(counts).map(([label, value]) => ({ label, value }))
  }, [trucks])

  const topCustomers = groupTop(filteredLoads, load => load.broker?.name || 'Unassigned')
  const topDrivers = groupTop(filteredLoads, load => load.driver?.name || 'Unassigned')
  const topDispatchers = groupTop(filteredLoads, load => load.dispatcher?.name || 'Unassigned')

  // Status analysis — derived from load statuses within the selected period
  const fleetStatus = useMemo(() => {
    const trucksInTransit = new Set<number>()
    const driversInTransit = new Set<number>()
    const trucksUsed = new Set<number>()
    const driversUsed = new Set<number>()
    const trailersUsed = new Set<number>()
    const lastLoadByTruck = new Map<number, string>()

    for (const load of loads) {
      if (load.truck?.id) {
        trucksUsed.add(load.truck.id)
        const prev = lastLoadByTruck.get(load.truck.id)
        if (!prev || load.load_date > prev) lastLoadByTruck.set(load.truck.id, load.load_date)
      }
      if (load.driver?.id) driversUsed.add(load.driver.id)
      if (load.trailer?.id) trailersUsed.add(load.trailer.id)
      if (IN_TRANSIT_STATUSES.has(load.status)) {
        if (load.truck?.id) trucksInTransit.add(load.truck.id)
        if (load.driver?.id) driversInTransit.add(load.driver.id)
      }
    }

    const today = Date.now()
    const aging = trucks
      .filter(truck => !trucksInTransit.has(truck.id))
      .map(truck => {
        const last = lastLoadByTruck.get(truck.id)
        const since = last ?? truck.created_at?.slice(0, 10)
        const days = since ? Math.max(0, Math.floor((today - new Date(since).getTime()) / 86400000)) : null
        return { unit: truck.unit_number, days }
      })
      .sort((a, b) => (b.days ?? -1) - (a.days ?? -1))
      .slice(0, 10)

    return {
      driverRows: [
        ['in_transit', driversInTransit.size],
        ['available', Math.max(0, drivers.length - driversInTransit.size)],
      ] as Array<[string, number]>,
      truckRows: [
        ['in_transit', trucksInTransit.size],
        ['available', Math.max(0, trucks.length - trucksInTransit.size)],
      ] as Array<[string, number]>,
      aging,
      utilization: {
        truck: trucks.length ? (trucksUsed.size / trucks.length) * 100 : 0,
        driver: drivers.length ? (driversUsed.size / drivers.length) * 100 : 0,
        trailer: trailers.length ? (trailersUsed.size / trailers.length) * 100 : 0,
      },
    }
  }, [loads, trucks, drivers.length, trailers.length])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">

      {/* Header */}
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-white px-4 py-4 lg:px-5">
        <div className="mr-1 flex-shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-slate-950">Dashboard</h1>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {dateFrom === defaultRange.from && dateTo === defaultRange.to ? 'This month' : 'Custom period'}
            </span>
            {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />}
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-slate-400">Live overview of revenue, fleet activity, and driver performance</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {([['overview', 'Overview'], ['reports', 'Reports']] as Array<['overview' | 'reports', string]>).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${tab === key ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="h-9 w-28 rounded-md border border-slate-200 px-2 text-[11px] shadow-sm focus:outline-none focus:border-blue-400" />
            <span className="text-gray-300">—</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="h-9 w-28 rounded-md border border-slate-200 px-2 text-[11px] shadow-sm focus:outline-none focus:border-blue-400" />
          </div>
          <button onClick={resetFilters}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500 transition hover:border-blue-200 hover:text-blue-700">
            Reset filters
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-slate-50/60">
        <div className="mx-auto max-w-[1920px] px-4 py-4">
        {tab === 'overview' && (<>

        {/* Filters */}
        <div className="mb-4 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <FilterSelect label="Dispatcher" value={dispatcherId} onChange={setDispatcherId} options={dispatchers.map(d => [String(d.id), d.name])} />
            <FilterSelect label="Driver" value={driverId} onChange={setDriverId} options={drivers.map(d => [String(d.id), d.name])} />
            <FilterSelect label="Unit Number" value={truckId} onChange={setTruckId} options={trucks.map(t => [String(t.id), t.unit_number])} />
            <FilterSelect label="Customer" value={brokerId} onChange={setBrokerId} options={brokers.map(b => [String(b.id), b.name])} />
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <Metric label="Gross Rev" value={money(stats.revenue)} tone="blue" />
            <Metric label="Gross Profit" value={money(stats.profit)} tone={stats.profit < 0 ? 'red' : 'emerald'} />
            <Metric label="Total Cost" value={money(stats.cost)} tone="slate" />
            <Metric label="Margin" value={`${stats.margin.toFixed(1)}%`} tone={stats.margin < 0 ? 'red' : 'cyan'} />
            <Metric label="Loads" value={stats.loads} tone="blue" />
            <Metric label="Drivers" value={stats.drivers} tone="slate" />
            <Metric label="Fleet Size" value={stats.fleet} tone="slate" />
            <Metric label="Empty Miles %" value={`${stats.emptyPct.toFixed(1)}%`} tone="amber" />
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.7fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Fleet Mix</h2>
              {loading && <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-400">Loading</span>}
            </div>
            <PieLegend items={truckOwnership} />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <InfoPanel rows={[
              ['Total Miles', compact(stats.miles)],
              ['Loaded Miles', compact(stats.loadedMiles)],
              ['Empty Miles', compact(stats.emptyMiles)],
            ]} />
            <InfoPanel rows={[
              ['RPM', money2(stats.rpm)],
              ['RPM (loaded)', money2(stats.rpmLoaded)],
              ['CPM', money2(stats.cpm)],
              ['Active Brokers', brokers.length],
              ['Dispatchers', dispatchers.length],
            ]} />
          </section>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <BarPanel title="Top Customers" rows={topCustomers} />
          <BarPanel title="Top Drivers" rows={topDrivers} />
          <BarPanel title="Top Dispatchers" rows={topDispatchers} />
        </div>

        {/* Fleet health */}
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-center text-sm font-bold text-slate-700">Available Trucks Aging</h2>
            {fleetStatus.aging.length === 0 ? (
              <EmptyNote text={trucks.length === 0 ? 'No trucks yet.' : 'Every truck is currently on a load.'} />
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    <th className="pb-2">Truck #</th>
                    <th className="pb-2 text-right">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {fleetStatus.aging.map(row => (
                    <tr key={row.unit} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 font-medium text-slate-700">{row.unit}</td>
                      <td className={`py-1.5 text-right font-semibold ${row.days != null && row.days > 14 ? 'text-amber-600' : 'text-slate-600'}`}>{row.days ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <StatusPanel title="Driver Status Analysis" unit="Drivers" rows={fleetStatus.driverRows} total={drivers.length} />
          <StatusPanel title="Truck Status Analysis" unit="Trucks" rows={fleetStatus.truckRows} total={trucks.length} />

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-4 text-center text-sm font-bold text-slate-700">Utilization</h2>
            <div className="space-y-4">
              <UtilizationRow label="Truck Utilization" value={fleetStatus.utilization.truck} />
              <UtilizationRow label="Driver Utilization" value={fleetStatus.utilization.driver} />
              <UtilizationRow label="Trailer Utilization" value={fleetStatus.utilization.trailer} />
            </div>
          </section>
        </div>
        </>)}
        {tab === 'reports' && <ProfitReports loads={filteredLoads} loading={loading} />}
        </div>
      </div>
    </div>
  )
}

// ─── Profit reports (Reports tab) ─────────────────────────────────────────────
type ProfitMode = 'customer' | 'unit' | 'driver'

interface ProfitRow { name: string; loads: number; miles: number; revenue: number; cost: number }

const PROFIT_MODES: Array<{ key: ProfitMode; label: string; col: string }> = [
  { key: 'customer', label: 'Profit by Customer', col: 'CUSTOMER NAME' },
  { key: 'unit',     label: 'Profit by Unit',     col: 'UNIT NUMBER' },
  { key: 'driver',   label: 'Profit by Driver',   col: 'DRIVER NAME' },
]

function ProfitReports({ loads, loading }: { loads: LoadListItem[]; loading: boolean }) {
  const [mode, setMode] = useState<ProfitMode>('customer')
  const [sortKey, setSortKey] = useState('revenue')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const rows = useMemo(() => {
    const keyFn = (load: LoadListItem) =>
      mode === 'customer' ? (load.broker?.name || '(Blank)')
      : mode === 'unit'   ? (load.truck?.unit_number || '(Blank)')
      : (load.driver?.name || '(Blank)')
    const map = new Map<string, ProfitRow>()
    for (const load of loads) {
      const name = keyFn(load)
      const row = map.get(name) || { name, loads: 0, miles: 0, revenue: 0, cost: 0 }
      row.loads += 1
      row.miles += Number(load.total_miles || 0)
      row.revenue += Number(load.rate || 0)
      row.cost += Number(load.drivers_payable_snapshot || 0)
      map.set(name, row)
    }
    return [...map.values()]
  }, [loads, mode])

  const sorted = useMemo(() => {
    const val = (r: ProfitRow): string | number => {
      switch (sortKey) {
        case 'name':    return r.name
        case 'loads':   return r.loads
        case 'miles':   return r.miles
        case 'revenue': return r.revenue
        case 'cost':    return r.cost
        case 'income':  return r.revenue - r.cost
        case 'margin':  return r.revenue ? (r.revenue - r.cost) / r.revenue : 0
        default:        return 0
      }
    }
    return [...rows].sort((a, b) => {
      const va = val(a), vb = val(b)
      const cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const sortBy = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  const totals = rows.reduce((acc, r) => ({
    loads: acc.loads + r.loads, miles: acc.miles + r.miles,
    revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost,
  }), { loads: 0, miles: 0, revenue: 0, cost: 0 })
  const totalIncome = totals.revenue - totals.cost
  const maxIncome = Math.max(...rows.map(r => Math.abs(r.revenue - r.cost)), 1)
  const nameCol = PROFIT_MODES.find(m => m.key === mode)!.col

  const COLS: Array<{ key: string; label: string; align?: 'right' }> = [
    { key: 'loads',   label: 'TOTAL LOADS' },
    { key: 'name',    label: nameCol },
    { key: 'miles',   label: 'TOTAL MILES', align: 'right' },
    { key: 'revenue', label: 'REVENUE', align: 'right' },
    { key: 'cost',    label: 'TOTAL COST', align: 'right' },
    { key: 'income',  label: 'GROSS INCOME', align: 'right' },
    { key: 'margin',  label: 'GROSS MARGIN %', align: 'right' },
  ]

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {PROFIT_MODES.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              className={`rounded-md px-3 py-1.5 text-[11px] font-semibold transition ${mode === m.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-400">{sorted.length} {mode === 'customer' ? 'customers' : mode === 'unit' ? 'units' : 'drivers'} in period · computed from loads</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
        <table className="w-full border-collapse" style={{ tableLayout: 'fixed', fontSize: 11 }}>
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '24%' }} /><col style={{ width: '11%' }} />
            <col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '16%' }} /><col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/95">
              <th className="px-1.5 py-2 text-left font-bold uppercase text-slate-500" style={{ fontSize: 10 }}>#</th>
              {COLS.map(c => (
                <th key={c.key} className={`px-1.5 py-2 font-bold uppercase text-slate-500 whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'}`} style={{ fontSize: 10 }}>
                  <button onClick={() => sortBy(c.key)} className="inline-flex items-center gap-0.5 hover:text-blue-700">
                    {c.label}
                    <span className={sortKey === c.key ? 'opacity-100 text-blue-600' : 'opacity-30'}>
                      {sortKey === c.key && sortDir === 'asc' ? '↑' : '↓'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="py-16 text-center"><div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />Loading report...</div></td></tr>
            ) : sorted.length === 0 ? (
              <tr><td colSpan={8} className="py-16 text-center"><div className="text-sm font-semibold text-slate-700">No loads in this period</div><p className="mt-1 text-xs text-slate-400">Adjust the date range or filters in the header.</p></td></tr>
            ) : sorted.map((r, i) => {
              const income = r.revenue - r.cost
              const margin = r.revenue ? (income / r.revenue) * 100 : 0
              return (
                <tr key={r.name} className="odd:bg-white even:bg-slate-50/30 transition-colors hover:bg-blue-50/70">
                  <td className="px-1.5 py-1.5 text-gray-400">{i + 1}</td>
                  <td className="px-1.5 py-1.5 font-semibold text-blue-600">{r.loads}</td>
                  <td className="px-1.5 py-1.5 font-medium text-gray-900 truncate">{r.name}</td>
                  <td className="px-1.5 py-1.5 text-right text-gray-600 whitespace-nowrap">{r.miles.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className="px-1.5 py-1.5 text-right font-semibold text-gray-900 whitespace-nowrap">{money2(r.revenue)}</td>
                  <td className="px-1.5 py-1.5 text-right text-gray-600 whitespace-nowrap">{money2(r.cost)}</td>
                  <td className="px-1.5 py-1.5">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-3 w-24 overflow-hidden rounded-sm bg-slate-100">
                        <div className={`h-full rounded-sm ${income < 0 ? 'bg-red-400' : 'bg-gradient-to-r from-brand-500 to-cyan-500'}`}
                          style={{ width: `${Math.max(3, (Math.abs(income) / maxIncome) * 100)}%` }} />
                      </div>
                      <span className={`whitespace-nowrap font-semibold ${income < 0 ? 'text-red-600' : 'text-gray-900'}`}>{money2(income)}</span>
                    </div>
                  </td>
                  <td className={`px-1.5 py-1.5 text-right font-semibold whitespace-nowrap ${margin < 0 ? 'text-red-600' : 'text-gray-700'}`}>{margin.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50/80 font-bold">
                <td className="px-1.5 py-2 text-slate-800">Total</td>
                <td className="px-1.5 py-2 text-slate-800">{totals.loads}</td>
                <td className="px-1.5 py-2" />
                <td className="px-1.5 py-2 text-right text-slate-800 whitespace-nowrap">{totals.miles.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="px-1.5 py-2 text-right text-slate-800 whitespace-nowrap">{money2(totals.revenue)}</td>
                <td className="px-1.5 py-2 text-right text-slate-800 whitespace-nowrap">{money2(totals.cost)}</td>
                <td className={`px-1.5 py-2 text-right whitespace-nowrap ${totalIncome < 0 ? 'text-red-600' : 'text-slate-800'}`}>{money2(totalIncome)}</td>
                <td className={`px-1.5 py-2 text-right whitespace-nowrap ${totalIncome < 0 ? 'text-red-600' : 'text-slate-800'}`}>{totals.revenue ? ((totalIncome / totals.revenue) * 100).toFixed(1) : '0.0'}%</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}

function groupTop(loads: LoadListItem[], getLabel: (load: LoadListItem) => string) {
  const totals = loads.reduce<Record<string, number>>((acc, load) => {
    const label = getLabel(load)
    acc[label] = (acc[label] || 0) + Number(load.rate || 0)
    return acc
  }, {})
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }))
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 shadow-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
      >
        <option value="">All</option>
        {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
      </select>
    </div>
  )
}

function Metric({ label, value, tone = 'blue' }: { label: string; value: string | number; tone?: 'blue' | 'emerald' | 'cyan' | 'amber' | 'red' | 'slate' }) {
  const tones = {
    blue: 'text-brand-700 bg-brand-50',
    emerald: 'text-emerald-700 bg-emerald-50',
    cyan: 'text-cyan-700 bg-cyan-50',
    amber: 'text-amber-700 bg-amber-50',
    red: 'text-red-700 bg-red-50',
    slate: 'text-slate-700 bg-slate-50',
  }
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
      <div className={`inline-flex min-h-8 min-w-12 items-center justify-center rounded-md px-2 text-lg font-extrabold ${tones[tone]}`}>{value}</div>
      <div className="mt-2 text-xs font-semibold text-slate-400">{label}</div>
    </div>
  )
}

function InfoPanel({ rows }: { rows: Array<[string, string | number]> }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="space-y-4">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-500">{label}:</span>
            <span className="text-base font-semibold text-slate-800">{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusPanel({ title, unit, rows, total }: { title: string; unit: string; rows: Array<[string, number]>; total: number }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-center text-sm font-bold text-slate-700">{title}</h2>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <th className="pb-2">{unit}</th>
            <th className="pb-2 text-right"># of {unit}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, count]) => (
            <tr key={label} className="border-b border-slate-100">
              <td className="py-1.5 capitalize text-slate-600">{label.replace('_', ' ')}</td>
              <td className="py-1.5 text-right font-semibold text-slate-700">{count}</td>
            </tr>
          ))}
          <tr>
            <td className="py-2 font-bold text-slate-800">Total</td>
            <td className="py-2 text-right font-bold text-slate-800">{total}</td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

function UtilizationRow({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className="font-bold text-slate-800">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-cyan-500 transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function EmptyNote({ text }: { text: string }) {
  return <div className="py-10 text-center text-xs text-slate-400">{text}</div>
}

function BarPanel({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(...rows.map(r => r.value), 1)
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 text-center text-sm font-bold text-slate-700">{title}</h2>
      {rows.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">No data yet</div>
      ) : (
        <div className="space-y-3">
          {rows.map(row => (
            <div key={row.label} className="grid grid-cols-[8rem_1fr_4rem] items-center gap-3 text-xs">
              <span className="truncate text-right text-slate-600">{row.label}</span>
              <div className="h-5 overflow-hidden rounded bg-slate-100">
                <div className="h-full rounded bg-gradient-to-r from-brand-500 to-cyan-500" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
              </div>
              <span className="text-right font-medium text-slate-500">{money(row.value)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function PieLegend({ items }: { items: Array<{ label: string; value: number }> }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  const primary = items[0]
  if (total === 0) {
    return (
      <div className="flex min-h-[16rem] flex-col items-center justify-center text-center">
        <div className="grid h-20 w-20 place-items-center rounded-full bg-slate-100 text-2xl font-bold text-slate-400">0</div>
        <p className="mt-3 text-sm font-semibold text-slate-700">No fleet data yet</p>
        <p className="mt-1 text-xs text-slate-400">Add trucks to populate the fleet mix.</p>
      </div>
    )
  }
  return (
    <div className="flex min-h-[16rem] items-center justify-center gap-8">
      <div className="grid h-48 w-48 place-items-center rounded-full bg-[conic-gradient(#2563eb_0_78%,#0ea5e9_78%_92%,#10b981_92%_100%)] shadow-inner">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center">
          <div>
            <div className="text-2xl font-bold text-slate-900">{total}</div>
            <div className="text-xs text-slate-400">Units</div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {(items.length ? items : [{ label: 'company', value: 0 }]).map((item, index) => (
          <div key={item.label} className="flex items-center gap-2 text-sm text-slate-600">
            <span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? 'bg-brand-600' : index === 1 ? 'bg-cyan-500' : 'bg-emerald-500'}`} />
            <span className="capitalize">{item.label}</span>
            <span className="font-semibold text-slate-800">{item.value}</span>
            {total > 0 && <span className="text-slate-400">({Math.round((item.value / total) * 100)}%)</span>}
          </div>
        ))}
        {primary && <p className="pt-3 text-xs text-slate-400">Largest group: {primary.label}</p>}
      </div>
    </div>
  )
}
