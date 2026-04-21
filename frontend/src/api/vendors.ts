import client from './client'

const V1 = '/api/v1'

export interface Vendor {
  id: number
  company_name: string
  vendor_type?: string
  address?: string
  address2?: string
  city?: string
  state?: string
  zip_code?: string
  phone?: string
  email?: string
  fid_ein?: string
  mc_number?: string
  notes?: string
  is_equipment_owner: boolean
  is_additional_payee: boolean
  additional_payee_rate_pct?: number
  settlement_template_type?: string
  is_active: boolean
  created_at?: string
}

export interface ScheduledTransaction {
  id: number
  driver_id: number
  trans_type: string
  category?: string
  description?: string
  amount: number
  schedule?: string
  start_date?: string
  end_date?: string
  repeat_type?: string
  repeat_times?: number
  times_applied: number
  last_applied?: string
  next_due?: string
  is_active: boolean
  payable_to?: string
  settlement_description?: string
  notes?: string
  created_at?: string
}

export const vendorsApi = {
  list: async (params: { search?: string; is_active?: boolean } = {}): Promise<Vendor[]> => {
    const { data } = await client.get(`${V1}/vendors`, { params })
    return data
  },

  get: async (id: number): Promise<Vendor> => {
    const { data } = await client.get(`${V1}/vendors/${id}`)
    return data
  },

  create: async (payload: Partial<Vendor> & { company_name: string }): Promise<Vendor> => {
    const { data } = await client.post(`${V1}/vendors`, payload)
    return data
  },

  update: async (id: number, payload: Partial<Vendor>): Promise<Vendor> => {
    const { data } = await client.put(`${V1}/vendors/${id}`, payload)
    return data
  },

  delete: async (id: number): Promise<void> => {
    await client.delete(`${V1}/vendors/${id}`)
  },
}

export const scheduledTxApi = {
  list: async (driverId: number, showInactive = false): Promise<ScheduledTransaction[]> => {
    const { data } = await client.get(
      `${V1}/drivers/${driverId}/scheduled-transactions`,
      { params: { show_inactive: showInactive } }
    )
    return data
  },

  create: async (
    driverId: number,
    payload: Omit<Partial<ScheduledTransaction>, 'id' | 'times_applied'> & { driver_id: number; trans_type: string; amount: number }
  ): Promise<ScheduledTransaction> => {
    const { data } = await client.post(
      `${V1}/drivers/${driverId}/scheduled-transactions`,
      payload
    )
    return data
  },

  update: async (
    driverId: number,
    txId: number,
    payload: Partial<ScheduledTransaction> & { driver_id: number }
  ): Promise<ScheduledTransaction> => {
    const { data } = await client.put(
      `${V1}/drivers/${driverId}/scheduled-transactions/${txId}`,
      payload
    )
    return data
  },

  delete: async (driverId: number, txId: number): Promise<void> => {
    await client.delete(`${V1}/drivers/${driverId}/scheduled-transactions/${txId}`)
  },
}
