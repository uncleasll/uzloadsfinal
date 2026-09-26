import client from './client'
import type { ChatAttachment, ChatMessage } from './chat'

export interface Stop { title: string | null; address: string | null; city: string | null; state: string | null; zip: string | null; date: string | null; notes: string | null }
export interface DriverLoad {
  id: number; number: string; status: string; next_status: string | null; rate: number; miles: number; date: string | null
  broker: { name: string; phone: string | null } | null; dispatcher: string | null
  pickup: Stop | null; delivery: Stop | null; notes: string | null; pod: boolean; photos: ChatAttachment[]
}
export interface DriverHome {
  driver: { id: number; name: string; phone: string | null }
  truck: { id: number; unit_number: string; make: string | null; model: string | null; plate: string | null; status: 'active' | 'in_shop' | 'out_of_service'; status_note: string | null; temporary: boolean } | null
  current_load: DriverLoad | null
  upcoming: DriverLoad[]
  week: { period: string; loads: number; gross: number; driver_pay: number; driver_payout: number; status: string; odometer: number | null } | null
}
export interface DriverWeek {
  period: string; period_start: string; status: string; loads: number; gross: number; driver_pay: number; driver_deductions: number; driver_payout: number
  paid_at: string | null; lines: Array<{ kind: string; label: string; amount: number }>
}

export const driverApi = {
  me: async (): Promise<DriverHome> => (await client.get('/api/v1/driver/me')).data,
  loads: async (): Promise<DriverLoad[]> => (await client.get('/api/v1/driver/loads')).data,
  statement: async (): Promise<{ truck?: string; weeks: DriverWeek[] }> => (await client.get('/api/v1/driver/statement')).data,
  setStatus: async (loadId: number, p: { status: string; client_id: string; lat?: number; lng?: number; at?: string }): Promise<DriverLoad> =>
    (await client.post(`/api/v1/driver/loads/${loadId}/status`, p)).data,
  odometer: async (reading: number) => (await client.post('/api/v1/driver/odometer', { reading })).data,
  photo: async (loadId: number, form: FormData): Promise<ChatMessage> =>
    (await client.post(`/api/v1/driver/loads/${loadId}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
  inspection: async (form: FormData): Promise<ChatMessage> =>
    (await client.post('/api/v1/driver/inspections', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
  expense: async (form: FormData) => (await client.post('/api/v1/driver/expenses', form, { headers: { 'Content-Type': 'multipart/form-data' } })).data,
}
