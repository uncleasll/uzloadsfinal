import client from './client'

export interface PeriodTotals {
  trucks: number; trucks_with_loads: number; loads: number; miles: number; rpm: number | null
  gross: number; deductions: number; driver_pay: number; driver_payouts: number; net: number
}

export interface DashboardData {
  today: string
  this_week_start: string
  period: PeriodTotals & { from: string; to: string; weeks: number; label: string }
  previous: PeriodTotals
  attention: {
    statements_ready: { count: number; driver_payouts: number; net: number }
    negative_weeks: { count: number; amount: number; units: string[] }
    idle_trucks: { count: number; units: string[] }
    dispatchers_unpaid: { count: number; amount: number }
    bills: { month: string; remaining: number; unpaid_count: number; due_soon: Array<{ label: string; amount: number; due_day: number; overdue: boolean }> }
    maintenance: { due: number; soon: number; items: Array<{ unit_number: string; service_type: string; status: 'RED' | 'AMBER'; miles_left: number | null; days_left: number | null }> }
  }
  breakdown: { fee: number; fixed: number; fuel: number; expenses: number; other: number; driver_pay: number; net: number }
  brokers: Array<{ name: string; gross: number; loads: number }>
  trend: Array<{ period_start: string; label: string; in_range: boolean; gross: number; net: number; driver_pay: number; deductions: number; loads: number; miles: number; rpm: number | null }>
  top_trucks: Array<{ truck_id: number; unit_number: string; driver_name: string | null; loads: number; miles: number; gross: number; net: number; rpm: number | null; status: string }>
}

export const dashboardApi = {
  get: async (range?: { from: string; to: string }): Promise<DashboardData> =>
    (await client.get('/api/v1/dashboard', { params: range })).data,
}
