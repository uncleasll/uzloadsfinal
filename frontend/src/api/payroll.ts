import client from './client'

const BASE = '/api/v1/payroll'

export const payrollApi = {
  list: async (params: Record<string, string | number> = {}) => {
    const { data } = await client.get(BASE, { params })
    return data
  },
  get: async (id: number) => {
    const { data } = await client.get(`${BASE}/${id}`)
    return data
  },
  create: async (payload: Record<string, unknown>) => {
    const { data } = await client.post(BASE, payload)
    return data
  },
  update: async (id: number, payload: Record<string, unknown>) => {
    const { data } = await client.put(`${BASE}/${id}`, payload)
    return data
  },
  delete: async (id: number) => { await client.delete(`${BASE}/${id}`) },

  // Open balances
  getOpenBalances: async (params: {
    driver_id?: number
    date_from?: string
    date_to?: string
    date_type?: string
  } = {}) => {
    const { data } = await client.get(`${BASE}/open-balances`, { params })
    return data as OpenBalance[]
  },

  // Items
  addLoadItem: async (settlementId: number, loadId: number) => {
    const { data } = await client.post(`${BASE}/${settlementId}/items/load/${loadId}`)
    return data
  },
  removeItem: async (settlementId: number, itemId: number) => {
    await client.delete(`${BASE}/${settlementId}/items/${itemId}`)
  },

  // Adjustments
  addAdjustment: async (settlementId: number, payload: {
    adj_type: string; date?: string; category?: string; description?: string; amount: number
  }) => {
    const { data } = await client.post(`${BASE}/${settlementId}/adjustments`, payload)
    return data
  },
  deleteAdjustment: async (settlementId: number, adjId: number) => {
    await client.delete(`${BASE}/${settlementId}/adjustments/${adjId}`)
  },

  // Payments
  addPayment: async (settlementId: number, payload: {
    payment_number?: string; description?: string; amount: number;
    payment_date?: string; is_carryover?: boolean
  }) => {
    const { data } = await client.post(`${BASE}/${settlementId}/payments`, payload)
    return data
  },
  deletePayment: async (settlementId: number, paymentId: number) => {
    await client.delete(`${BASE}/${settlementId}/payments/${paymentId}`)
  },

  // ── Status transition ────────────────────────────────────────────────────────
  changeStatus: async (settlementId: number, newStatus: string) => {
    const { data } = await client.post(`${BASE}/${settlementId}/status`, { status: newStatus })
    return data
  },

  // ── Candidates (unpaid loads + scheduled + unapplied advanced payments) ─────
  getCandidates: async (settlementId: number, params?: { date_from?: string; date_to?: string }) => {
    const { data } = await client.get(`${BASE}/${settlementId}/candidates`, { params })
    return data as {
      available_loads: Array<{
        id: number; load_number: number; load_date?: string; delivery_date?: string
        status?: string; billing_status?: string; rate?: number; amount: number
      }>
      scheduled_transactions: Array<{
        id: number; trans_type: string; category?: string; description?: string
        amount: number; schedule?: string; next_due?: string
      }>
      advanced_payments: Array<{
        id: number; payment_number: number; payment_date?: string; amount: number
        applied_amount: number; remaining: number; description?: string; category?: string
      }>
    }
  },

  // ── Advanced payment apply/remove ───────────────────────────────────────────
  applyAdvancedPayment: async (settlementId: number, apId: number, amount?: number) => {
    const { data } = await client.post(`${BASE}/${settlementId}/advanced-payments/${apId}/apply`,
      amount !== undefined ? { amount } : {})
    return data
  },
  removeAdvancedPayment: async (settlementId: number, adjId: number) => {
    await client.delete(`${BASE}/${settlementId}/advanced-payments/${adjId}`)
  },

  // ── Apply scheduled transaction ─────────────────────────────────────────────
  applyScheduled: async (settlementId: number, txId: number) => {
    const { data } = await client.post(`${BASE}/${settlementId}/scheduled/${txId}/apply`)
    return data
  },

  // QB export
  exportQB: async (settlementId: number) => {
    const { data } = await client.post(`${BASE}/${settlementId}/export-qb`)
    return data
  },

  // PDF
  getPdfUrl: (id: number): string => {
    const base = import.meta.env.VITE_API_BASE_URL || ''
    return `${base}/api/v1/payroll/${id}/pdf`
  },
}

export interface OpenBalance {
  driver_id: number
  driver_name: string
  driver_type: string
  payable_to: string
  balance: number
  last_load_date?: string
  updated?: string
}

export interface SettlementItem {
  id: number
  load_id?: number
  item_type: string
  description?: string
  amount: number
  load_date?: string
  load_status?: string
  load_billing_status?: string
  load_pickup_city?: string
  load_delivery_city?: string
  amount_snapshot?: number
  load?: {
    load_number: number
    status?: string
    billing_status?: string
    actual_delivery_date?: string
    load_date?: string
  }
}

export interface SettlementAdjustment {
  id: number
  adj_type: string
  date?: string
  category?: string
  description?: string
  amount: number
  created_at?: string
}

export interface SettlementPayment {
  id: number
  payment_number?: string
  description?: string
  amount: number
  payment_date?: string
  is_carryover?: boolean
  created_at?: string
}

export interface SettlementHistory {
  id: number
  description: string
  author?: string
  created_at?: string
}

export interface Settlement {
  id: number
  settlement_number: number
  date: string
  payable_to: string
  driver_id: number
  driver?: { id: number; name: string; driver_type: string }
  settlement_total: number
  balance_due: number
  status: string
  notes?: string
  qb_exported: boolean
  qb_exported_at?: string
  items: SettlementItem[]
  adjustments: SettlementAdjustment[]
  payments: SettlementPayment[]
  history: SettlementHistory[]
}

function _clean(p: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== '' && v !== null) out[k] = v as string | number | boolean
  }
  return out
}

export const reportsApi = {
  totalRevenue: async (p: Record<string, unknown>) => {
    const { data } = await client.get('/api/v1/reports/total-revenue', { params: _clean(p) }); return data
  },
  ratePerMile: async (p: Record<string, unknown>) => {
    const { data } = await client.get('/api/v1/reports/rate-per-mile', { params: _clean(p) }); return data
  },
  revenueByDispatcher: async (p: Record<string, unknown>) => {
    const { data } = await client.get('/api/v1/reports/revenue-by-dispatcher', { params: _clean(p) }); return data
  },
  paymentSummary: async (p: Record<string, unknown>) => {
    const { data } = await client.get('/api/v1/reports/payment-summary', { params: _clean(p) }); return data
  },
  expenses: async (p: Record<string, unknown>) => {
    const { data } = await client.get('/api/v1/reports/expenses', { params: _clean(p) }); return data
  },
  grossProfit: async (p: Record<string, unknown>) => {
    const { data } = await client.get('/api/v1/reports/gross-profit', { params: _clean(p) }); return data
  },
  grossProfitPerLoad: async (p: Record<string, unknown>) => {
    const { data } = await client.get('/api/v1/reports/gross-profit-per-load', { params: _clean(p) }); return data
  },
  profitLoss: async (p: Record<string, unknown>) => {
    const { data } = await client.get('/api/v1/reports/profit-loss', { params: _clean(p) }); return data
  },
}
