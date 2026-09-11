import { z } from 'zod'
import {
  MAX_OCCURRENCES,
  RECURRENCE_TYPES,
  type RecurrenceRule,
  type RecurrenceType,
} from '@/lib/recurrence'

export const recurrenceTypeSchema = z.enum(RECURRENCE_TYPES)

/**
 * Campos de "Repetir", comuns aos formulários de evento e de tarefa.
 *
 * São campos de FORMULÁRIO: o service os converte em regra (`toRecurrenceRule`)
 * e grava as colunas `recurrence_*` — nenhum deles vai direto para o banco.
 */
export const recurrenceFormFields = {
  /** '' = não se repete. */
  recurrence_type: recurrenceTypeSchema.or(z.literal('')).optional(),
  /** "Termina": numa data ou depois de N ocorrências. */
  recurrence_ends: z.enum(['until', 'count']).optional(),
  recurrence_until: z.string().optional(),
  /** String: vem de um <input type="number">, e fica vazio quando não usado. */
  recurrence_count: z.string().optional(),
}

export interface RecurrenceFormValues {
  recurrence_type?: RecurrenceType | ''
  recurrence_ends?: 'until' | 'count'
  recurrence_until?: string
  recurrence_count?: string
}

/** Regra pedida no formulário, ou `null` quando não se repete. Assume valores
 * já validados por `recurrenceIssue`. */
export function toRecurrenceRule(values: RecurrenceFormValues): RecurrenceRule | null {
  if (!values.recurrence_type) return null
  if (values.recurrence_ends === 'count') {
    return {
      type: values.recurrence_type,
      end: { kind: 'count', count: Number(values.recurrence_count) },
    }
  }
  return {
    type: values.recurrence_type,
    end: { kind: 'until', until: values.recurrence_until ?? '' },
  }
}

/**
 * "Até quando" é obrigatório: a série é materializada, e sem fim não haveria o
 * que gravar. Devolve o primeiro problema, já com o campo a marcar.
 */
export function recurrenceIssue(
  values: RecurrenceFormValues,
  startDate: string | null | undefined
): { path: keyof RecurrenceFormValues; message: string } | null {
  if (!values.recurrence_type) return null

  if (!startDate) {
    return { path: 'recurrence_type', message: 'Informe a data para repetir' }
  }

  if (values.recurrence_ends === 'count') {
    const count = Number(values.recurrence_count)
    if (!Number.isInteger(count) || count < 2) {
      return { path: 'recurrence_count', message: 'Informe ao menos 2 ocorrências' }
    }
    if (count > MAX_OCCURRENCES) {
      return { path: 'recurrence_count', message: `Máximo de ${MAX_OCCURRENCES} ocorrências` }
    }
    return null
  }

  if (!values.recurrence_until) {
    return { path: 'recurrence_until', message: 'Informe até quando repetir' }
  }
  if (values.recurrence_until <= startDate) {
    return { path: 'recurrence_until', message: 'A data final precisa ser depois do início' }
  }
  return null
}

/** Valores do formulário a partir das colunas gravadas numa ocorrência. */
export function recurrenceFormValuesFrom(row: {
  recurrence_series_id: string | null
  recurrence_type: RecurrenceType | null
  recurrence_until: string | null
  recurrence_count: number | null
}): RecurrenceFormValues {
  // Sem série, a flag antiga (anterior à migration 52) não diz até quando:
  // o formulário abre como "não se repete".
  if (!row.recurrence_series_id || !row.recurrence_type) {
    return { recurrence_type: '', recurrence_ends: 'until' }
  }
  return {
    recurrence_type: row.recurrence_type,
    recurrence_ends: row.recurrence_count ? 'count' : 'until',
    recurrence_until: row.recurrence_until ?? '',
    recurrence_count: row.recurrence_count ? String(row.recurrence_count) : '',
  }
}
