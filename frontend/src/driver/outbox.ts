/**
 * The outbox: everything the phone wants to send is written here first, then sent in order.
 * No internet is not an error; the job waits in IndexedDB and goes when the signal is back.
 * Every job carries a client_id, so the server ignores a second arrival of the same thing.
 */
import client from '@/api/client'

export type Job = {
  id: string                       // also the client_id sent to the server
  kind: 'status' | 'photo' | 'inspection' | 'expense' | 'message' | 'odometer'
  url: string
  json?: Record<string, unknown>
  fields?: Record<string, string>
  files?: Array<{ field: string; name: string; type: string; blob: Blob }>
  label: string                    // what the driver sees in the "waiting" list
  createdAt: number
  attempts: number
  lastError?: string
}

const DB = 'karvan-driver', STORE = 'outbox'
const listeners = new Set<() => void>()
let flushing = false

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
export const onChange = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }
const notify = () => listeners.forEach(fn => fn())

export async function listJobs(): Promise<Job[]> {
  const all = await tx<Job[]>('readonly', s => s.getAll())
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

/** Queue a job and try to send right away. Returns once it is safely stored, not once it is sent. */
export async function enqueue(job: Omit<Job, 'createdAt' | 'attempts'>): Promise<void> {
  await tx('readwrite', s => s.put({ ...job, createdAt: Date.now(), attempts: 0 }))
  notify()
  void flush()
}

async function send(job: Job) {
  if (job.files?.length || job.fields) {
    const form = new FormData()
    for (const [k, v] of Object.entries(job.fields || {})) form.append(k, v)
    for (const f of job.files || []) form.append(f.field, new File([f.blob], f.name, { type: f.type }))
    form.append('client_id', job.id)
    return client.post(job.url, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 })
  }
  return client.post(job.url, { ...(job.json || {}), client_id: job.id })
}

/** Send everything in order. Stops at the first network failure; drops a job the server rejected outright. */
export async function flush(): Promise<void> {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    for (const job of await listJobs()) {
      try {
        await send(job)
        await tx('readwrite', s => s.delete(job.id))
        notify()
      } catch (e) {
        const err = e as { message?: string; response?: { status?: number } }
        const status = (e as { response?: { status?: number } })?.response?.status
        const msg = err.message || 'failed'
        // axios errors are rethrown as plain Errors by the client; a server 4xx text means "do not retry"
        const rejected = status != null && status >= 400 && status < 500
        const looksRejected = /^(From |Take the POD|Unknown|Amount|Load not found|No truck|Empty)/.test(msg)
        if (rejected || looksRejected) {
          await tx('readwrite', s => s.delete(job.id))
          notify()
          window.dispatchEvent(new CustomEvent('outbox-rejected', { detail: { job, message: msg } }))
          continue
        }
        await tx('readwrite', s => s.put({ ...job, attempts: job.attempts + 1, lastError: msg }))
        notify()
        break
      }
    }
  } finally { flushing = false }
}

let started = false
export function startOutbox() {
  if (started) return
  started = true
  window.addEventListener('online', () => void flush())
  setInterval(() => void flush(), 15_000)
  void flush()
}
