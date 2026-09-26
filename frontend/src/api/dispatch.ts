import client from './client'

export interface BoardStop { title: string | null; city: string | null; state: string | null; date: string | null }
export interface BoardLoad {
  id: number; number: string; status: string; rate: number; miles: number; date: string | null; broker: string | null
  dispatcher: string | null; dispatcher_id: number | null; driver: string | null; truck_id: number | null
  pickup: BoardStop | null; delivery: BoardStop | null; next_stop: BoardStop | null; pod: boolean
}
export interface BoardTruck {
  truck_id: number; unit_number: string; driver: string | null; driver_id: number | null
  state: 'free' | 'no_driver' | 'in_shop' | 'out_of_service' | 'New' | 'Dispatched' | 'En Route' | 'Picked-up'
  temporary_driver: boolean; truck_status: 'active' | 'in_shop' | 'out_of_service'; status_note: string | null
  current_load: BoardLoad | null; queued: BoardLoad[]; conversation_id: number | null
  last_activity: string | null; last_activity_text: string | null
  last_position: { lat: number; lng: number; at: string } | null
}
export interface Board { today: string; trucks: BoardTruck[]; unassigned: BoardLoad[]; idle_drivers: import('./fleet').IdleDriver[]; counts: { free: number; on_load: number; no_driver: number; down: number; unassigned: number; idle_drivers: number } }

export const dispatchApi = {
  board: async (): Promise<Board> => (await client.get('/api/v1/dispatch/board')).data,
  myWeek: async (start?: string) => (await client.get('/api/v1/dispatch/my-week', { params: start ? { start } : {} })).data as { period: string; period_start: string; rows: Array<{ dispatcher_id: number; name: string; commission_type: string; commission_value: number; loads: number; trucks: string[]; gross: number; commission: number; paid: boolean; paid_amount: number | null; paid_at: string | null }> },
}
