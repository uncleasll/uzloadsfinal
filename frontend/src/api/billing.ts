import client from './client'

export interface ReadyLoad { load_id: number; load_number: string; broker: string | null; broker_id: number | null; factoring_broker: boolean; driver: string | null; truck: string | null; pickup: string | null; delivery: string | null; delivered_on: string | null; pod: boolean; amount: number; rate: number }
export interface InvoiceRow {
  id: number; invoice_number: number; status: 'Pending' | 'Sent' | 'Factored' | 'Funded' | 'Paid'; channel: 'direct' | 'factoring' | null; amount: number
  invoice_date: string | null; due_date: string | null; sent_at: string | null; funded_at: string | null; paid_at: string | null
  fee_pct: number | null; fee_amount: number | null; advance_pct: number | null; advance_amount: number | null; paid_amount: number | null
  age_days: number; overdue: boolean; days_overdue: number; notes: string | null
  load_id: number; load_number: string; broker: string | null; broker_id: number | null; factoring_broker: boolean; driver: string | null; truck: string | null
  pickup: string | null; delivery: string | null; delivered_on: string | null; pod: boolean; load_status: string; billing_status: string
}
export interface BillingOverview {
  today: string
  ready: { count: number; amount: number; without_pod: number }
  drafts: { count: number; amount: number }
  outstanding: { count: number; amount: number }
  direct: { count: number; amount: number }
  at_factor: { count: number; amount: number; advance_expected: number }
  funded_waiting_reserve: { count: number; amount: number }
  overdue: { count: number; amount: number }
  aging: { '0_30': number; '31_60': number; '61_90': number; '90_plus': number }
  by_broker: Array<{ broker: string; count: number; amount: number; overdue: number }>
  settings: { payment_terms_days: number; factoring_company: string | null; factoring_fee_pct: number; factoring_advance_pct: number }
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export const billingApi = {
  overview: async (): Promise<BillingOverview> => (await client.get('/api/v1/billing/overview')).data,
  ready: async (): Promise<ReadyLoad[]> => (await client.get('/api/v1/billing/ready')).data,
  invoices: async (status?: string, brokerId?: number): Promise<InvoiceRow[]> => (await client.get('/api/v1/billing/invoices', { params: { status, broker_id: brokerId } })).data,
  create: async (loadIds: number[], send?: 'direct' | 'factoring'): Promise<InvoiceRow[]> => (await client.post('/api/v1/billing/invoices', { load_ids: loadIds, send })).data,
  send: async (id: number, channel: 'direct' | 'factoring', on?: string): Promise<InvoiceRow> => (await client.post(`/api/v1/billing/invoices/${id}/send`, { channel, on })).data,
  funded: async (id: number, amount?: number): Promise<InvoiceRow> => (await client.post(`/api/v1/billing/invoices/${id}/funded`, { amount })).data,
  paid: async (id: number, amount?: number): Promise<InvoiceRow> => (await client.post(`/api/v1/billing/invoices/${id}/paid`, { amount })).data,
  reopen: async (id: number): Promise<InvoiceRow> => (await client.post(`/api/v1/billing/invoices/${id}/reopen`)).data,
  packetUrl: (id: number) => `${API_BASE}/api/v1/billing/invoices/${id}/packet.pdf`,
  openPacket: async (id: number) => { const { data } = await client.get(`/api/v1/billing/invoices/${id}/packet.pdf`, { responseType: 'blob', timeout: 120_000 }); window.open(URL.createObjectURL(data), '_blank') },
}
