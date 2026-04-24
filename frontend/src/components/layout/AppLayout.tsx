import { useState, useRef, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'

interface NavItem {
  label: string
  to?: string
  icon: React.ReactNode
  children?: { label: string; to: string }[]
}

const NAV: NavItem[] = [
  { label: 'Loadboards', icon: <GridIcon />, children: [{ label: 'All Loads', to: '/loadboards' }, { label: 'Available', to: '/loadboards/available' }] },
  { label: 'Dispatch board', to: '/dispatch', icon: <DispatchIcon /> },
  { label: 'Loads', to: '/loads', icon: <LoadsIcon /> },
  { label: 'Drivers', to: '/drivers', icon: <DriversIcon /> },
  { label: 'Partners', icon: <PartnersIcon />, children: [{ label: 'Brokers', to: '/brokers' }, { label: 'Vendors', to: '/vendors' }] },
  { label: 'Equipment', icon: <EquipIcon />, children: [{ label: 'Trucks', to: '/trucks' }, { label: 'Trailers', to: '/trailers' }] },
  { label: 'Fuel', icon: <FuelIcon />, children: [{ label: 'Fuel Cards', to: '/fuel/cards' }, { label: 'Transactions', to: '/fuel/transactions' }] },
  { label: 'Driver Payroll', to: '/payroll', icon: <PayrollIcon /> },
  { label: 'Payments', icon: <PayrollIcon />, children: [{ label: 'Advanced Payments', to: '/payments/advanced' }, { label: 'Settlement Payments', to: '/payments' }] },
  { label: 'Accounting', icon: <AccountingIcon />, children: [
      { label: 'Expenses', to: '/accounting/expenses' }, { label: 'Payments', to: '/accounting/payments' },
      { label: 'Overview', to: '/accounting' }, { label: 'Invoices', to: '/accounting/invoices' }
    ] },
  { label: 'Reports', icon: <ReportsIcon />, children: [
    { label: 'Emails', to: '/reports/emails' },
    { label: 'Total Revenue', to: '/reports/total-revenue' },
    { label: 'Rate per Mile', to: '/reports/rate-per-mile' },
    { label: 'Revenue by Dispatcher', to: '/reports/revenue-by-dispatcher' },
    { label: 'Payment Summary', to: '/reports/payment-summary' },
    { label: 'Expenses', to: '/reports/expenses' },
    { label: 'Gross Profit', to: '/reports/gross-profit' },
    { label: 'Gross Profit per Load', to: '/reports/gross-profit-per-load' },
    { label: 'Profit & Loss', to: '/reports/profit-loss' },
  ]},
  { label: 'Tolls', icon: <TollsIcon />, children: [{ label: 'Transactions', to: '/tolls' }] },
  { label: 'Safety', icon: <SafetyIcon />, children: [{ label: 'Incidents', to: '/safety' }] },
  { label: 'IFTA', icon: <IFTAIcon />, children: [{ label: 'Reports', to: '/ifta' }] },
  { label: 'Users', to: '/users', icon: <UsersIcon /> },
  { label: 'Data Library', icon: <DataLibIcon />, children: [{ label: 'Locations', to: '/data-library' }] },
  { label: 'Docs Exchange', to: '/docs', icon: <DocsIcon /> },
]

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({})
  const [showUserMenu, setShowUserMenu] = useState(false)
  const navigate = useNavigate()
  const userMenuRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const toggleMenu = (label: string) => setOpenMenus(p => ({ ...p, [label]: !p[label] }))

  const isActive = (item: NavItem) => {
    if (item.to) return location.pathname === item.to || location.pathname.startsWith(item.to + '/')
    return item.children?.some(c => location.pathname === c.to || location.pathname.startsWith(c.to + '/'))
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#111827' }}>

      {/* ── Sidebar ── */}
      <aside
        style={{
          width: sidebarOpen ? 176 : 0,
          background: '#1a2332',
          transition: 'width 0.25s ease',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        {/* Logo */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg style={{ width: 18, height: 18, color: '#fff' }} fill="currentColor" viewBox="0 0 24 24">
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 008 20C19 20 22 3 22 3c-1 2-8 2-13 6 0 0 3-2 8-2 0 0-5 2-5 7 0 0 1.5-2 5-2-5 3-4.5 9-4.5 9"/>
            </svg>
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, lineHeight: 1.2, whiteSpace: 'nowrap' }}>ezloads</div>
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, lineHeight: 1.2, whiteSpace: 'nowrap' }}>easy loads</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {NAV.map(item => {
            const active = isActive(item)
            const open = openMenus[item.label]

            if (!item.children) {
              return (
                <NavLink
                  key={item.label}
                  to={item.to!}
                  title={item.label}
                  style={({ isActive: ia }) => ({
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 14px',
                    fontSize: 12, fontWeight: 500,
                    color: ia ? '#fff' : 'rgba(255,255,255,0.65)',
                    background: ia ? '#22c55e' : 'transparent',
                    textDecoration: 'none',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    transition: 'background 0.15s, color 0.15s',
                  })}
                >
                  <span style={{ width: 16, height: 16, flexShrink: 0, display: 'flex' }}>{item.icon}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>
                </NavLink>
              )
            }

            return (
              <div key={item.label}>
                <button
                  onClick={() => toggleMenu(item.label)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '7px 14px',
                    fontSize: 12, fontWeight: 500,
                    color: active ? '#fff' : 'rgba(255,255,255,0.65)',
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    overflow: 'hidden',
                    transition: 'color 0.15s',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ width: 16, height: 16, flexShrink: 0, display: 'flex' }}>{item.icon}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  </span>
                  <svg
                    style={{
                      width: 12, height: 12, flexShrink: 0,
                      color: 'rgba(255,255,255,0.35)',
                      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>

                {open && (
                  <div style={{ background: 'rgba(0,0,0,0.2)' }}>
                    {item.children.map(child => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        style={({ isActive: ia }) => ({
                          display: 'flex', alignItems: 'center',
                          paddingLeft: 40, paddingRight: 14, paddingTop: 5, paddingBottom: 5,
                          fontSize: 11,
                          color: ia ? '#4ade80' : 'rgba(255,255,255,0.45)',
                          fontWeight: ia ? 600 : 400,
                          textDecoration: 'none',
                          whiteSpace: 'nowrap', overflow: 'hidden',
                          transition: 'color 0.15s',
                        })}
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Live Support */}
          {/* <div style={{ padding: '8px 10px', marginTop: 4 }}>
            <button style={{
              width: '100%', padding: '8px 0',
              background: 'transparent',
              border: '1.5px solid rgba(255,255,255,0.2)',
              borderRadius: 6, color: '#fff',
              fontSize: 12, fontWeight: 700,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}>
              Live Support
            </button>
          </div> */}
        </nav>
      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* Topbar */}
        <header style={{
          height: 44, background: '#1a2332',
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px', flexShrink: 0, zIndex: 20,
        }}>
          {/* Hamburger */}
          <button
            onClick={() => setSidebarOpen(v => !v)}
            style={{
              color: 'rgba(255,255,255,0.7)', background: 'transparent',
              border: 'none', cursor: 'pointer', padding: 6, borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg style={{ width: 18, height: 18 }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>

          {/* User menu */}
          <div style={{ position: 'relative' }} ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'transparent', border: 'none', cursor: 'pointer',
              }}
            >
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: 500 }}>
                Asilbek Karimov
              </span>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                overflow: 'hidden', flexShrink: 0,
                background: '#22c55e',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>A</span>
              </div>
            </button>

            {showUserMenu && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 8,
                width: 200, background: '#fff',
                borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                border: '1px solid #e5e7eb', overflow: 'hidden', zIndex: 50,
              }}>
                <div style={{ padding: '10px 16px', borderBottom: '1px solid #f3f4f6', textAlign: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>Account</span>
                </div>
                {[
                  { label: 'Billing', icon: <BillingIcon /> },
                  { label: 'My Company', icon: <CompanyIcon />, to: '/my-company' },
                  { label: 'My Profile', icon: <ProfileIcon /> },
                  { label: 'Settings', icon: <SettingsMenuIcon /> },
                  { label: 'Logout', icon: <LogoutIcon /> },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={() => { setShowUserMenu(false); if ((item as any).to) navigate((item as any).to) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '9px 16px', fontSize: 12, color: '#374151',
                      background: 'transparent', border: 'none',
                      borderBottom: '1px solid #f9fafb',
                      cursor: 'pointer', textAlign: 'left',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ width: 16, height: 16, color: '#6b7280', display: 'flex' }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, overflow: 'hidden', background: '#fff' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function GridIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> }
function DispatchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> }
function LoadsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0zM3 5h11l3 5 2 1v4h-2m-6 0H5"/></svg> }
function DriversIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg> }
function PartnersIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg> }
function EquipIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function FuelIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h12v13a2 2 0 01-2 2H5a2 2 0 01-2-2V3zm9 0v6h5l1 1v4a1 1 0 01-1 1h-1"/></svg> }
function PayrollIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg> }
function AccountingIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg> }
function ReportsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg> }
function TollsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M12 9v6"/></svg> }
function SafetyIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg> }
function IFTAIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> }
function UsersIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg> }
function DataLibIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><ellipse cx="12" cy="5" rx="9" ry="3"/><path strokeLinecap="round" strokeLinejoin="round" d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path strokeLinecap="round" strokeLinejoin="round" d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> }
function DocsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} style={{ width: '100%', height: '100%' }}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"/></svg> }
function BillingIcon() { return <svg style={{ width: '100%', height: '100%' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> }
function CompanyIcon() { return <svg style={{ width: '100%', height: '100%' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg> }
function ProfileIcon() { return <svg style={{ width: '100%', height: '100%' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0M3 15h18"/></svg> }
function SettingsMenuIcon() { return <svg style={{ width: '100%', height: '100%' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="3"/><path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg> }
function LogoutIcon() { return <svg style={{ width: '100%', height: '100%' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg> }