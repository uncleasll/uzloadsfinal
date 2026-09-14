import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  MapPin,
  Navigation,
  Phone,
  RefreshCw,
  Route,
  Search,
  Truck as TruckIcon,
  UserRound,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { loadsApi } from '@/api/loads'
import { driversApi, trailersApi, trucksApi } from '@/api/entities'
import type { Driver, LoadListItem, LoadStatus, Trailer, Truck } from '@/types'
import { formatCurrency, formatDate, getDeliveryStop, getPickupStop, stopLabel } from '@/utils'

const BOARD_STATUSES: LoadStatus[] = ['New', 'Dispatched', 'En Route', 'Picked-up', 'Delivered']
const ACTIVE_STATUSES = new Set<LoadStatus>(['Dispatched', 'En Route', 'Picked-up'])

const STATUS_META: Record<LoadStatus, { label: string; tone: string; dot: string }> = {
  New: { label: 'Unassigned', tone: 'border-blue-100 bg-blue-50/60 text-blue-700', dot: 'bg-blue-500' },
  Canceled: { label: 'Canceled', tone: 'border-red-100 bg-red-50 text-red-700', dot: 'bg-red-500' },
  TONU: { label: 'TONU', tone: 'border-red-100 bg-red-50 text-red-700', dot: 'bg-red-500' },
  Dispatched: { label: 'Assigned', tone: 'border-indigo-100 bg-indigo-50/70 text-indigo-700', dot: 'bg-indigo-500' },
  'En Route': { label: 'At pickup', tone: 'border-cyan-100 bg-cyan-50/70 text-cyan-700', dot: 'bg-cyan-500' },
  'Picked-up': { label: 'In transit', tone: 'border-amber-100 bg-amber-50/80 text-amber-700', dot: 'bg-amber-500' },
  Delivered: { label: 'Delivered', tone: 'border-emerald-100 bg-emerald-50/70 text-emerald-700', dot: 'bg-emerald-500' },
  Closed: { label: 'Closed', tone: 'border-slate-100 bg-slate-50 text-slate-500', dot: 'bg-slate-400' },
}

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysFrom(date?: string) {
  if (!date) return null
  const diff = Date.now() - new Date(`${date}T00:00:00`).getTime()
  return Math.floor(diff / 86400000)
}

