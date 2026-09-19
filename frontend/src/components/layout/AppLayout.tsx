import { useState, useRef, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, CalendarRange, Package, Receipt, Headset, CreditCard,
  Users, Truck, Container, Wrench, Building2, Settings, MoreHorizontal,
  ChevronDown, ChevronsLeft, ChevronsRight, Menu, X, LogOut, Building,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import karvanLogo from '@/assets/karvan-logo.png'

type Leaf = { label: string; to: string; icon?: LucideIcon }
type Group = { label: string; icon: LucideIcon; children: Leaf[] }
type Item = (Leaf & { icon: LucideIcon }) | Group
type Section = { title?: string; items: Item[] }

const SECTIONS: Section[] = [
  {
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Weekly board', to: '/weeks', icon: CalendarRange },
      { label: 'Loads', to: '/loads', icon: Package },
      { label: 'Expenses', to: '/accounting/expenses', icon: Receipt },
    ],
  },
  {
    title: 'Pay',
    items: [
      { label: 'Dispatchers', to: '/dispatchers', icon: Headset },
      { label: 'Monthly bills', to: '/bills', icon: CreditCard },
    ],
  },
  {
    title: 'Fleet',
    items: [
      { label: 'Drivers', to: '/drivers', icon: Users },
      { label: 'Trucks', to: '/trucks', icon: Truck },
      { label: 'Trailers', to: '/trailers', icon: Container },
      { label: 'Maintenance', to: '/maintenance', icon: Wrench },
      { label: 'Brokers', to: '/brokers', icon: Building2 },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Settings', to: '/settings', icon: Settings },
      {
        label: 'More', icon: MoreHorizontal, children: [
          { label: 'Dispatch board', to: '/dispatch' },
          { label: 'Driver payroll (legacy)', to: '/payroll' },
          { label: 'Advanced payments', to: '/payments/advanced' },
          { label: 'Settlement payments', to: '/payments' },
          { label: 'Vendors', to: '/vendors' },
          { label: 'Reports', to: '/reports/total-revenue' },
        ],
      },
    ],
  },
]

const STORAGE_KEY = 'karvan.sidebar.collapsed'
const EXPANDED_W = '13.5rem'
const COLLAPSED_W = '3.5rem'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  )
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return isMobile
}

const isGroup = (item: Item): item is Group => 'children' in item

