import client from './client'

export interface ExpiringDoc { kind: 'driver' | 'truck' | 'trailer'; owner_id: number; owner: string; document: string; exp_date: string; days_left: number; status: 'expired' | 'soon'; link: string }
export interface IftaWorksheet {
  year: number; quarter: number; from: string; to: string
  totals: { miles: number; gallons: number; cost: number; mpg: number | null; unknown_state_gallons: number; unknown_state_receipts: number }
  states: Array<{ state: string; miles: number; gallons: number; cost: number; taxable_gallons: number | null; net_gallons: number | null }>
  trucks: Array<{ truck_id: number; unit_number: string; ifta_miles: number; load_miles: number; states: Record<string, number> }>
}

export const complianceApi = {
  expiring: async (days = 30): Promise<ExpiringDoc[]> => (await client.get('/api/v1/compliance/expiring', { params: { days } })).data,
  iftaCurrent: async (): Promise<{ year: number; quarter: number }> => (await client.get('/api/v1/ifta/current')).data,
  ifta: async (year: number, quarter: number): Promise<IftaWorksheet> => (await client.get(`/api/v1/ifta/${year}/${quarter}`)).data,
  setIftaMiles: async (year: number, quarter: number, truckId: number, miles: Record<string, number>): Promise<IftaWorksheet> => (await client.put(`/api/v1/ifta/${year}/${quarter}/trucks/${truckId}`, { miles })).data,
}
