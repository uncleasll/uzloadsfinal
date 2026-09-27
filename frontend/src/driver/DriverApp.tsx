import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { CalendarRange, Home, MessageSquare, Package, CloudOff, UploadCloud } from 'lucide-react'
import toast from 'react-hot-toast'
import { listJobs, onChange, startOutbox, type Job } from './outbox'
import TodayScreen from './TodayScreen'
import LoadsScreen from './LoadsScreen'
import ChatScreen from './ChatScreen'
import WeekScreen from './WeekScreen'

/** The driver's phone app: four tabs, works offline, everything it sends goes through the outbox. */
export default function DriverApp() {
  const pending = usePending()
  const online = useOnline()

  useEffect(() => {
    startOutbox()
    if ('serviceWorker' in navigator && import.meta.env.PROD) navigator.serviceWorker.register('/sw.js').catch(() => {})
    const rejected = (e: Event) => toast.error(`Not accepted: ${(e as CustomEvent).detail.message}`)
    window.addEventListener('outbox-rejected', rejected)
    return () => window.removeEventListener('outbox-rejected', rejected)
  }, [])

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-50 text-slate-900">
      {(!online || pending.length > 0) && (
        <div className={`flex items-center gap-2 px-4 py-1.5 text-xs font-semibold ${online ? 'bg-[var(--accent)] text-white' : 'bg-slate-800 text-slate-100'}`}>
          {online ? <UploadCloud className="h-3.5 w-3.5" /> : <CloudOff className="h-3.5 w-3.5" />}
          {online ? `Sending ${pending.length} item${pending.length === 1 ? '' : 's'}…` : `No signal. ${pending.length ? `${pending.length} waiting to send.` : 'Everything you do is saved and sent later.'}`}
        </div>
      )}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <Routes>
          <Route index element={<TodayScreen />} />
          <Route path="loads/*" element={<LoadsScreen />} />
          <Route path="chat/*" element={<ChatScreen />} />
          <Route path="week" element={<WeekScreen />} />
          <Route path="*" element={<Navigate to="/driver" replace />} />
        </Routes>
      </main>
      <nav className="grid shrink-0 grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        <Tab to="/driver" end icon={Home} label="Today" />
        <Tab to="/driver/loads" icon={Package} label="Loads" />
        <Tab to="/driver/chat" icon={MessageSquare} label="Chat" />
        <Tab to="/driver/week" icon={CalendarRange} label="My week" />
      </nav>
    </div>
  )
}

function Tab({ to, icon: Icon, label, end }: { to: string; icon: typeof Home; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[0.6875rem] font-semibold ${isActive ? 'text-[var(--accent)]' : 'text-slate-500'}`}>
      <Icon className="h-5 w-5" />{label}
    </NavLink>
  )
}

export function usePending(): Job[] {
  const [jobs, setJobs] = useState<Job[]>([])
  useEffect(() => {
    const refresh = () => listJobs().then(setJobs).catch(() => {})
    refresh()
    return onChange(refresh)
  }, [])
  return jobs
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return on
}
