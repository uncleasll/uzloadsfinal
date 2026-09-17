import client from './client'

const V1 = '/api/v1'

export interface DispatcherWeekRow {
  dispatcher_id: number
  name: string
  commission_type: 'pct' | 'flat'
  commission_value: number
  loads: number
  trucks: string[]
  gross: number
  commission: number
  paid: boolean
  paid_amount: number | null
  paid_at: string | null
}

export interface DispatcherWeek {
  period_start: string
  period_end: string
  period: string
  rows: DispatcherWeekRow[]
  totals: { gross: number; commission: number; paid: number; loads: number }
}

export interface DispatcherRules { dispatcher_id: number; name: string; commission_type: 'pct' | 'flat'; commission_value: number }

export interface Bill {
  id: number
  label: string
  vendor: string | null
  amount: number
  due_day: number
  account: string | null
  truck_id: number | null
  truck_unit: string | null
  notes: string | null
  is_active: boolean
  paid: boolean
  paid_amount: number | null
  paid_at: string | null
}

export interface BillInput { label: string; vendor?: string | null; amount: number; due_day: number; account?: string | null; truck_id?: number | null; notes?: string | null; is_active?: boolean }

export interface BillsMonth {
  month: string
  rows: Bill[]
  totals: { due: number; paid: number; remaining: number; count: number; paid_count: number }
}

export const officeApi = {
  dispatcherWeek: async (start: string): Promise<DispatcherWeek> => (await client.get(`${V1}/weeks/${start}/dispatchers`)).data,
  setDispatcherPaid: async (start: string, id: number, paid: boolean, amount?: number): Promise<DispatcherWeekRow> =>
    (await client.post(`${V1}/weeks/${start}/dispatchers/${id}/paid`, { paid, amount })).data,
  dispatcherRules: async (id: number): Promise<DispatcherRules> => (await client.get(`${V1}/dispatchers/${id}/rules`)).data,
  saveDispatcherRules: async (id: number, rules: Pick<DispatcherRules, 'commission_type' | 'commission_value'>): Promise<DispatcherRules> =>
    (await client.put(`${V1}/dispatchers/${id}/rules`, rules)).data,

  bills: async (includeInactive = false): Promise<Bill[]> => (await client.get(`${V1}/bills`, { params: { include_inactive: includeInactive } })).data,
  billsMonth: async (month: string): Promise<BillsMonth> => (await client.get(`${V1}/bills/month/${month}`)).data,
  createBill: async (data: BillInput): Promise<Bill> => (await client.post(`${V1}/bills`, data)).data,
  updateBill: async (id: number, data: BillInput): Promise<Bill> => (await client.put(`${V1}/bills/${id}`, data)).data,
  archiveBill: async (id: number): Promise<void> => { await client.delete(`${V1}/bills/${id}`) },
  payBill: async (id: number, month: string, amount?: number): Promise<Bill> => (await client.post(`${V1}/bills/${id}/pay`, { month, amount })).data,
  unpayBill: async (id: number, month: string): Promise<Bill> => (await client.delete(`${V1}/bills/${id}/pay/${month}`)).data,
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  return monthKey(new Date(y, m - 1 + n, 1))
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