export default function AppLayout() {
  const isMobile = useIsMobile()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const location = useLocation()
  const { user } = useAuth()

  const expanded = isMobile || !collapsed

  const pathMatches = (to: string) => location.pathname === to || location.pathname.startsWith(to + '/')
  const itemActive = (item: Item) => isGroup(item) ? item.children.some(c => pathMatches(c.to)) : pathMatches(item.to)

  // Open the group that owns the current route
  useEffect(() => {
    for (const s of SECTIONS) for (const item of s.items) {
      if (isGroup(item) && item.children.some(c => pathMatches(c.to))) {
        setOpenGroups(p => ({ ...p, [item.label]: true }))
      }
    }
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close the mobile drawer on navigation and on Escape
  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const setCollapsedPersist = useCallback((value: boolean) => {
    setCollapsed(value)
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  }, [])

  const onGroupClick = (group: Group) => {
    if (!expanded) {
      setCollapsedPersist(false)
      setOpenGroups(p => ({ ...p, [group.label]: true }))
      return
    }
    setOpenGroups(p => ({ ...p, [group.label]: !p[group.label] }))
  }

  // Labels stay mounted and fade, so nothing jumps while the width animates
  const fade = `transition-opacity duration-150 ${expanded ? 'opacity-100' : 'opacity-0'}`
  const rowBase = 'group relative flex h-[2.125rem] w-full items-center rounded-lg px-2 text-[0.75rem] transition-colors duration-150'
  const rowIdle = 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900'
  const rowActive = 'bg-brand-50 font-semibold text-brand-700'
  const iconCls = (active: boolean) =>
    `h-[1.0625rem] w-[1.0625rem] shrink-0 transition-colors ${active ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600'}`

  const ActiveBar = () => (
    <span className="absolute -left-2 top-1/2 h-[1.125rem] w-[0.1875rem] -translate-y-1/2 rounded-r-full bg-brand-600" />
  )

  const sidebar = (
    <>
      {/* Brand */}
      <div className="flex h-[3.25rem] shrink-0 items-center px-3">
        <img src={karvanLogo} alt="Karvan" className="h-7 w-7 shrink-0 rounded-lg bg-slate-900 p-1 object-contain" />
        <div className={`ml-2.5 min-w-0 ${fade}`}>
          <div className="truncate text-[0.8125rem] font-bold leading-tight tracking-tight text-slate-900">Karvan</div>
          <div className="truncate text-[0.6875rem] leading-tight text-slate-500">{user?.company_name || 'Fleet operations'}</div>
        </div>
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2" aria-label="Main navigation">
        {SECTIONS.map((section, si) => (
          <div key={section.title ?? si} className={si === 0 ? '' : 'mt-2'}>
            {section.title && (
              <div className="relative h-6">
                <div className={`absolute inset-x-2 top-1/2 border-t border-slate-200 transition-opacity duration-150 ${expanded ? 'opacity-0' : 'opacity-100'}`} />
                <div className={`absolute inset-0 flex items-end px-2 pb-1 text-[0.6875rem] font-semibold uppercase tracking-wider text-slate-400 ${fade}`}>
                  {section.title}
                </div>
              </div>
            )}
            <div className="space-y-0.5">
              {section.items.map(item => {
                const active = itemActive(item)
                const Icon = item.icon

                if (!isGroup(item)) {
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      title={expanded ? undefined : item.label}
                      className={`${rowBase} ${active ? rowActive : rowIdle}`}
                    >
                      {active && <ActiveBar />}
                      <Icon className={iconCls(active)} strokeWidth={active ? 2.2 : 1.9} />
                      <span className={`ml-2.5 min-w-0 truncate ${fade}`}>{item.label}</span>
                    </NavLink>
                  )
                }

                const open = !!openGroups[item.label]
                return (
                  <div key={item.label}>
                    <button
                      onClick={() => onGroupClick(item)}
                      title={expanded ? undefined : item.label}
                      aria-expanded={open}
                      className={`${rowBase} ${active ? 'font-semibold text-slate-900' : rowIdle}`}
                    >
                      {active && !expanded && <ActiveBar />}
                      <Icon className={iconCls(active)} strokeWidth={1.9} />
                      <span className={`ml-2.5 min-w-0 flex-1 truncate text-left ${fade}`}>{item.label}</span>
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-[transform,opacity] duration-200 ${open ? 'rotate-180' : ''} ${expanded ? 'opacity-100' : 'opacity-0'}`} />
                    </button>
                    <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open && expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                      <div className="overflow-hidden">
                        <div className="ml-[1.3125rem] mt-0.5 space-y-0.5 border-l border-slate-200 pl-2.5">
                          {item.children.map(child => {
                            const childActive = pathMatches(child.to)
                            return (
                              <NavLink
                                key={child.to}
                                to={child.to}
                                tabIndex={open && expanded ? 0 : -1}
                                className={`relative flex h-7 items-center rounded-md px-2 text-[0.6875rem] transition-colors ${
                                  childActive ? 'bg-brand-50 font-semibold text-brand-700' : 'font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                              >
                                {childActive && <span className="absolute -left-[0.6875rem] top-1/2 h-3.5 w-[0.125rem] -translate-y-1/2 rounded-full bg-brand-600" />}
                                <span className="truncate">{child.label}</span>
                              </NavLink>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer: user + collapse */}
      <div className="shrink-0 border-t border-slate-200 p-2">
        <UserMenu expanded={expanded} />
        {!isMobile && (
          <button
            onClick={() => setCollapsedPersist(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="mt-1 flex h-8 w-full items-center rounded-lg px-2 text-[0.6875rem] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            {collapsed
              ? <ChevronsRight className="h-4 w-4 shrink-0" />
              : <ChevronsLeft className="h-4 w-4 shrink-0" />}
            <span className={`ml-2.5 truncate ${fade}`}>Collapse</span>
          </button>
        )}
      </div>
    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">

      {!isMobile && (
        <aside
          className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200 ease-out"
          style={{ width: expanded ? EXPANDED_W : COLLAPSED_W }}
        >
          {sidebar}
        </aside>
      )}

      {isMobile && (
        <>
          <div
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
            className={`fixed inset-0 z-40 bg-slate-900/40 transition-opacity duration-200 ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 flex w-[16rem] max-w-[85vw] flex-col overflow-hidden bg-white shadow-2xl shadow-slate-900/20 transition-transform duration-200 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
            aria-hidden={!mobileOpen}
          >
            {sidebar}
          </aside>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {isMobile && (
          <header className="flex h-[3rem] shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2">
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            <img src={karvanLogo} alt="Karvan" className="h-6 w-6 rounded-md bg-slate-900 p-[0.1875rem]" />
            <span className="text-[0.8125rem] font-bold text-slate-900">Karvan</span>
          </header>
        )}

        <main className="flex-1 overflow-hidden bg-slate-50 p-2 sm:p-3">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function UserMenu({ expanded }: { expanded: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const name = user?.name || 'User'

  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={expanded ? undefined : name}
        className="flex h-10 w-full items-center rounded-lg px-1.5 text-left transition-colors hover:bg-slate-100"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-[0.6875rem] font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </span>
        <span className={`ml-2.5 min-w-0 flex-1 transition-opacity duration-150 ${expanded ? 'opacity-100' : 'opacity-0'}`}>
          <span className="block truncate text-[0.75rem] font-semibold text-slate-800">{name}</span>
          <span className="block truncate text-[0.6875rem] text-slate-500">{user?.email}</span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-50 mb-1.5 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10"
        >
          <div className="border-b border-slate-100 px-3 py-2">
            <div className="truncate text-[0.75rem] font-semibold text-slate-900">{name}</div>
            <div className="truncate text-[0.6875rem] text-slate-500">{user?.company_name || user?.email}</div>
          </div>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); navigate('/my-company') }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.75rem] font-medium text-slate-700 hover:bg-slate-50"
          >
            <Building className="h-4 w-4 text-slate-400" /> My company
          </button>
          <button
            role="menuitem"
            onClick={() => { setOpen(false); logout(); navigate('/login', { replace: true }) }}
            className="flex w-full items-center gap-2.5 border-t border-slate-100 px-3 py-2 text-left text-[0.75rem] font-medium text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" /> Log out
          </button>
        </div>
      )}
    </div>
  )
}
