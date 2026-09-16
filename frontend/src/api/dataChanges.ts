// Successful API writes invalidate views in this tab and other open Karvan tabs.
export const DATA_CHANGED = 'karvan:data-changed'
export const DATA_VERSION = 'karvan.data-version'
export function announceDataChange() {
  window.dispatchEvent(new Event(DATA_CHANGED))
  try { localStorage.setItem(DATA_VERSION, `${Date.now()}-${Math.random()}`) } catch { /* Same-tab updates still work without storage. */ }
}
