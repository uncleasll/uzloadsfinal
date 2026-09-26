import client from './client'

export interface ChatMember { user_id: number; name: string; role: string | null }
export interface ChatMemberHistory extends ChatMember { joined_at: string | null; left_at: string | null }
export interface ChatAttachment {
  id: number; category: string; url: string; original_filename: string | null; content_type: string | null; size: number | null
  width: number | null; height: number | null; taken_at: string | null; received_at: string | null; lat: number | null; lng: number | null
  stamp: string | null; truck_id: number | null; load_id: number | null
}
export interface ChatMessage {
  id: number; conversation_id: number; kind: 'text' | 'photo' | 'file' | 'voice' | 'system'; body: string | null
  sender_id: number | null; sender_name: string | null; sender_role: string | null
  client_id: string | null; client_created_at: string | null; created_at: string | null; attachments: ChatAttachment[]
}
export interface Conversation {
  id: number; kind: 'company' | 'truck' | 'load' | 'direct'; title: string; truck_id: number | null; load_id: number | null
  unread: number; last_message: ChatMessage | null; members: ChatMember[]
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export const chatApi = {
  conversations: async (): Promise<Conversation[]> => (await client.get('/api/v1/chat/conversations')).data,
  openLoadThread: async (loadId: number): Promise<{ id: number }> => (await client.post(`/api/v1/chat/conversations/load/${loadId}`)).data,
  messages: async (id: number, before?: number): Promise<ChatMessage[]> => (await client.get(`/api/v1/chat/conversations/${id}/messages`, { params: before ? { before } : {} })).data,
  members: async (id: number): Promise<ChatMemberHistory[]> => (await client.get(`/api/v1/chat/conversations/${id}/members`)).data,
  send: async (id: number, body: string, clientId: string): Promise<ChatMessage> =>
    (await client.post(`/api/v1/chat/conversations/${id}/messages`, { body, client_id: clientId, client_created_at: new Date().toISOString() })).data,
  sendFile: async (id: number, file: File, opts: { category?: string; caption?: string; clientId: string; lat?: number; lng?: number; loadId?: number }): Promise<ChatMessage> => {
    const form = new FormData()
    form.append('file', file)
    form.append('category', opts.category || (file.type.startsWith('image/') ? 'photo' : 'file'))
    form.append('client_id', opts.clientId)
    form.append('taken_at', new Date(file.lastModified || Date.now()).toISOString())
    if (opts.caption) form.append('caption', opts.caption)
    if (opts.lat != null && opts.lng != null) { form.append('lat', String(opts.lat)); form.append('lng', String(opts.lng)) }
    if (opts.loadId) form.append('load_id', String(opts.loadId))
    return (await client.post(`/api/v1/chat/conversations/${id}/attachments`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data
  },
  markRead: async (id: number) => { await client.post(`/api/v1/chat/conversations/${id}/read`) },
  toLoad: async (attachmentId: number, loadId: number, asPod: boolean, documentType = 'Other') =>
    (await client.post(`/api/v1/chat/attachments/${attachmentId}/to-load`, { load_id: loadId, as_pod: asPod, document_type: documentType })).data,
}

/** Files need the bearer token, so they are fetched and shown from an object URL. */
export async function fetchFileUrl(att: ChatAttachment): Promise<string> {
  const { data } = await client.get(att.url, { responseType: 'blob' })
  return URL.createObjectURL(data)
}

export const fileHref = (att: ChatAttachment) => `${API_BASE}${att.url}`
export const newClientId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
