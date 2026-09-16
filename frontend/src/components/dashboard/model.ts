export type Period = 'today' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'custom'
export type Range = { from: string; to: string; basis: 'pickup' | 'delivery'; period: Period }
export interface ReportRow { load_id: number; load_number: number; driver_id: number | null; truck_id: number | null; load_date: string; pickup_date: string; actual_delivery_date: string | null; pickup_city: string; pickup_state: string; delivery_city: string; delivery_state: string; broker: string; driver_name: string; dispatcher: string; truck: string; rate: number; lumpers: number; other_add_ded: number; driver_pay: number; additional_payee: number; qp_fee: number; total_miles: number; empty_miles: number; status: string; billing_status: string }
export interface ExpenseRow { id: number; expense_date: string; amount: number; category: string; description: string; driver_id: number | null; truck_id: number | null }
export const completed = new Set(['Delivered', 'Closed'])
export const transit = new Set(['Dispatched', 'En Route', 'Picked-up'])
export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
export const round = (v: number) => Math.round((v + Number.EPSILON)*100)/100
export const dollars = (v: number) => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(v)
export const count = (v: number) => new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v)
export function getRange(period: Period, now = new Date()): Range {
  const end = new Date(now.getFullYear(),now.getMonth(),now.getDate()), start = new Date(end)
  if (period === 'this_week') start.setDate(start.getDate()-(start.getDay()+6)%7)
  if (period === 'last_week') { start.setDate(start.getDate()-(start.getDay()+6)%7-7);end.setTime(start.getTime());end.setDate(end.getDate()+6) }
  if (period === 'this_month') start.setDate(1)
  if (period === 'last_month') {start.setDate(1);start.setMonth(start.getMonth()-1);end.setDate(0)}
  if (period === 'this_year') start.setMonth(0,1)
  return {from:iso(start),to:iso(end),basis:'delivery',period}
}
export const validRange = (r: Range) => [r.from,r.to].every(s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s) && r.from<=r.to
export function loadRange(): Range {
  try { const s = JSON.parse(localStorage.getItem('karvan.dashboard.range.v2') || 'null') as Range; if (s && validRange(s) && ['pickup','delivery'].includes(s.basis)) {if(s.period==='custom')return s; if(['today','this_week','last_week','this_month','last_month','this_year'].includes(s.period))return {...getRange(s.period),basis:s.basis}} } catch { /* Use current month when preferences cannot be read. */ }
  return getRange('this_month')
}
export const revenueOf = (r: ReportRow) => round(Number(r.rate)+Number(r.lumpers)+Number(r.other_add_ded))
export const costOf = (r: ReportRow) => round(Number(r.driver_pay)+Number(r.additional_payee)+Number(r.qp_fee))
export function summarize(rows: ReportRow[], expenses: ExpenseRow[]) {
  const revenue = round(rows.reduce((s,r)=>s+revenueOf(r),0)), loadCosts = round(rows.reduce((s,r)=>s+costOf(r),0)), ledger = round(expenses.reduce((s,e)=>s+Number(e.amount),0))
  const costs = round(loadCosts+ledger), result = round(revenue-costs), miles=rows.reduce((s,r)=>s+Number(r.total_miles),0), empty=rows.reduce((s,r)=>s+Number(r.empty_miles),0)
  return {revenue,loadCosts,ledger,costs,result,miles,empty,rpm:miles>0?revenue/miles:null,cpm:miles>0?costs/miles:null,deadhead:miles>0?empty/miles*100:null,margin:revenue>0?result/revenue*100:null}
}
export interface Page<T> { items: T[]; total_pages: number; total?: number }
export async function fetchEveryPage<T extends {id:number}>(fetchPage: (page:number)=>Promise<Page<T>>): Promise<T[]> {
  const first = await fetchPage(1), rows=[...first.items]
  for(let p=2;p<=first.total_pages;p++) {const next=await fetchPage(p);rows.push(...next.items)}
  if(new Set(rows.map(r=>r.id)).size!==rows.length || (typeof first.total==='number' && rows.length!==first.total)) throw new Error('Records changed while loading. Refresh to get a complete snapshot.')
  return rows
}
export function csvDownload(name: string, rows: (string|number)[][]) {
  const text=rows.map(r=>r.map(v=>{let s=String(v);if(typeof v==='string' && /^[=+@\-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}).join(',')).join('\r\n')
  const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'})), a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
