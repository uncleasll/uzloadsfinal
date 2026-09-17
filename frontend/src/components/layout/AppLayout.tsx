import { useState, useRef, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import karvanLogo from '@/assets/karvan-logo.png'

interface NavItem {
  label: string
  to?: string
  icon: React.ReactNode
  children?: { label: string; to: string }[]
}

const NAV: NavItem[] = [
  { label: 'Dashboard', to: '/dashboard', icon: <DashboardIcon /> },
  { label: 'Weekly board', to: '/weeks', icon: <WeekIcon /> },
  { label: 'Loads', to: '/loads', icon: <LoadsIcon /> },
  { label: 'Expenses', to: '/accounting/expenses', icon: <AccountingIcon /> },
  { label: 'Dispatchers', to: '/dispatchers', icon: <PartnersIcon /> },
  { label: 'Monthly bills', to: '/bills', icon: <PaymentsIcon /> },
  { label: 'Maintenance', to: '/maintenance', icon: <EquipIcon /> },
  { label: 'Drivers', to: '/drivers', icon: <DriversIcon /> },
  { label: 'Equipment', icon: <EquipIcon />, children: [{ label: 'Trucks', to: '/trucks' }, { label: 'Trailers', to: '/trailers' }] },
  { label: 'Brokers', to: '/brokers', icon: <PartnersIcon /> },
  { label: 'Settings', to: '/settings', icon: <SettingsIcon /> },
  { label: 'More', icon: <MoreIcon />, children: [
    { label: 'Dispatch board', to: '/dispatch' },
    { label: 'Driver Payroll (legacy)', to: '/payroll' },
    { label: 'Advanced Payments', to: '/payments/advanced' },
    { label: 'Settlement Payments', to: '/payments' },
    { label: 'Vendors', to: '/vendors' },
    { label: 'Reports', to: '/reports/total-revenue' },
  ] },
]

const SIDEBAR_STORAGE_KEY = 'karvan.sidebar.collapsed'
const EXPANDED_W = 188
const COLLAPSED_W = 52

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

export default function AppLayout() {
  const isMobile = useIsMobile()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})
  const [showUserMenu, setShowUserMenu] = useState(false)
  const navigate = useNavigate()
  const userMenuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const { user, logout } = useAuth()
  const displayName = user?.name || 'User'
  const initial = displayName.charAt(0).toUpperCase()

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Auto-open the group that owns the current route
  useEffect(() => {
    const activeParent = NAV.find(item =>
      item.children?.some(c => location.pathname === c.to || location.pathname.startsWith(c.to + '/'))
    )
    if (activeParent) {
      setOpenMenus(p => ({ ...p, [activeParent.label]: true }))
    }
  }, [location.pathname])

  // Close the mobile drawer on navigation
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  // Close the mobile drawer with Escape
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setMobileOpen(v => !v)
    } else {
      setCollapsed(v => {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, v ? '0' : '1')
        return !v
      })
    }
  }, [isMobile])

  const toggleMenu = (label: string) => setOpenMenus(p => ({ ...p, [label]: !p[label] }))

  const isChildActive = (to: string) => location.pathname === to || location.pathname.startsWith(to + '/')
  const isActive = (item: NavItem) => {
    if (item.to) return isChildActive(item.to)
    return item.children?.some(c => isChildActive(c.to)) ?? false
  }

  // Expanded on mobile drawer; collapsible rail on desktop
  const expanded = isMobile ? true : !collapsed
  const sidebarWidth = expanded ? EXPANDED_W : COLLAPSED_W

  const handleGroupClick = (item: NavItem) => {
    if (!expanded) {
      // Collapsed rail: expand and reveal this group
      setCollapsed(false)
      localStorage.setItem(SIDEBAR_STORAGE_KEY, '0')
      setOpenMenus(p => ({ ...p, [item.label]: true }))
      return
    }
    toggleMenu(item.label)
  }

  // Labels stay mounted and fade via opacity, so nothing snaps while the width animates.
  const labelCls = `whitespace-nowrap transition-opacity duration-200 ${expanded ? 'opacity-100' : 'opacity-0'}`

  const sidebarContent = (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-blue-600/[0.12] to-transparent" />

      {/* Brand — logo keeps a fixed position in both states */}
      <div className="relative flex h-[3.25rem] shrink-0 items-center border-b border-white/[0.08] px-[0.8125rem]">
        <div className="shrink-0" style={{ width: 26, height: 26 }}>
          <img src={karvanLogo} alt="Karvan" className="h-full w-full object-contain" />
        </div>
        <div className={`ml-2 min-w-0 ${labelCls} ${expanded ? '' : 'pointer-events-none'}`}>
          <div className="text-[0.8125rem] font-bold leading-tight tracking-tight text-white">Karvan</div>
          <div className="truncate text-[0.59375rem] font-medium leading-tight text-slate-400">{user?.company_name || 'Fleet operations'}</div>
        </div>
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="ml-auto grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/[0.08] hover:text-white"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Navigation — icons never move; only labels fade */}
      <nav className="scrollbar-thin relative flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-1.5 py-2.5" aria-label="Main navigation">
        {NAV.map(item => {
          const active = isActive(item)
          const open = !!openMenus[item.label]
          const iconWrap = `grid h-6 w-6 shrink-0 place-items-center transition-colors duration-150 [&>svg]:h-[0.625rem] [&>svg]:w-[0.625rem] ${
            active ? 'text-white' : 'text-slate-400 group-hover:text-slate-100'
          }`

          if (!item.children) {
            return (
              <NavLink
                key={item.label}
                to={item.to!}
                title={expanded ? undefined : item.label}
                className={({ isActive: ia }) =>
                  `group relative flex h-8 items-center rounded-md px-2 text-[0.59375rem] transition-colors duration-150 ${
                    ia
                      ? 'bg-brand-600 font-semibold text-white shadow-sm shadow-blue-950/30'
                      : 'font-medium text-slate-300 hover:bg-white/[0.07] hover:text-white'
                  }`
                }
              >
                {!expanded && active && (
                  <span className="absolute -left-1.5 top-1/2 h-4 w-[0.125rem] -translate-y-1/2 rounded-r-full bg-blue-400" />
                )}
                <span className={iconWrap}>{item.icon}</span>
                <span className={`ml-2 min-w-0 truncate ${labelCls}`}>{item.label}</span>
              </NavLink>
            )
          }

          return (
            <div key={item.label}>
              <button
                onClick={() => handleGroupClick(item)}
                title={expanded ? undefined : item.label}
                aria-expanded={open}
                className={`group relative flex h-8 w-full items-center rounded-md px-2 text-[0.59375rem] transition-colors duration-150 ${
                  active
                    ? 'bg-white/[0.08] font-semibold text-white'
                    : 'font-medium text-slate-300 hover:bg-white/[0.07] hover:text-white'
                }`}
              >
                {!expanded && active && (
                  <span className="absolute -left-1.5 top-1/2 h-4 w-[0.125rem] -translate-y-1/2 rounded-r-full bg-blue-400" />
                )}
                <span className={iconWrap}>{item.icon}</span>
                <span className={`ml-2 min-w-0 flex-1 truncate text-left ${labelCls}`}>{item.label}</span>
                <svg
                  className={`h-3 w-3 shrink-0 text-slate-500 transition-[transform,opacity] duration-200 ease-out ${open ? 'rotate-180' : ''} ${expanded ? 'opacity-100' : 'opacity-0'}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                </svg>
              </button>

              {/* Smoothly animated submenu; folds shut when the rail collapses */}
              <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${open && expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                  <div className="relative ml-5 mt-0.5 space-y-px border-l border-white/[0.08] py-0.5 pl-2.5 pr-1">
                    {item.children.map(child => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        tabIndex={open && expanded ? 0 : -1}
                        className={({ isActive: ia }) =>
                          `relative flex h-7 items-center rounded-md px-2 text-[0.5625rem] transition-colors duration-150 ${
                            ia
                              ? 'bg-blue-500/[0.15] font-semibold text-blue-200'
                              : 'font-medium text-slate-400 hover:bg-white/[0.05] hover:text-slate-100'
                          }`
                        }
                      >
                        {isChildActive(child.to) && (
                          <span className="absolute -left-[0.6875rem] top-1/2 h-3.5 w-[0.125rem] -translate-y-1/2 rounded-full bg-blue-400" />
                        )}
                        <span className="truncate">{child.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </nav>

    </>
  )

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">

      {/* Desktop sidebar */}
      {!isMobile && (
        <aside
          className="relative flex h-full shrink-0 flex-col overflow-hidden border-r border-slate-200/10 bg-[#07111f] text-white shadow-lg shadow-slate-950/10 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{ width: sidebarWidth }}
        >
          {sidebarContent}
        </aside>
      )}

      {/* Mobile drawer + backdrop */}
      {isMobile && (
        <>
          <div
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
            className={`fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[0.125rem] transition-opacity duration-300 ${
              mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 flex flex-col overflow-hidden bg-[#07111f] text-white shadow-2xl shadow-slate-950/40 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              mobileOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={{ width: Math.min(EXPANDED_W + 32, 300) }}
            aria-hidden={!mobileOpen}
          >
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Main area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        <header className="z-20 flex h-[3.25rem] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-4">
          <button
            onClick={toggleSidebar}
            title={isMobile ? 'Open menu' : expanded ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={isMobile ? 'Open menu' : 'Toggle sidebar'}
            className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            {isMobile ? (
              <svg className="h-[1.125rem] w-[1.125rem]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
              </svg>
            ) : (
              <svg className="h-[1.125rem] w-[1.125rem]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <rect x="3" y="4" width="18" height="16" rx="2"/>
                <path strokeLinecap="round" d="M9 4v16"/>
              </svg>
            )}
          </button>

          {/* User menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              aria-expanded={showUserMenu}
              aria-haspopup="menu"
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-[0.1875rem] pl-2.5 pr-1 transition-colors hover:border-slate-300 hover:bg-slate-100"
            >
              <span className="hidden text-xs font-semibold text-slate-700 sm:block">
                {displayName}
              </span>
              <span className="grid h-[1.875rem] w-[1.875rem] shrink-0 place-items-center overflow-hidden rounded-full bg-brand-600">
                <span className="text-xs font-bold text-white">{initial}</span>
              </span>
            </button>

            {showUserMenu && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-52 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-950/10"
              >
                <div className="border-b border-slate-100 px-4 py-2.5">
                  <div className="text-xs font-bold text-slate-900">{displayName}</div>
                  <div className="truncate text-[0.6875rem] text-slate-500">{user?.company_name ? `${user.company_name} · ${user?.email || ''}` : user?.email || ''}</div>
                </div>
                <button
                  role="menuitem"
                  onClick={() => { setShowUserMenu(false); navigate('/my-company') }}
                  className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <span className="flex h-4 w-4 text-slate-400"><CompanyIcon /></span>
                  My Company
                </button>
                <div className="border-t border-slate-100">
                  <button
                    role="menuitem"
                    onClick={() => { setShowUserMenu(false); logout(); navigate('/login', { replace: true }) }}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                  >
                    <span className="flex h-4 w-4">{<LogoutIcon />}</span>
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden bg-slate-50 p-2 sm:p-3">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function DashboardIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg> }
function WeekIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M8 2v4M16 2v4M8 15h3M13 15h3"/></svg> }
function SettingsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg> }
function DispatchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/><path d="M12 11h4M12 16h4M8 11h.01M8 16h.01"/></svg> }
function LoadsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><path d="M14 18V6a2 2 0 00-2-2H4a2 2 0 00-2 2v11a1 1 0 001 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 001-1v-3.65a1 1 0 00-.22-.62l-3.48-4.35A1 1 0 0017.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg> }
function DriversIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><path d="M19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
function PartnersIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> }
function EquipIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><rect x="2" y="6" width="14" height="9" rx="1.5"/><circle cx="7" cy="18" r="1.8"/><circle cx="13" cy="18" r="1.8"/><path d="M16 11h6"/></svg> }
function FuelIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><path d="M3 22h12"/><path d="M4 9h10"/><path d="M14 22V4a2 2 0 00-2-2H6a2 2 0 00-2 2v18"/><path d="M14 13h2a2 2 0 012 2v2a2 2 0 002 2 2 2 0 002-2V9.83a2 2 0 00-.59-1.42L18 5"/></svg> }
function PayrollIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><path d="M19 7V4a1 1 0 00-1-1H5a2 2 0 000 4h15a1 1 0 011 1v4h-3a2 2 0 000 4h3a1 1 0 001-1v-2"/><path d="M3 5v14a2 2 0 002 2h15a1 1 0 001-1v-4"/></svg> }
function PaymentsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg> }
function AccountingIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8"/><path d="M16 14v4"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/></svg> }
function ReportsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><path d="M3 3v16a2 2 0 002 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg> }
function MoreIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg> }
function CompanyIcon() { return <svg style={{ width: '100%', height: '100%' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg> }
function LogoutIcon() { return <svg style={{ width: '100%', height: '100%' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg> }
