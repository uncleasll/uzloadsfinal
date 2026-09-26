import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Image as ImageIcon, MapPin, Paperclip, Send, Truck, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { chatApi, fetchFileUrl, newClientId, type ChatAttachment, type ChatMessage, type Conversation } from '@/api/chat'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_LABELS, type Role } from '@/api/auth'
import { control } from '@/components/ui/Field'

const POLL_MS = 5000

/** Office chat: every truck group, the company channel, and load threads. Same data the driver app talks to. */
export default function ChatPage() {
  const { user } = useAuth()
  const [convs, setConvs] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [filter, setFilter] = useState('')

  const loadConvs = useCallback(async () => {
    try {
      const list = await chatApi.conversations()
      setConvs(list)
      setActiveId(a => a ?? list[0]?.id ?? null)
    } catch (e) { toast.error((e as Error).message) }
  }, [])
  useEffect(() => { loadConvs(); const t = setInterval(loadConvs, POLL_MS); return () => clearInterval(t) }, [loadConvs])

  const active = useMemo(() => convs.find(c => c.id === activeId) || null, [convs, activeId])
  const visible = useMemo(() => convs.filter(c => !filter || c.title.toLowerCase().includes(filter.toLowerCase())), [convs, filter])

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white text-xs shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_30px_rgba(15,23,42,0.04)]">
      {/* Conversation list */}
      <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200">
        <div className="border-b border-slate-200 px-3 py-3">
          <h1 className="text-lg font-bold tracking-tight text-slate-950">Chat</h1>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Find a truck or load…" className={`${control} mt-2 h-8`} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.map(c => (
            <button key={c.id} onClick={() => setActiveId(c.id)}
              className={`flex w-full items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition ${c.id === activeId ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${c.kind === 'company' ? 'bg-slate-100 text-slate-600' : c.kind === 'load' ? 'bg-amber-50 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                {c.kind === 'company' ? <Users className="h-4 w-4" /> : c.kind === 'load' ? <FileText className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate ${c.unread ? 'font-bold text-slate-900' : 'font-semibold text-slate-800'}`}>{c.title}</span>
                  {c.last_message?.created_at && <span className="shrink-0 text-[0.625rem] text-slate-400">{timeAgo(c.last_message.created_at)}</span>}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate text-[0.6875rem] text-slate-500">{preview(c.last_message)}</span>
                  {c.unread > 0 && <span className="shrink-0 rounded-full bg-blue-600 px-1.5 text-[0.625rem] font-bold text-white">{c.unread}</span>}
                </span>
              </span>
            </button>
          ))}
          {visible.length === 0 && <p className="px-3 py-8 text-center text-slate-400">No conversations yet. Add a truck and its driver.</p>}
        </div>
      </aside>

      {/* Thread */}
      {active ? <Thread key={active.id} conv={active} meId={user?.id ?? 0} onChanged={loadConvs} /> : (
        <div className="grid flex-1 place-items-center text-slate-400">Pick a conversation</div>
      )}
    </div>
  )
}

function Thread({ conv, meId, onChanged }: { conv: Conversation; meId: number; onChanged: () => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastId = msgs.length ? msgs[msgs.length - 1].id : 0

  const refresh = useCallback(async () => {
    try {
      const list = await chatApi.messages(conv.id)
      setMsgs(list)
    } catch (e) { toast.error((e as Error).message) }
  }, [conv.id])
  useEffect(() => { refresh(); const t = setInterval(refresh, POLL_MS); return () => clearInterval(t) }, [refresh])
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); if (conv.unread) chatApi.markRead(conv.id).then(onChanged) }, [lastId, conv.id, conv.unread, onChanged])

  const send = async () => {
    const body = text.trim()
    if (!body) return
    setSending(true); setText('')
    try { const m = await chatApi.send(conv.id, body, newClientId()); setMsgs(p => [...p, m]); onChanged() }
    catch (e) { toast.error((e as Error).message); setText(body) }
    finally { setSending(false) }
  }
  const upload = async (file: File) => {
    setSending(true)
    try { const m = await chatApi.sendFile(conv.id, file, { clientId: newClientId(), loadId: conv.load_id ?? undefined }); setMsgs(p => [...p, m]); onChanged() }
    catch (e) { toast.error((e as Error).message) }
    finally { setSending(false) }
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-slate-900">{conv.title}</h2>
          <p className="truncate text-[0.6875rem] text-slate-500">{conv.members.map(m => m.name).join(', ')}</p>
        </div>
        <div className="flex items-center gap-2">
          {conv.load_id && <Link to={`/loads?open=${conv.load_id}`} className="btn-secondary h-8 rounded-lg px-2.5 text-xs">Open load</Link>}
          <button onClick={() => setShowMembers(v => !v)} className="btn-secondary h-8 rounded-lg px-2.5 text-xs"><Users className="h-3.5 w-3.5" />{conv.members.length}</button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-4 py-3">
          {msgs.map((m, i) => <Bubble key={m.id} m={m} mine={m.sender_id === meId} showName={i === 0 || msgs[i - 1].sender_id !== m.sender_id} />)}
          {msgs.length === 0 && <p className="py-10 text-center text-slate-400">No messages yet.</p>}
          <div ref={bottom} />
        </div>
        {showMembers && <Members convId={conv.id} />}
      </div>

      <footer className="flex items-center gap-2 border-t border-slate-200 px-3 py-2.5">
        <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        <button onClick={() => fileRef.current?.click()} disabled={sending} aria-label="Attach a photo or file" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"><Paperclip className="h-4 w-4" /></button>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={`Message ${conv.title}…`} className={`${control} h-9`} />
        <button onClick={send} disabled={sending || !text.trim()} className="btn-primary h-9 rounded-lg px-3 text-xs"><Send className="h-3.5 w-3.5" />Send</button>
      </footer>
    </section>
  )
}

