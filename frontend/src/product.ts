/**
 * Which of the three Karvan products this build is. One codebase, one backend, three deployments:
 *   office   — owner and accountant: statements, loads, money, settings
 *   dispatch — dispatchers: the board, loads, chat
 *   driver   — drivers' phone app
 * Set VITE_APP at build time; the URLs of the other two are used for "you are in the wrong app" links.
 */
export type AppKind = 'office' | 'dispatch' | 'driver'

export const APP: AppKind = ((import.meta.env.VITE_APP as AppKind) || 'office')

export const APP_META: Record<AppKind, { name: string; short: string; tagline: string; home: string; manifest: string; theme: string; accent: string; accentSoft: string; bg: string; demoRole: 'admin' | 'dispatcher' | 'driver'; icon: string }> = {
  office: { name: 'Karvan Office', short: 'Karvan', tagline: 'Weekly statements, loads and money for trucking companies', home: '/dashboard', manifest: '/manifest-office.webmanifest', theme: '#0f172a', accent: '#2563eb', accentSoft: '#eff6ff', bg: '#07111f', demoRole: 'admin', icon: '/icon-office-192.png' },
  dispatch: { name: 'Karvan Dispatch', short: 'Dispatch', tagline: 'Trucks, loads and drivers in one board', home: '/dispatch', manifest: '/manifest-dispatch.webmanifest', theme: '#c2410c', accent: '#ea580c', accentSoft: '#fff7ed', bg: '#1c1917', demoRole: 'dispatcher', icon: '/icon-dispatch-192.png' },
  driver: { name: 'Karvan Driver', short: 'Driver', tagline: 'Your loads, your papers, your pay', home: '/driver', manifest: '/manifest-driver.webmanifest', theme: '#047857', accent: '#059669', accentSoft: '#ecfdf5', bg: '#052e21', demoRole: 'driver', icon: '/icon-driver-192.png' },
}

export const APP_URLS: Record<AppKind, string> = {
  office: import.meta.env.VITE_OFFICE_URL || '',
  dispatch: import.meta.env.VITE_DISPATCH_URL || '',
  driver: import.meta.env.VITE_DRIVER_URL || '',
}

/** Which app a role belongs to. Owners and accountants may also open the dispatch app. */
export function appForRole(role?: string | null): AppKind {
  if (role === 'driver') return 'driver'
  if (role === 'dispatcher') return 'dispatch'
  return 'office'
}

export function roleAllowedHere(role?: string | null): boolean {
  const home = appForRole(role)
  if (APP === 'dispatch') return home === 'dispatch' || home === 'office'
  return home === APP
}

/** Sets the tab title, colors and the PWA manifest for this product. */
export function brandDocument() {
  const m = APP_META[APP]
  document.title = m.name
  document.documentElement.dataset.product = APP
  document.documentElement.style.setProperty('--accent', m.accent)
  document.documentElement.style.setProperty('--accent-soft', m.accentSoft)
  let icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!icon) { icon = document.createElement('link'); icon.rel = 'icon'; document.head.appendChild(icon) }
  icon.href = m.icon
  let apple = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')
  if (!apple) { apple = document.createElement('link'); apple.rel = 'apple-touch-icon'; document.head.appendChild(apple) }
  apple.href = m.icon
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link) }
  link.href = m.manifest
  let theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!theme) { theme = document.createElement('meta'); theme.name = 'theme-color'; document.head.appendChild(theme) }
  theme.content = m.theme
}

export const DEMO_ENABLED = (import.meta.env.VITE_DEMO ?? '1') !== '0'
