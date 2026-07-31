import type { LegalProcessWithRelations } from '@/types/legalProcess.types'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { CrmLegalArea } from '@/schemas/crmItem.schema'

export interface ProcessoFilters {
  search: string
  legalArea: CrmLegalArea | null
  assignedTo: string | null
  columnId: string | null
  /** Prazo (next_deadline) range, ISO date strings (yyyy-mm-dd), inclusive. */
  deadlineFrom: string | null
  deadlineTo: string | null
}

export const emptyProcessoFilters: ProcessoFilters = {
  search: '',
  legalArea: null,
  assignedTo: null,
  columnId: null,
  deadlineFrom: null,
  deadlineTo: null,
}

export function hasActiveProcessoFilters(f: ProcessoFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.legalArea !== null ||
    f.assignedTo !== null ||
    f.columnId !== null ||
    f.deadlineFrom !== null ||
    f.deadlineTo !== null
  )
}

export function countActiveProcessoFilters(f: ProcessoFilters): number {
  let n = 0
  if (f.search.trim() !== '') n++
  if (f.legalArea !== null) n++
  if (f.assignedTo !== null) n++
  if (f.columnId !== null) n++
  if (f.deadlineFrom !== null || f.deadlineTo !== null) n++
  return n
}

/** Applies the Processos filters (texto + área + responsável + etapa + prazo) a uma lista de processos. */
export function filterLegalProcesses(
  processos: LegalProcessWithRelations[],
  f: ProcessoFilters
): LegalProcessWithRelations[] {
  const q = f.search.trim().toLowerCase()
  const qDigits = q.replace(/\D/g, '')
  const from = f.deadlineFrom ? new Date(f.deadlineFrom).getTime() : null
  const to = f.deadlineTo ? new Date(f.deadlineTo).getTime() : null

  return processos.filter((p) => {
    // A processo with no linked crm_item has none of the item-side fields —
    // any filter on them excludes it, but it still matches by CNJ/parties.
    const item = p.crm_item
    if (f.legalArea && item?.legal_area !== f.legalArea) return false
    if (f.assignedTo && item?.assigned_to !== f.assignedTo) return false
    if (f.columnId && item?.column_id !== f.columnId) return false

    if (from !== null || to !== null) {
      if (!item?.next_deadline) return false
      const deadline = new Date(item.next_deadline).getTime()
      if (from !== null && deadline < from) return false
      if (to !== null && deadline > to) return false
    }

    if (q) {
      const haystack = [
        item?.title,
        p.cnj_number,
        p.plaintiff,
        p.defendant,
        p.opposing_counsel,
        p.court,
        p.court_division,
        item?.next_task_summary,
        item ? getCrmItemClientName(item) : null,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesText = haystack.includes(q)
      const matchesDigits = qDigits.length > 0 && (p.cnj_number?.replace(/\D/g, '') ?? '').includes(qDigits)

      if (!matchesText && !matchesDigits) return false
    }

    return true
  })
}
