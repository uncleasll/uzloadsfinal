import type { LoadStatus, BillingStatus } from '@/types'

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount)
}

export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + (dateStr.includes('T') ? '' : 'T00:00:00'))
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
}

export function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export const STATUS_COLORS: Record<LoadStatus, string> = {
  New:         'bg-green-100 text-green-700 border border-green-200',
  Canceled:    'bg-red-100 text-red-700 border border-red-200',
  TONU:        'bg-orange-100 text-orange-700 border border-orange-200',
  Dispatched:  'bg-blue-100 text-blue-700 border border-blue-200',
  'En Route':  'bg-indigo-100 text-indigo-700 border border-indigo-200',
  'Picked-up': 'bg-yellow-100 text-yellow-800 border border-yellow-200',
  Delivered:   'bg-teal-100 text-teal-700 border border-teal-200',
  Closed:      'bg-gray-100 text-gray-600 border border-gray-200',
}

export const BILLING_COLORS: Record<BillingStatus, string> = {
  Pending:              'bg-yellow-50 text-yellow-700 border border-yellow-200',
  Canceled:             'bg-red-50 text-red-600 border border-red-200',
  'BOL received':       'bg-blue-50 text-blue-700 border border-blue-200',
  Invoiced:             'bg-indigo-50 text-indigo-700 border border-indigo-200',
  'Sent to factoring':  'bg-purple-50 text-purple-700 border border-purple-200',
  Funded:               'bg-teal-50 text-teal-700 border border-teal-200',
  Paid:                 'bg-green-50 text-green-700 border border-green-200',
}

export const ALL_STATUSES: LoadStatus[] = ['New','Canceled','TONU','Dispatched','En Route','Picked-up','Delivered','Closed']
export const ALL_BILLING_STATUSES: BillingStatus[] = ['Pending','Canceled','BOL received','Invoiced','Sent to factoring','Funded','Paid']

export function getPickupStop(stops: { stop_type: string; city?: string; state?: string; stop_date?: string }[]) {
  return stops.find(s => s.stop_type === 'pickup')
}
export function getDeliveryStop(stops: { stop_type: string; city?: string; state?: string; stop_date?: string }[]) {
  return stops.find(s => s.stop_type === 'delivery')
}
export function stopLabel(stop?: { city?: string; state?: string }): string {
  if (!stop) return '—'
  return [stop.city, stop.state].filter(Boolean).join(', ') || '—'
}

export function clsx(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}

// Period options — includes custom date range
export const PERIOD_OPTIONS = [
  { label: 'All',          value: 'all' },
  { label: 'Today',        value: 'today' },
  { label: 'Yesterday',    value: 'yesterday' },
  { label: 'This Week',    value: 'this_week' },
  { label: 'Last Week',    value: 'last_week' },
  { label: 'Last 7 Days',  value: 'last_7_days' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'This Month',   value: 'this_month' },
  { label: 'Last Month',   value: 'last_month' },
  { label: 'Last 3 Months',value: 'last_3_months' },
  { label: 'Last 6 Months',value: 'last_6_months' },
  { label: 'This Year',    value: 'this_year' },
  { label: 'Last Year',    value: 'last_year' },
  { label: 'Custom Range', value: 'custom' },
]

export function periodToDates(period: string): { date_from?: string; date_to?: string } {
  const now   = new Date()
  const today = now.toISOString().slice(0, 10)
  const fmt   = (d: Date) => d.toISOString().slice(0, 10)

  const startOfWeek = (d: Date) => {
    const day  = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const copy = new Date(d)
    copy.setDate(diff)
    return copy
  }

  switch (period) {
    case 'today':      return { date_from: today, date_to: today }
    case 'yesterday':  { const y = new Date(now); y.setDate(y.getDate()-1); const s=fmt(y); return {date_from:s,date_to:s} }
    case 'this_week':  { const s=startOfWeek(new Date()); return {date_from:fmt(s),date_to:today} }
    case 'last_week':  { const s=startOfWeek(new Date()); s.setDate(s.getDate()-7); const e=new Date(s); e.setDate(e.getDate()+6); return {date_from:fmt(s),date_to:fmt(e)} }
    case 'last_7_days':{ const f=new Date(now); f.setDate(f.getDate()-7); return {date_from:fmt(f),date_to:today} }
    case 'last_30_days':{ const f=new Date(now); f.setDate(f.getDate()-30); return {date_from:fmt(f),date_to:today} }
    case 'this_month': { const f=new Date(now.getFullYear(),now.getMonth(),1); return {date_from:fmt(f),date_to:today} }
    case 'last_month': { const f=new Date(now.getFullYear(),now.getMonth()-1,1); const t=new Date(now.getFullYear(),now.getMonth(),0); return {date_from:fmt(f),date_to:fmt(t)} }
    case 'last_3_months':{ const f=new Date(now); f.setMonth(f.getMonth()-3); return {date_from:fmt(f),date_to:today} }
    case 'last_6_months':{ const f=new Date(now); f.setMonth(f.getMonth()-6); return {date_from:fmt(f),date_to:today} }
    case 'this_year':  { const f=new Date(now.getFullYear(),0,1); return {date_from:fmt(f),date_to:today} }
    case 'last_year':  { return {date_from:`${now.getFullYear()-1}-01-01`,date_to:`${now.getFullYear()-1}-12-31`} }
    case 'all':
    case 'custom':
    default:           return {}
  }
}
