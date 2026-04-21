import client from './client'

const V1 = '/api/v1'

export const driversExtApi = {
  list: async (params: Record<string, unknown> = {}) => {
    const cleaned: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '' && v !== null) {
        cleaned[k] = v as string | number | boolean
      }
    }
    const { data } = await client.get(`${V1}/drivers/extended`, { params: cleaned })
    return data
  },

  get: async (id: number) => {
    const { data } = await client.get(`${V1}/drivers/extended/${id}`)
    return data
  },

  create: async (payload: Record<string, unknown>) => {
    const { data } = await client.post(`${V1}/drivers/extended`, payload)
    return data
  },

  update: async (id: number, payload: Record<string, unknown>) => {
    const { data } = await client.put(`${V1}/drivers/extended/${id}`, payload)
    return data
  },

  /**
   * Add a document record using JSON body — matches driver_docs.py DocCreate schema.
   * Field names map to DriverDocument columns: number, state, issue_date, etc.
   */
  addDocument: async (driverId: number, payload: {
    doc_type: string
    status?: string
    number?: string
    state?: string
    application_date?: string
    hire_date?: string
    termination_date?: string
    issue_date?: string
    exp_date?: string
    notes?: string
    name?: string
  }) => {
    const { data } = await client.post(`${V1}/drivers/${driverId}/documents`, payload)
    return data
  },

  /** Upload a file to an existing document record */
  uploadDocFile: async (driverId: number, docId: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    const { data } = await client.post(
      `${V1}/drivers/${driverId}/documents/${docId}/upload`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return data
  },

  updateDocument: async (driverId: number, docId: number, payload: Record<string, unknown>) => {
    const { data } = await client.put(`${V1}/drivers/${driverId}/documents/${docId}`, payload)
    return data
  },

  deleteDocument: async (driverId: number, docId: number) => {
    await client.delete(`${V1}/drivers/${driverId}/documents/${docId}`)
  },

  openBalance: async () => {
    const { data } = await client.get(`${V1}/drivers/open-balance`)
    return data
  },
}
