import type { CaseWithRelations } from '@/types/case.types'
import { getCaseClientName } from '@/types/case.types'
import type { CaseTag, CaseLegalArea } from '@/schemas/case.schema'

export interface CrmFilters {
  search: string
  legalArea: CaseLegalArea | null
  assignedTo: string | null
  tag: CaseTag | null
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
  cases: CaseWithRelations[],
  f: CrmFilters
): CaseWithRelations[] {
  const q = f.search.trim().toLowerCase()

  return cases.filter((c) => {
    if (f.legalArea && c.legal_area !== f.legalArea) return false
    if (f.assignedTo && c.assigned_to !== f.assignedTo) return false
    if (f.tag && !(c.tags ?? []).includes(f.tag)) return false

    if (q) {
      const haystack = [
        c.title,
        c.cnj_number,
        c.plaintiff,
        c.defendant,
        c.opposing_counsel,
        c.court,
        c.court_division,
        c.next_task_summary,
        getCaseClientName(c),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }

    return true
  })
}
