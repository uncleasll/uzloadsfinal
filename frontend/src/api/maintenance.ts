import client from './client'

const V1 = '/api/v1'

export type ServiceStatus = 'RED' | 'AMBER' | 'GREEN' | 'GRAY'

export interface ServiceItem {
  service_type: string
  last_date: string | null
  last_odometer: number | null
  status: ServiceStatus
  next_due_miles: number | null
  next_due_date: string | null
  miles_left: number | null
  days_left: number | null
}

export interface MaintenanceRow {
  truck_id: number
  unit_number: string
  driver_name: string | null
  odometer: number | null
  odometer_date: string | null
  worst: ServiceStatus
  services: ServiceItem[]
}

export interface Interval { id?: number; service_type: string; miles: number; days: number; alert_miles: number; alert_days: number }

export interface MaintenanceBoard {
  today: string
  counts: Record<ServiceStatus, number>
  rows: MaintenanceRow[]
  intervals: Interval[]
}

export interface TruckHistory {
  services: Array<{ id: number; service_type: string; date: string; odometer: number | null; cost: number; vendor: string | null; notes: string | null }>
  odometer: Array<{ id: number; date: string; reading: number; source: string | null }>
}

export const maintenanceApi = {
  board: async (): Promise<MaintenanceBoard> => (await client.get(`${V1}/maintenance`)).data,
  history: async (truckId: number): Promise<TruckHistory> => (await client.get(`${V1}/maintenance/trucks/${truckId}`)).data,
  addOdometer: async (truckId: number, date: string, reading: number): Promise<TruckHistory> =>
    (await client.post(`${V1}/maintenance/trucks/${truckId}/odometer`, { date, reading, source: 'manual' })).data,
  addService: async (truckId: number, data: { service_type: string; date: string; odometer?: number | null; cost?: number; vendor?: string | null; notes?: string | null }): Promise<TruckHistory> =>
    (await client.post(`${V1}/maintenance/trucks/${truckId}/services`, data)).data,
  deleteService: async (serviceId: number): Promise<void> => { await client.delete(`${V1}/maintenance/services/${serviceId}`) },
  saveIntervals: async (items: Interval[]): Promise<Interval[]> => (await client.put(`${V1}/maintenance/intervals`, items)).data,
}

export interface CompanyMe { id: number; name: string; week_start_day: number }
export const companyApi = {
  me: async (): Promise<CompanyMe> => (await client.get(`${V1}/company/me`)).data,
  update: async (data: { name: string; week_start_day: number }): Promise<CompanyMe> => (await client.put(`${V1}/company/me`, data)).data,
}
