import type { LoadDocument } from '@/types'

// The existing API supports Confirmation, BOL and Other. Preserve richer
// document categories in its notes field, without relabeling a BOL as a POD.
export const DOCUMENT_KINDS = ['Confirmation', 'BOL', 'POD', 'Invoice', 'Lumper', 'Receipt', 'Other'] as const
const prefix = '[karvan-document:'
export function documentKind(doc: Pick<LoadDocument, 'document_type' | 'notes'>): string {
  if (doc.document_type !== 'Other') return doc.document_type
  const match = doc.notes?.match(/^\[karvan-document:([^\]]+)\]/)
  return match && DOCUMENT_KINDS.some(kind => kind === match[1]) ? match[1] : 'Other'
}
export function documentUploadFields(kind: string) {
  if (['Confirmation', 'BOL', 'Other'].includes(kind)) return {type:kind, notes:undefined}
  return {type:'Other', notes:`${prefix}${kind}]`}
}