function Bubble({ m, mine, showName }: { m: ChatMessage; mine: boolean; showName: boolean }) {
  if (m.kind === 'system') return <div className="my-2 text-center text-[0.6875rem] text-slate-400">{m.body} · {m.created_at ? timeShort(m.created_at) : ''}</div>
  return (
    <div className={`mb-1.5 flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] rounded-2xl px-3 py-2 shadow-sm ${mine ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}>
        {showName && !mine && <div className="mb-0.5 text-[0.6875rem] font-bold text-blue-700">{m.sender_name}{m.sender_role && <span className="ml-1 font-normal text-slate-400">· {ROLE_LABELS[m.sender_role as Role] || m.sender_role}</span>}</div>}
        {m.attachments.map(a => <AttachmentView key={a.id} a={a} mine={mine} />)}
        {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
        <div className={`mt-0.5 text-right text-[0.625rem] ${mine ? 'text-blue-200' : 'text-slate-400'}`}>
          {m.created_at ? timeShort(m.created_at) : ''}{m.client_created_at && m.created_at && Math.abs(new Date(m.created_at).getTime() - new Date(m.client_created_at).getTime()) > 120_000 ? ` · written ${timeShort(m.client_created_at)}, sent later` : ''}
        </div>
      </div>
    </div>
  )
}

function AttachmentView({ a, mine }: { a: ChatAttachment; mine: boolean }) {
  const [src, setSrc] = useState<string | null>(null)
  const [attaching, setAttaching] = useState(false)
  const isImage = (a.content_type || '').startsWith('image/')
  useEffect(() => {
    let url: string | null = null
    if (isImage) fetchFileUrl(a).then(u => { url = u; setSrc(u) }).catch(() => setSrc(null))
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [a, isImage])
  const open = async () => { try { window.open(await fetchFileUrl(a), '_blank') } catch (e) { toast.error((e as Error).message) } }
  const makePod = async () => {
    if (!a.load_id) return toast.error('This photo is not tied to a load')
    setAttaching(true)
    try { await chatApi.toLoad(a.id, a.load_id, true); toast.success('Saved as the POD on the load') }
    catch (e) { toast.error((e as Error).message) }
    finally { setAttaching(false) }
  }
  return (
    <div className="mb-1.5">
      {isImage ? (
        <button onClick={open} className="block overflow-hidden rounded-lg">
          {src ? <img src={src} alt={a.original_filename || 'photo'} className="max-h-72 w-auto rounded-lg" /> : <div className="grid h-40 w-56 place-items-center bg-slate-100 text-slate-400"><ImageIcon className="h-6 w-6" /></div>}
        </button>
      ) : (
        <button onClick={open} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${mine ? 'border-blue-400 bg-blue-500' : 'border-slate-200 bg-slate-50'}`}>
          <FileText className="h-4 w-4 shrink-0" /><span className="truncate">{a.original_filename || 'File'}</span>
        </button>
      )}
      <div className={`mt-1 flex flex-wrap items-center gap-x-2 text-[0.625rem] ${mine ? 'text-blue-200' : 'text-slate-500'}`}>
        {a.taken_at && <span>taken {timeShort(a.taken_at)}</span>}
        {a.lat != null && a.lng != null && <a href={`https://maps.google.com/?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 hover:underline"><MapPin className="h-3 w-3" />{a.lat.toFixed(3)}, {a.lng.toFixed(3)}</a>}
        <span className="uppercase">{a.category}</span>
        {a.load_id && !mine && <button onClick={makePod} disabled={attaching} className="font-semibold text-blue-700 hover:underline">{attaching ? 'Saving…' : 'Save as POD'}</button>}
      </div>
    </div>
  )
}

function Members({ convId }: { convId: number }) {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof chatApi.members>>>([])
  useEffect(() => { chatApi.members(convId).then(setRows).catch(() => setRows([])) }, [convId])
  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-3">
      <h3 className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">Members and history</h3>
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={i} className={r.left_at ? 'opacity-60' : ''}>
            <div className="font-semibold text-slate-800">{r.name} <span className="font-normal text-slate-400">· {ROLE_LABELS[r.role as Role] || r.role}</span></div>
            <div className="text-[0.6875rem] text-slate-500">{r.joined_at ? `joined ${dateShort(r.joined_at)}` : ''}{r.left_at ? ` · left ${dateShort(r.left_at)}` : ''}</div>
          </li>
        ))}
      </ul>
    </aside>
  )
}

function preview(m: ChatMessage | null) {
  if (!m) return 'No messages yet'
  const who = m.sender_name ? `${m.sender_name.split(' ')[0]}: ` : ''
  if (m.kind === 'photo') return `${who}📷 ${m.body || 'Photo'}`
  if (m.kind === 'file') return `${who}📎 ${m.body || 'File'}`
  return `${who}${m.body || ''}`
}
function timeShort(iso: string) { return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z').toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }
function dateShort(iso: string) { return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
function timeAgo(iso: string) {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z'), s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
