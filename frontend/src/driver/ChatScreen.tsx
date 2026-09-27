import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Send, Truck, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { chatApi, fetchFileUrl, type ChatAttachment, type ChatMessage, type Conversation } from '@/api/chat'
import { useAuth } from '@/hooks/useAuth'
import { Header } from './shared'
import { enqueue, newId } from './outbox'
import { shrinkPhoto, whereAmI } from './geo'
import { usePending } from './DriverApp'

const POLL_MS = 6000

export default function ChatScreen() {
  return <Routes><Route index element={<List />} /><Route path=":id" element={<Thread />} /></Routes>
}

function List() {
  const [convs, setConvs] = useState<Conversation[]>([])
  const load = useCallback(() => chatApi.conversations().then(setConvs).catch(() => {}), [])
  useEffect(() => { load(); const t = setInterval(load, POLL_MS); return () => clearInterval(t) }, [load])
  return (
    <div className="space-y-3 p-3">
      <Header title="Chat" sub="Your truck's group and the company" />
      <div className="space-y-2">
        {convs.map(c => (
          <Link key={c.id} to={`/driver/chat/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${c.kind === 'company' ? 'bg-slate-100 text-slate-600' : 'bg-[var(--accent-soft)] text-[var(--accent)]'}`}>{c.kind === 'company' ? <Users className="h-5 w-5" /> : <Truck className="h-5 w-5" />}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between"><span className="truncate text-sm font-bold text-slate-900">{c.title}</span>{c.unread > 0 && <span className="rounded-full bg-[var(--accent)] px-1.5 text-[0.625rem] font-bold text-white">{c.unread}</span>}</span>
              <span className="block truncate text-xs text-slate-500">{c.last_message ? `${c.last_message.sender_name ? c.last_message.sender_name.split(' ')[0] + ': ' : ''}${c.last_message.kind === 'photo' ? '📷 ' : ''}${c.last_message.body || 'Photo'}` : 'No messages yet'}</span>
            </span>
          </Link>
        ))}
        {convs.length === 0 && <p className="p-6 text-center text-sm text-slate-400">No conversations yet.</p>}
      </div>
    </div>
  )
}

function Thread() {
  const { id } = useParams()
  const convId = Number(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const [conv, setConv] = useState<Conversation | null>(null)
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const pending = usePending().filter(j => j.kind === 'message' && j.url.includes(`/conversations/${convId}/`))
  const bottom = useRef<HTMLDivElement>(null)

  const refresh = useCallback(async () => {
    try {
      const [cs, ms] = await Promise.all([chatApi.conversations(), chatApi.messages(convId)])
      setConv(cs.find(c => c.id === convId) || null); setMsgs(ms)
      chatApi.markRead(convId).catch(() => {})
    } catch { /* offline */ }
  }, [convId])
  useEffect(() => { refresh(); const t = setInterval(refresh, POLL_MS); return () => clearInterval(t) }, [refresh])
  useEffect(() => { bottom.current?.scrollIntoView() }, [msgs.length, pending.length])

  const send = async () => {
    const body = text.trim(); if (!body) return
    setText('')
    await enqueue({ id: newId(), kind: 'message', url: `/api/v1/chat/conversations/${convId}/messages`, label: 'Message', json: { body, client_created_at: new Date().toISOString() } })
    setTimeout(refresh, 800)
  }
  const photo = async (f: File | undefined) => {
    if (!f) return
    const [pos, blob] = await Promise.all([whereAmI(), shrinkPhoto(f)])
    await enqueue({ id: newId(), kind: 'message', url: `/api/v1/chat/conversations/${convId}/attachments`, label: 'Photo',
      fields: { category: 'photo', taken_at: new Date(f.lastModified || Date.now()).toISOString(), ...(pos ? { lat: String(pos.lat), lng: String(pos.lng) } : {}) },
      files: [{ field: 'file', name: f.name || 'photo.jpg', type: blob.type || 'image/jpeg', blob }] })
    toast.success(navigator.onLine ? 'Photo sent' : 'Photo saved, will send when online')
    setTimeout(refresh, 1500)
  }

  return (
    <div className="flex h-full flex-col">
      <Header title={conv?.title || 'Chat'} sub={conv?.members.map(m => m.name.split(' ')[0]).join(', ')} action={<button onClick={() => navigate('/driver/chat')} aria-label="Back" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500"><ArrowLeft className="h-4 w-4" /></button>} />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {msgs.map(m => <Bubble key={m.id} m={m} mine={m.sender_id === user?.id} />)}
        {pending.map(j => <div key={j.id} className="mb-1.5 flex justify-end"><div className="max-w-[80%] rounded-2xl rounded-br-md bg-[var(--accent)]/60 px-3 py-2 text-sm text-white">{j.json?.body as string || j.label}<div className="text-right text-[0.625rem] text-white/80">waiting to send</div></div></div>)}
        <div ref={bottom} />
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl bg-slate-100 text-slate-600"><Camera className="h-5 w-5" /><input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => photo(e.target.files?.[0])} /></label>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message…" className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-3 text-sm" />
        <button onClick={send} disabled={!text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-white disabled:opacity-40"><Send className="h-5 w-5" /></button>
      </div>
    </div>
  )
}

function Bubble({ m, mine }: { m: ChatMessage; mine: boolean }) {
  if (m.kind === 'system') return <div className="my-2 text-center text-[0.6875rem] text-slate-400">{m.body}</div>
  return (
    <div className={`mb-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? 'rounded-br-md bg-[var(--accent)] text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
        {!mine && <div className="mb-0.5 text-[0.6875rem] font-bold text-[var(--accent)]">{m.sender_name}</div>}
        {m.attachments.map(a => <Photo key={a.id} a={a} />)}
        {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
        <div className={`mt-0.5 text-right text-[0.625rem] ${mine ? 'text-white/70' : 'text-slate-400'}`}>{m.created_at ? new Date(m.created_at + (m.created_at.endsWith('Z') ? '' : 'Z')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}</div>
      </div>
    </div>
  )
}

function Photo({ a }: { a: ChatAttachment }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => { let u: string | null = null; if ((a.content_type || '').startsWith('image/')) fetchFileUrl(a).then(x => { u = x; setSrc(x) }).catch(() => {}); return () => { if (u) URL.revokeObjectURL(u) } }, [a])
  if (!(a.content_type || '').startsWith('image/')) return <div className="mb-1 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700">{a.original_filename}</div>
  return src ? <img src={src} alt={a.category} onClick={() => window.open(src, '_blank')} className="mb-1 max-h-64 rounded-lg" /> : <div className="mb-1 h-32 w-44 rounded-lg bg-slate-100" />
}
