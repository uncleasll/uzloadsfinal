import client from './client'

const V1 = '/api/v1'

export type StatementStatus = 'draft' | 'ready' | 'paid'
export type LineKind = 'load' | 'fee' | 'template' | 'fuel' | 'expense' | 'driver_pay' | 'driver_deduction' | 'carry_in' | 'manual'

export interface StatementSummary {
  id: number
  truck_id: number
  unit_number: string
  driver_id: number | null
  driver_name: string | null
  driver_pay_type: 'percent' | 'per_mile' | 'none' | null
  period_start: string
  period_end: string
  period: string
  status: StatementStatus
  loads: number
  miles: number
  deadhead_miles: number
  rpm: number | null
  gross: number
  fee: number
  deductions: number
  driver_pay: number
  driver_payout: number
  carry_in: number
  net: number
  odometer_start: number | null
  odometer_end: number | null
  carry_enabled: boolean
  ach_reference: string | null
  paid_at: string | null
}

export interface StatementLine {
  id: number
  kind: LineKind
  label: string
  amount: number
  load_id: number | null
  expense_id: number | null
  load: {
    load_number: number
    po_number: string | null
    driver: string | null
    dispatcher: string | null
    broker: string | null
    pickup: { city?: string; state?: string; date?: string | null } | null
    delivery: { city?: string; state?: string; date?: string | null } | null
    rate: number
    loaded_miles: number
    empty_miles: number
    total_miles: number
    rpm: number | null
    pod: boolean
  } | null
}

export interface StatementDetail extends StatementSummary {
  fee_pct: number
  notes: string | null
  lines: StatementLine[]
}

export interface WeekBoard {
  period_start: string
  period_end: string
  period: string
  rows: StatementSummary[]
  totals: { loads: number; miles: number; rpm: number | null; gross: number; fee: number; deductions: number; driver_pay: number; driver_payout: number; carry_in: number; net: number }
}

export interface Deduction {
  id?: number
  label: string
  amount: number
  effective_from?: string | null
  effective_to?: string | null
  is_active: boolean
}

export interface TruckRules {
  truck_id: number
  unit_number: string
  fee_pct: number
  carry_negative: boolean
  deductions: Deduction[]
}

export interface DriverRules {
  driver_id: number
  name: string
  pay_type: 'percent' | 'per_mile' | 'none'
  pay_pct: number
  per_mile_rate: number
  deductions: Deduction[]
}

export const weeksApi = {
  board: async (start: string): Promise<WeekBoard> => (await client.get(`${V1}/weeks/${start}`)).data,
  generate: async (start: string, truckIds?: number[]): Promise<StatementSummary[]> =>
    (await client.post(`${V1}/weeks/${start}/generate`, { truck_ids: truckIds ?? null })).data,
  truckWeek: async (start: string, truckId: number): Promise<StatementDetail> =>
    (await client.get(`${V1}/weeks/${start}/trucks/${truckId}`)).data,
  statement: async (id: number): Promise<StatementDetail> => (await client.get(`${V1}/statements/${id}`)).data,
  setOdometer: async (id: number, odometer_start: number | null, odometer_end: number | null): Promise<StatementDetail> =>
    (await client.put(`${V1}/statements/${id}/odometer`, { odometer_start, odometer_end })).data,
  setCarry: async (id: number, enabled: boolean): Promise<StatementDetail> =>
    (await client.put(`${V1}/statements/${id}/carry`, { enabled })).data,
  addLine: async (id: number, label: string, amount: number): Promise<StatementDetail> =>
    (await client.post(`${V1}/statements/${id}/lines`, { label, amount })).data,
  removeLine: async (id: number, lineId: number): Promise<StatementDetail> =>
    (await client.delete(`${V1}/statements/${id}/lines/${lineId}`)).data,
  setStatus: async (id: number, status: StatementStatus, ach_reference?: string): Promise<StatementDetail> =>
    (await client.post(`${V1}/statements/${id}/status`, { status, ach_reference })).data,
  setNotes: async (id: number, notes: string): Promise<StatementDetail> =>
    (await client.put(`${V1}/statements/${id}/notes`, { notes })).data,
  truckRules: async (truckId: number): Promise<TruckRules> => (await client.get(`${V1}/trucks/${truckId}/rules`)).data,
  saveTruckRules: async (truckId: number, rules: Omit<TruckRules, 'truck_id' | 'unit_number'>): Promise<TruckRules> =>
    (await client.put(`${V1}/trucks/${truckId}/rules`, rules)).data,
  driverRules: async (driverId: number): Promise<DriverRules> => (await client.get(`${V1}/drivers/${driverId}/rules`)).data,
  saveDriverRules: async (driverId: number, rules: Omit<DriverRules, 'driver_id' | 'name'>): Promise<DriverRules> =>
    (await client.put(`${V1}/drivers/${driverId}/rules`, rules)).data,
}

/** Saturday that starts the week containing the given ISO date. */
export function weekStart(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const back = (d.getDay() + 1) % 7 // Sat=6 → 0, Sun=0 → 1, ..., Fri=5 → 6
  d.setDate(d.getDate() - back)
  return toIso(d)
}

export function shiftWeek(start: string, weeks: number): string {
  const d = new Date(start + 'T12:00:00')
  d.setDate(d.getDate() + weeks * 7)
  return toIso(d)
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function periodLabel(start: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(s); e.setDate(e.getDate() + 6)
  const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${f(s)} – ${f(e)}, ${e.getFullYear()}`
}
