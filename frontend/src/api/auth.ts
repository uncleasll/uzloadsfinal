import client from './client'

export type Role = 'admin' | 'accountant' | 'dispatcher' | 'driver'

export interface AuthUser {
  id: number
  name: string
  email: string
  phone?: string | null
  role: Role
  is_active: boolean
  dispatcher_id?: number | null
  driver_id?: number | null
  company_id?: number | null
  company_name?: string | null
  last_login?: string | null
}

export interface Invitation {
  id: number; token: string; name: string; email: string; role: Role
  driver_id?: number | null; dispatcher_id?: number | null
  expires_at: string; accepted_at?: string | null; expired: boolean
}

export const ROLE_LABELS: Record<Role, string> = { admin: 'Owner', accountant: 'Accountant', dispatcher: 'Dispatcher', driver: 'Driver' }
export const isOffice = (role?: string) => role === 'admin' || role === 'accountant' || role === 'dispatcher'

type Session = { access_token: string; user: AuthUser }

export const authApi = {
  login: async (email: string, password: string): Promise<Session> => {
    const form = new URLSearchParams()
    form.append('username', email)
    form.append('password', password)
    const { data } = await client.post('/api/v1/auth/login', form, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    return data
  },
  register: async (p: { company_name: string; name: string; email: string; password: string }): Promise<Session> =>
    (await client.post('/api/v1/auth/register', p)).data,
  me: async (): Promise<AuthUser> => (await client.get('/api/v1/auth/me')).data,

  listUsers: async (): Promise<AuthUser[]> => (await client.get('/api/v1/auth/users')).data,
  updateUser: async (id: number, p: Partial<{ name: string; phone: string; role: Role; is_active: boolean; driver_id: number | null; dispatcher_id: number | null; password: string }>): Promise<AuthUser> =>
    (await client.put(`/api/v1/auth/users/${id}`, p)).data,
  deactivateUser: async (id: number) => { await client.delete(`/api/v1/auth/users/${id}`) },

  listInvitations: async (): Promise<Invitation[]> => (await client.get('/api/v1/auth/invitations')).data,
  invite: async (p: { name: string; email: string; role: Role; driver_id?: number | null; dispatcher_id?: number | null }): Promise<Invitation> =>
    (await client.post('/api/v1/auth/invitations', p)).data,
  revokeInvitation: async (id: number) => { await client.delete(`/api/v1/auth/invitations/${id}`) },
  previewInvitation: async (token: string): Promise<{ name: string; email: string; role: Role; company_name: string }> =>
    (await client.get(`/api/v1/auth/invitations/${token}/preview`)).data,
  acceptInvitation: async (token: string, p: { password: string; phone?: string }): Promise<Session> =>
    (await client.post(`/api/v1/auth/invitations/${token}/accept`, p)).data,
}

export const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`

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
