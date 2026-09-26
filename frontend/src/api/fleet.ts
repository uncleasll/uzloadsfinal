import client from './client'

export type TruckStatus = 'active' | 'in_shop' | 'out_of_service'
export interface Assignment { id: number; driver_id: number; driver: string | null; truck_id: number; truck: string | null; start_date: string; end_date: string | null; reason: string | null; open: boolean }
export interface IdleDriver { driver_id: number; name: string; phone: string | null; reason: string; own_truck: string | null; since: string | null }

export const TRUCK_STATUS_LABEL: Record<TruckStatus, string> = { active: 'In service', in_shop: 'In shop', out_of_service: 'Out of service' }

export const fleetApi = {
  setTruckStatus: async (truckId: number, status: TruckStatus, note?: string) => (await client.put(`/api/v1/fleet/trucks/${truckId}/status`, { status, note: note || null })).data,
  idleDrivers: async (): Promise<IdleDriver[]> => (await client.get('/api/v1/fleet/idle-drivers')).data,
  assign: async (p: { driver_id: number; truck_id: number; start_date?: string; end_date?: string | null; reason?: string }): Promise<Assignment> => (await client.post('/api/v1/fleet/assignments', p)).data,
  endAssignment: async (id: number): Promise<Assignment> => (await client.post(`/api/v1/fleet/assignments/${id}/end`)).data,
  truckHistory: async (truckId: number): Promise<{ truck: string; status: TruckStatus; permanent_driver: string | null; assignments: Assignment[] }> => (await client.get(`/api/v1/fleet/trucks/${truckId}/history`)).data,
}
