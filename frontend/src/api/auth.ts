import client from './client'

export interface AuthUser {
  id: number
  name: string
  email: string
  role: string
  is_active: boolean
  dispatcher_id?: number
}

export const authApi = {
  login: async (email: string, password: string): Promise<{ access_token: string; user: AuthUser }> => {
    const form = new URLSearchParams()
    form.append('username', email)
    form.append('password', password)
    const { data } = await client.post('/api/v1/auth/login', form, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return data
  },
  me: async (): Promise<AuthUser> => {
    const { data } = await client.get('/api/v1/auth/me')
    return data
  },
  listUsers: async (): Promise<AuthUser[]> => {
    const { data } = await client.get('/api/v1/auth/users')
    return data
  },
  createUser: async (p: { name: string; email: string; password: string; role: string; dispatcher_id?: number }): Promise<AuthUser> => {
    const { data } = await client.post('/api/v1/auth/users', p)
    return data
  },
  updateUser: async (id: number, p: Partial<{ name: string; email: string; password: string; role: string; is_active: boolean }>): Promise<AuthUser> => {
    const { data } = await client.put(`/api/v1/auth/users/${id}`, p)
    return data
  },
  deleteUser: async (id: number) => { await client.delete(`/api/v1/auth/users/${id}`) },
}

export const driverDocsApi = {
  list: async (driverId: number) => { const { data } = await client.get(`/api/v1/drivers/${driverId}/documents`); return data },
  create: async (driverId: number, p: Record<string, unknown>) => { const { data } = await client.post(`/api/v1/drivers/${driverId}/documents`, p); return data },
  update: async (driverId: number, docId: number, p: Record<string, unknown>) => { const { data } = await client.put(`/api/v1/drivers/${driverId}/documents/${docId}`, p); return data },
  delete: async (driverId: number, docId: number) => { await client.delete(`/api/v1/drivers/${driverId}/documents/${docId}`) },
  uploadFile: async (driverId: number, docId: number, file: File) => {
    const form = new FormData(); form.append('file', file)
    const { data } = await client.post(`/api/v1/drivers/${driverId}/documents/${docId}/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
    return data
  },
}
