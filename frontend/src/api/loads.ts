import client from './client'
import type {
  Load,
  LoadsResponse,
  LoadFilters,
  LoadCreatePayload,
  ServiceCreatePayload,
} from '@/types'

const BASE = '/api/v1/loads'

export const loadsApi = {
  list: async (filters: LoadFilters = {}): Promise<LoadsResponse> => {
    const params: Record<string, string | number | boolean> = {}
    if (filters.search) params.search = filters.search
    if (filters.status) params.status = filters.status
    if (filters.billing_status) params.billing_status = filters.billing_status
    if (filters.driver_id) params.driver_id = filters.driver_id
    if (filters.broker_id) params.broker_id = filters.broker_id
    if (filters.truck_id) params.truck_id = filters.truck_id
    if (filters.trailer_id) params.trailer_id = filters.trailer_id
    if (filters.dispatcher_id) params.dispatcher_id = filters.dispatcher_id
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to) params.date_to = filters.date_to
    if (filters.show_only_active) params.show_only_active = true
    if (filters.direct_billing !== undefined) params.direct_billing = filters.direct_billing
    if (filters.load_number) params.load_number = filters.load_number
    params.page = filters.page || 1
    params.page_size = filters.page_size || 25
    const { data } = await client.get(BASE, { params })
    return data
  },

  get: async (id: number): Promise<Load> => {
    const { data } = await client.get(`${BASE}/${id}`)
    return data
  },

  create: async (payload: LoadCreatePayload): Promise<Load> => {
    const { data } = await client.post(BASE, payload)
    return data
  },

  update: async (id: number, payload: Partial<LoadCreatePayload>): Promise<Load> => {
    const { data } = await client.put(`${BASE}/${id}`, payload)
    return data
  },

  delete: async (id: number): Promise<void> => {
    await client.delete(`${BASE}/${id}`)
  },

  addService: async (loadId: number, payload: ServiceCreatePayload) => {
    const { data } = await client.post(`${BASE}/${loadId}/services`, payload)
    return data
  },

  deleteService: async (loadId: number, serviceId: number): Promise<void> => {
    await client.delete(`${BASE}/${loadId}/services/${serviceId}`)
  },

  addNote: async (loadId: number, content: string, author?: string) => {
    const { data } = await client.post(`${BASE}/${loadId}/notes`, { content, author })
    return data
  },

  uploadDocument: async (
    loadId: number,
    file: File,
    documentType: string,
    notes?: string
  ) => {
    const form = new FormData()
    form.append('file', file)
    form.append('document_type', documentType)
    if (notes) form.append('notes', notes)
    const { data } = await client.post(`${BASE}/${loadId}/documents`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return data
  },

  deleteDocument: async (loadId: number, docId: number): Promise<void> => {
    await client.delete(`${BASE}/${loadId}/documents/${docId}`)
  },

  getInvoicePdfUrl: (loadId: number): string => {
    const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
    return `${base}/api/v1/loads/${loadId}/invoice/pdf`
  },
}

export const loadsApiExtended = {
  recalculateDriverPay: async (loadId: number): Promise<{ drivers_payable: number }> => {
    const { data } = await client.post(`${BASE}/${loadId}/recalculate-driver-pay`)
    return data
  },
  deleteNote: async (loadId: number, noteId: number): Promise<void> => {
    await client.delete(`${BASE}/${loadId}/notes/${noteId}`)
  },
  updateNote: async (loadId: number, noteId: number, content: string): Promise<void> => {
    await client.put(`${BASE}/${loadId}/notes/${noteId}`, { content })
  },
}
