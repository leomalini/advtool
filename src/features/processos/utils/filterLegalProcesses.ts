import type { LegalProcessWithRelations } from '@/types/legalProcess.types'
import { getCrmItemClientName } from '@/types/crmItem.types'
import type { CrmTag, CrmLegalArea } from '@/schemas/crmItem.schema'

export interface ProcessoFilters {
  search: string
  legalArea: CrmLegalArea | null
  assignedTo: string | null
  tag: CrmTag | null
}

export const emptyProcessoFilters: ProcessoFilters = {
  search: '',
  legalArea: null,
  assignedTo: null,
  tag: null,
}

export function hasActiveProcessoFilters(f: ProcessoFilters): boolean {
  return (
    f.search.trim() !== '' ||
    f.legalArea !== null ||
    f.assignedTo !== null ||
    f.tag !== null
  )
}

export function countActiveProcessoFilters(f: ProcessoFilters): number {
  let n = 0
  if (f.search.trim() !== '') n++
  if (f.legalArea !== null) n++
  if (f.assignedTo !== null) n++
  if (f.tag !== null) n++
  return n
}

/** Applies the Processos filters (texto + área + responsável + etiqueta) a uma lista de processos. */
export function filterLegalProcesses(
  processos: LegalProcessWithRelations[],
  f: ProcessoFilters
): LegalProcessWithRelations[] {
  const q = f.search.trim().toLowerCase()

  return processos.filter((p) => {
    const item = p.crm_item
    if (f.legalArea && item.legal_area !== f.legalArea) return false
    if (f.assignedTo && item.assigned_to !== f.assignedTo) return false
    if (f.tag && !(item.tags ?? []).includes(f.tag)) return false

    if (q) {
      const haystack = [
        item.title,
        p.cnj_number,
        p.plaintiff,
        p.defendant,
        p.opposing_counsel,
        p.court,
        p.court_division,
        item.next_task_summary,
        getCrmItemClientName(item),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(q)) return false
    }

    return true
  })
}