export default function DispatchBoardPage() {
  const [loads, setLoads] = useState<LoadListItem[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [trailers, setTrailers] = useState<Trailer[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [driverId, setDriverId] = useState('')
  const [truckId, setTruckId] = useState('')
  const [trailerId, setTrailerId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const [loadRes, driverRes, truckRes, trailerRes] = await Promise.all([
        loadsApi.list({ page: 1, page_size: 100, show_only_active: true, sort_by: 'load_number', sort_dir: 'desc' }),
        driversApi.list(true),
        trucksApi.list(true),
        trailersApi.list(true),
      ])
      setLoads(loadRes.items.filter(load => load.status !== 'Canceled' && load.status !== 'TONU' && load.status !== 'Closed'))
      setDrivers(driverRes)
      setTrucks(truckRes)
      setTrailers(trailerRes)
      setSelectedId(prev => prev ?? loadRes.items[0]?.id ?? null)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to load dispatch board')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const selected = loads.find(load => load.id === selectedId) || loads[0] || null

  useEffect(() => {
    if (!selected) return
    setDriverId(String(selected.driver?.id ?? ''))
    setTruckId(String(selected.truck?.id ?? ''))
    setTrailerId(String(selected.trailer?.id ?? ''))
  }, [selected?.id])

  const filteredLoads = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return loads
    return loads.filter(load => {
      const pickup = stopLabel(getPickupStop(load.stops)).toLowerCase()
      const delivery = stopLabel(getDeliveryStop(load.stops)).toLowerCase()
      return [
        String(load.load_number),
        load.po_number,
        load.driver?.name,
        load.broker?.name,
        pickup,
        delivery,
      ].some(value => (value || '').toLowerCase().includes(needle))
    })
  }, [loads, query])

  const grouped = useMemo(() => {
    return BOARD_STATUSES.reduce<Record<LoadStatus, LoadListItem[]>>((acc, status) => {
      acc[status] = filteredLoads.filter(load => load.status === status)
      return acc
    }, {} as Record<LoadStatus, LoadListItem[]>)
  }, [filteredLoads])

  const busyDriverIds = useMemo(() => new Set(loads.filter(load => ACTIVE_STATUSES.has(load.status)).map(load => load.driver?.id).filter(Boolean)), [loads])
  const busyTruckIds = useMemo(() => new Set(loads.filter(load => ACTIVE_STATUSES.has(load.status)).map(load => load.truck?.id).filter(Boolean)), [loads])

  const stats = useMemo(() => {
    const active = loads.filter(load => ACTIVE_STATUSES.has(load.status))
    const unassigned = loads.filter(load => load.status === 'New' || !load.driver).length
    const deliveredToday = loads.filter(load => load.status === 'Delivered' && load.actual_delivery_date === todayISO()).length
    const revenue = loads.reduce((sum, load) => sum + Number(load.rate || 0), 0)
    const issues = loads.filter(load => {
      const pickupAge = daysFrom(getPickupStop(load.stops)?.stop_date || load.load_date)
      return load.status === 'New' && pickupAge !== null && pickupAge > 1
    }).length
    return { active: active.length, unassigned, deliveredToday, revenue, issues }
  }, [loads])

  const updateLoad = async (payload: Partial<{ status: LoadStatus; driver_id: number; truck_id: number; trailer_id: number }>) => {
    if (!selected) return
    setSaving(true)
    try {
      const updated = await loadsApi.update(selected.id, payload)
      setLoads(prev => prev.map(load => load.id === updated.id ? { ...load, ...updated } : load))
      toast.success(`Load #${selected.load_number} updated`)
    } catch (e) {
      toast.error((e as Error).message || 'Failed to update load')
    } finally {
      setSaving(false)
    }
  }

  const assignSelected = () => {
    updateLoad({
      status: selected?.status === 'New' ? 'Dispatched' : selected?.status,
      driver_id: driverId ? Number(driverId) : undefined,
      truck_id: truckId ? Number(truckId) : undefined,
      trailer_id: trailerId ? Number(trailerId) : undefined,
    })
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white text-[0.6875rem] shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      <div className="flex flex-shrink-0 flex-col gap-3 border-b border-slate-200/80 bg-white px-4 py-4 lg:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950">Dispatch Board</h1>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.625rem] font-bold text-slate-500">{loads.length}</span>
              {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />}
            </div>
            <p className="mt-0.5 text-[0.6875rem] font-medium text-slate-400">Assign loads, monitor live lanes, and keep equipment moving</p>
          </div>
          <div className="flex min-w-[16.25rem] flex-1 items-center justify-end gap-2">
            <div className="relative w-full max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search load, broker, driver or route..."
                className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50/70 py-2 pl-9 pr-3 text-xs text-slate-800 transition focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <button onClick={refresh} className="btn-secondary h-9 rounded-lg px-3 text-xs" disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <TopStat icon={<ClipboardList />} label="Active loads" value={stats.active} tone="blue" />
          <TopStat icon={<AlertTriangle />} label="Needs assignment" value={stats.unassigned} tone="amber" />
          <TopStat icon={<TruckIcon />} label="Available trucks" value={Math.max(0, trucks.length - busyTruckIds.size)} tone="slate" />
          <TopStat icon={<CheckCircle2 />} label="Delivered today" value={stats.deliveredToday} tone="emerald" />
          <TopStat icon={<DollarSign />} label="Open revenue" value={formatCurrency(stats.revenue)} tone="indigo" />
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden bg-slate-50/70 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-h-0 overflow-y-auto overflow-x-hidden p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {BOARD_STATUSES.map(status => (
              <section key={status} className="flex min-h-[22.5rem] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${STATUS_META[status].dot}`} />
                    <h2 className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-700">{STATUS_META[status].label}</h2>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[0.625rem] font-bold text-slate-500 ring-1 ring-slate-200">{grouped[status].length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-auto p-2">
                  {grouped[status].length ? grouped[status].map(load => (
                    <LoadCard key={load.id} load={load} active={selected?.id === load.id} onClick={() => setSelectedId(load.id)} />
                  )) : (
                    <div className="grid h-28 place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-[0.625rem] font-semibold text-slate-400">
                      No loads
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>

        <aside className="min-h-0 overflow-auto border-t border-slate-200 bg-white xl:border-l xl:border-t-0">
          {selected ? (
            <div className="flex min-h-full flex-col">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-950">Load #{selected.load_number}</h2>
                      <StatusPill status={selected.status} />
                    </div>
                    <p className="mt-1 text-[0.6875rem] font-medium text-slate-400">{selected.broker?.name || 'No broker'} · PO {selected.po_number || 'N/A'}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900">{formatCurrency(selected.rate || 0)}</div>
                    <div className="text-[0.625rem] font-semibold text-slate-400">{selected.total_miles || 0} mi</div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 p-4">
                <RoutePanel load={selected} />

                <div className="rounded-lg border border-slate-200 bg-white">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <h3 className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">Assign equipment</h3>
                  </div>
                  <div className="space-y-2 p-3">
                    <SelectRow icon={<UserRound />} label="Driver" value={driverId} onChange={setDriverId}
                      options={drivers.map(d => ({ value: d.id, label: d.name, muted: busyDriverIds.has(d.id) && d.id !== selected.driver?.id }))} />
                    <SelectRow icon={<TruckIcon />} label="Truck" value={truckId} onChange={setTruckId}
                      options={trucks.map(t => ({ value: t.id, label: `Unit ${t.unit_number}`, muted: busyTruckIds.has(t.id) && t.id !== selected.truck?.id }))} />
                    <SelectRow icon={<Route />} label="Trailer" value={trailerId} onChange={setTrailerId}
                      options={trailers.map(t => ({ value: t.id, label: `Trailer ${t.unit_number}` }))} />
                    <button onClick={assignSelected} disabled={saving} className="btn-primary mt-1 h-9 w-full rounded-lg text-xs">
                      {saving ? 'Saving...' : 'Save assignment'}
                    </button>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">Move status</div>
                  <div className="grid grid-cols-2 gap-2">
                    {BOARD_STATUSES.map(status => (
                      <button
                        key={status}
                        onClick={() => updateLoad({ status })}
                        disabled={saving || selected.status === status}
                        className={`rounded-md border px-2 py-2 text-left text-[0.6875rem] font-bold transition disabled:cursor-default disabled:opacity-60 ${selected.status === status ? STATUS_META[status].tone : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50'}`}
                      >
                        {STATUS_META[status].label}
                      </button>
                    ))}
                  </div>
                </div>

                <DriverStack drivers={drivers} busyIds={busyDriverIds} loads={loads} />
              </div>
            </div>
          ) : (
            <div className="grid h-full min-h-[22.5rem] place-items-center p-8 text-center">
              <div>
                <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-xs font-semibold text-slate-500">No active loads to dispatch</p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

function TopStat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: 'blue' | 'amber' | 'slate' | 'emerald' | 'indigo' }) {
  const tones = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    slate: 'bg-slate-50 text-slate-700 ring-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  }
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 [&>svg]:h-4 [&>svg]:w-4 ${tones[tone]}`}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[0.625rem] font-bold uppercase tracking-wide text-slate-400">{label}</span>
        <span className="block truncate text-sm font-bold text-slate-950">{value}</span>
      </span>
    </div>
  )
}

function LoadCard({ load, active, onClick }: { load: LoadListItem; active: boolean; onClick: () => void }) {
  const pickup = getPickupStop(load.stops)
  const delivery = getDeliveryStop(load.stops)
  const age = daysFrom(pickup?.stop_date || load.load_date)
  const stale = load.status === 'New' && age !== null && age > 1
  return (
    <button onClick={onClick} className={`w-full rounded-lg border bg-white p-3 text-left shadow-sm transition ${active ? 'border-blue-300 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-200 hover:shadow-md'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-slate-950">#{load.load_number}</span>
            {stale && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
          </div>
          <div className="mt-0.5 truncate text-[0.625rem] font-semibold text-slate-400">{load.broker?.name || 'No broker'}</div>
        </div>
        <div className="text-right text-[0.625rem] font-bold text-slate-700">{formatCurrency(load.rate || 0)}</div>
      </div>
      <div className="mt-3 space-y-1.5">
        <RouteLine icon={<MapPin />} label={stopLabel(pickup)} />
        <RouteLine icon={<Navigation />} label={stopLabel(delivery)} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        <span className="truncate text-[0.625rem] font-semibold text-slate-500">{load.driver?.name || 'Unassigned'}</span>
        <span className="text-[0.625rem] font-bold text-slate-400">{formatDate(load.load_date)}</span>
      </div>
    </button>
  )
}

function RouteLine({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="flex min-w-0 items-center gap-1.5 text-[0.625rem] font-semibold text-slate-600 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:shrink-0 [&>svg]:text-slate-400"><>{icon}</><span className="truncate">{label}</span></div>
}

function StatusPill({ status }: { status: LoadStatus }) {
  const meta = STATUS_META[status]
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.625rem] font-bold ${meta.tone}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
}

function RoutePanel({ load }: { load: LoadListItem }) {
  const pickup = getPickupStop(load.stops)
  const delivery = getDeliveryStop(load.stops)
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">Route</div>
        <span className="inline-flex items-center gap-1 text-[0.625rem] font-bold text-slate-400"><CalendarClock className="h-3 w-3" />{formatDate(load.load_date)}</span>
      </div>
      <div className="space-y-3">
        <StopBlock label="Pickup" value={stopLabel(pickup)} date={pickup?.stop_date} />
        <div className="ml-3 flex items-center gap-2 text-slate-300"><span className="h-5 border-l border-dashed border-slate-300" /><ArrowRight className="h-3.5 w-3.5" /></div>
        <StopBlock label="Delivery" value={stopLabel(delivery)} date={delivery?.stop_date || load.actual_delivery_date} />
      </div>
    </div>
  )
}

function StopBlock({ label, value, date }: { label: string; value: string; date?: string }) {
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-white text-blue-600 ring-1 ring-slate-200"><MapPin className="h-3.5 w-3.5" /></span>
      <div className="min-w-0">
        <div className="text-[0.625rem] font-bold uppercase tracking-wide text-slate-400">{label}</div>
        <div className="truncate text-xs font-bold text-slate-800">{value}</div>
        {date && <div className="text-[0.625rem] font-semibold text-slate-400">{formatDate(date)}</div>}
      </div>
    </div>
  )
}

function SelectRow({ icon, label, value, onChange, options }: { icon: React.ReactNode; label: string; value: string; onChange: (value: string) => void; options: { value: number; label: string; muted?: boolean }[] }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-wide text-slate-400 [&>svg]:h-3 [&>svg]:w-3">{icon}{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100">
        <option value="">Choose {label.toLowerCase()}</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}{option.muted ? ' · busy' : ''}</option>)}
      </select>
    </label>
  )
}

function DriverStack({ drivers, busyIds, loads }: { drivers: Driver[]; busyIds: Set<number | undefined>; loads: LoadListItem[] }) {
  const rows = drivers.slice(0, 8).map(driver => {
    const activeLoad = loads.find(load => load.driver?.id === driver.id && ACTIVE_STATUSES.has(load.status))
    return { driver, activeLoad }
  })
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <h3 className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">Driver availability</h3>
        <span className="text-[0.625rem] font-bold text-slate-400">{drivers.length - busyIds.size} free</span>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map(({ driver, activeLoad }) => (
          <div key={driver.id} className="flex items-center gap-2 px-3 py-2">
            <span className={`h-2 w-2 rounded-full ${activeLoad ? 'bg-cyan-500' : 'bg-emerald-500'}`} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.6875rem] font-bold text-slate-800">{driver.name}</div>
              <div className="truncate text-[0.625rem] font-semibold text-slate-400">{activeLoad ? `On load #${activeLoad.load_number}` : 'Available now'}</div>
            </div>
            {driver.phone && <Phone className="h-3.5 w-3.5 text-slate-300" />}
          </div>
        ))}
      </div>
    </div>
  )
}
