import type { CrmItemWithRelations } from '@/types/crmItem.types'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { CrmTag, CrmLegalArea } from '@/schemas/crmItem.schema'

export interface CrmFilters {
  search: string
  legalArea: CrmLegalArea | null
  assignedTo: string | null
  tag: CrmTag | null
}

export const emptyCrmFilters: CrmFilters = {
  search: '',
  legalArea: null,
  assignedTo: null,
  tag: null,
}

export function hasActiveFilters(f: CrmFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.legalArea !== null ||
    f.assignedTo !== null ||
    f.tag !== null
  )
}

export function countActiveFilters(f: CrmFilters): number {
  let n = 0
  if (f.search.trim() !== '') n++
  if (f.legalArea !== null) n++
  if (f.assignedTo !== null) n++
  if (f.tag !== null) n++
  return n
}

/** Applies the CRM filters (text + área + responsável + etiqueta) to a case list. */
export function filterCases(
  cases: CrmItemWithRelations[],
  f: CrmFilters
): CrmItemWithRelations[] {
  const q = f.search.trim().toLowerCase()

  return cases.filter((c) => {
    if (f.legalArea && c.legal_area !== f.legalArea) return false
    if (f.assignedTo && c.assigned_to !== f.assignedTo) return false
    if (f.tag && !(c.tags ?? []).includes(f.tag)) return false

    if (q) {
      const haystack = [
        c.title,
        c.next_task_summary,
        getCrmItemClientName(c),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }

    return true
  })
}
