/**
 * Which of the three Karvan products this build is. One codebase, one backend, three deployments:
 *   office   — owner and accountant: statements, loads, money, settings
 *   dispatch — dispatchers: the board, loads, chat
 *   driver   — drivers' phone app
 * Set VITE_APP at build time; the URLs of the other two are used for "you are in the wrong app" links.
 */
export type AppKind = 'office' | 'dispatch' | 'driver'

export const APP: AppKind = ((import.meta.env.VITE_APP as AppKind) || 'office')

export const APP_META: Record<AppKind, { name: string; short: string; tagline: string; home: string; manifest: string; theme: string }> = {
  office: { name: 'Karvan Office', short: 'Karvan', tagline: 'Weekly statements, loads and money for trucking companies', home: '/dashboard', manifest: '/manifest-office.webmanifest', theme: '#0f172a' },
  dispatch: { name: 'Karvan Dispatch', short: 'Dispatch', tagline: 'Trucks, loads and drivers in one board', home: '/dispatch', manifest: '/manifest-dispatch.webmanifest', theme: '#1d4ed8' },
  driver: { name: 'Karvan Driver', short: 'Driver', tagline: 'Your loads, your papers, your pay', home: '/driver', manifest: '/manifest-driver.webmanifest', theme: '#2563eb' },
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

/** Sets the tab title and the PWA manifest for this product. */
export function brandDocument() {
  const m = APP_META[APP]
  document.title = m.name
  let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
  if (!link) { link = document.createElement('link'); link.rel = 'manifest'; document.head.appendChild(link) }
  link.href = m.manifest
  let theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
  if (!theme) { theme = document.createElement('meta'); theme.name = 'theme-color'; document.head.appendChild(theme) }
  theme.content = m.theme
}
