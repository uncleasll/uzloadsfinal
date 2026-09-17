import client from './client'

export interface DashboardData {
  today: string
  this_week: {
    period: string; period_start: string; period_end: string
    trucks: number; trucks_with_loads: number; loads: number; miles: number; rpm: number | null
    gross: number; deductions: number; driver_pay: number; driver_payouts: number; net: number
  }
  last_week: { gross: number; net: number; loads: number }
  attention: {
    statements_ready: { count: number; driver_payouts: number; net: number }
    negative_weeks: { count: number; amount: number; units: string[] }
    idle_trucks: { count: number; units: string[] }
    dispatchers_unpaid: { count: number; amount: number }
    bills: { month: string; remaining: number; unpaid_count: number; due_soon: Array<{ label: string; amount: number; due_day: number; overdue: boolean }> }
    maintenance: { due: number; soon: number; items: Array<{ unit_number: string; service_type: string; status: 'RED' | 'AMBER'; miles_left: number | null; days_left: number | null }> }
  }
  trend: Array<{ period_start: string; label: string; gross: number; net: number }>
  top_trucks: Array<{ truck_id: number; unit_number: string; driver_name: string | null; loads: number; gross: number; net: number; rpm: number | null; status: string }>
}

export const dashboardApi = {
  get: async (): Promise<DashboardData> => (await client.get('/api/v1/dashboard')).data,
}
