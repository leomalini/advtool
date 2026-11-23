/**
 * A régua de avisos — puro, sem I/O, igual no servidor, no cron e na tela.
 *
 * Nada aqui é gravado: as etapas saem do vencimento, dos dias configurados e
 * do dia em que os lembretes foram ligados; o que já foi feito sai de
 * `billing_messages`. Mudar o vencimento recalcula tudo (docs/cobrancas.md,
 * fase 2).
 *
 * As regras do plano:
 *   · etapa "ao criar" no dia em que se liga, e as dos dias da régua;
 *   · o que cairia antes de ligar não é mandado depois;
 *   · sem aviso em domingo nem em feriado nacional: passa para o próximo dia;
 *   · duas etapas no mesmo dia viram uma, a mais adiantada na régua;
 *   · etapas acumuladas (ninguém mandou) viram uma só, a mais recente.
 */
import { nationalHolidays } from '@/lib/prazos/feriados'
import { addDaysISO } from './officeTime'

/** O padrão aprovado no plano: 7 e 2 antes, no dia, 2, 7 e 15 depois. */
export const DEFAULT_REMINDER_OFFSETS: readonly number[] = [-7, -2, 0, 2, 7, 15]
export const MIN_REMINDER_OFFSET = -30
export const MAX_REMINDER_OFFSET = 60
export const MAX_REMINDER_STEPS = 10

/** A etapa de cada dia da régua: 'd-7', 'd0', 'd+2'. */
export function stepForOffset(offset: number): string {
  if (offset === 0) return 'd0'
  return offset < 0 ? `d${offset}` : `d+${offset}`
}

/** O dia da régua de uma etapa; null para 'created' e 'resend'. */
export function offsetOfStep(step: string): number | null {
  const match = /^d([+-]?\d+)$/.exec(step)
  return match ? Number(match[1]) : null
}

/** Os dias da régua limpos: inteiros, no intervalo, sem repetição, em ordem. */
export function normalizeOffsets(offsets: readonly number[]): number[] {
  const valid = offsets.filter(
    (offset) =>
      Number.isInteger(offset) && offset >= MIN_REMINDER_OFFSET && offset <= MAX_REMINDER_OFFSET,
  )
  return [...new Set(valid)].sort((a, b) => a - b).slice(0, MAX_REMINDER_STEPS)
}

function weekday(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

/** Dia em que pode sair aviso: não é domingo nem feriado nacional. Sábado
 * pode, como decidido no plano. */
export function isReminderDay(isoDate: string): boolean {
  if (weekday(isoDate) === 0) return false
  return !nationalHolidays(Number(isoDate.slice(0, 4))).has(isoDate)
}

/** A própria data, se pode sair aviso; senão o próximo dia que pode. */
export function reminderDayOnOrAfter(isoDate: string): string {
  let cursor = isoDate
  // Feriado na segunda depois de um domingo é o pior caso; 10 dias sobram.
  for (let guard = 0; guard < 10; guard++) {
    if (isReminderDay(cursor)) return cursor
    cursor = addDaysISO(cursor, 1)
  }
  return cursor
}

export interface PlannedStep {
  /** 'created', ou o dia da régua ('d-7', 'd0', 'd+2'). */
  step: string
  /** Dias do vencimento; null na etapa "ao criar". */
  offset: number | null
  /** Quando o aviso sai, já fora de domingo e feriado. */
  date: string
}

/**
 * As etapas de uma cobrança, na ordem em que saem.
 *
 * `enabledOn` é o dia (em Brasília) em que os lembretes foram ligados.
 */
export function planReminderSteps(input: {
  dueDate: string
  enabledOn: string
  offsets: readonly number[]
}): PlannedStep[] {
  const candidates: PlannedStep[] = [
    { step: 'created', offset: null, date: reminderDayOnOrAfter(input.enabledOn) },
  ]
  for (const offset of normalizeOffsets(input.offsets)) {
    const date = reminderDayOnOrAfter(addDaysISO(input.dueDate, offset))
    if (date < input.enabledOn) continue
    candidates.push({ step: stepForOffset(offset), offset, date })
  }

  // Um aviso por dia: na ordem acima, o que vem depois é o mais adiantado na
  // régua ("vence hoje" ganha de "ao criar" no mesmo dia).
  const byDate = new Map<string, PlannedStep>()
  for (const candidate of candidates) byDate.set(candidate.date, candidate)
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * O aviso devido hoje, ou null. É a etapa mais recente que já chegou, se
 * ninguém tratou dela — as anteriores, se ficaram para trás, não voltam.
 *
 * `handledSteps`: as etapas com aviso já registrado para ESTE vencimento.
 */
export function dueReminder(
  plan: readonly PlannedStep[],
  today: string,
  handledSteps: ReadonlySet<string>,
): PlannedStep | null {
  const reached = plan.filter((step) => step.date <= today)
  const current = reached[reached.length - 1]
  if (!current || handledSteps.has(current.step)) return null
  return current
}

/** A próxima etapa depois de hoje, ou null se a régua acabou. */
export function nextReminder(plan: readonly PlannedStep[], today: string): PlannedStep | null {
  return plan.find((step) => step.date > today) ?? null
}

/** A etapa cujo texto vale hoje — para reenviar fora da régua: a mais
 * recente que já chegou, ou "ao criar". */
export function messageStepFor(plan: readonly PlannedStep[], today: string): string {
  const reached = plan.filter((step) => step.date <= today)
  return reached[reached.length - 1]?.step ?? 'created'
}

/** Como a etapa aparece na tela. */
export function describeStep(step: string): string {
  if (step === 'created') return 'Aviso de cobrança'
  if (step === 'resend') return 'Reenvio'
  const offset = offsetOfStep(step)
  if (offset === null) return step
  if (offset === 0) return 'No dia do vencimento'
  const days = Math.abs(offset) === 1 ? '1 dia' : `${Math.abs(offset)} dias`
  return offset < 0 ? `${days} antes` : `${days} depois`
}

/** Os dias da régua como frase: "7 e 2 dias antes, no dia, 2, 7 e 15 depois". */
export function describeOffsets(offsets: readonly number[]): string {
  const join = (values: number[]) =>
    values.length <= 1
      ? values.join('')
      : `${values.slice(0, -1).join(', ')} e ${values[values.length - 1]}`
  const before = offsets.filter((offset) => offset < 0).map((offset) => -offset).sort((a, b) => b - a)
  const after = offsets.filter((offset) => offset > 0)
  const parts: string[] = []
  if (before.length) parts.push(`${join(before)} ${before.length === 1 && before[0] === 1 ? 'dia' : 'dias'} antes`)
  if (offsets.includes(0)) parts.push('no dia')
  if (after.length) parts.push(`${join(after)} depois`)
  return parts.join(', ')
}

// ── Situação da cobrança ────────────────────────────────────────────────────

/** A situação que a aba Cobranças mostra. Nunca gravada: sai daqui. */
export type BillingReminderState =
  | 'paid'
  | 'closed'
  | 'link_only'
  | 'opted_out'
  | 'paused'
  | 'no_due_date'
  | 'ended'
  | 'due_today'
  | 'overdue'
  | 'scheduled'

export const BILLING_STATE_LABELS: Record<BillingReminderState, string> = {
  paid: 'Paga',
  closed: 'Encerrada',
  link_only: 'Só o link',
  opted_out: 'Cliente não recebe',
  paused: 'Pausada',
  no_due_date: 'Sem vencimento',
  ended: 'Régua encerrada',
  due_today: 'Vence hoje',
  overdue: 'Atrasada',
  scheduled: 'Agendada',
}

export interface BillingStateInput {
  entryPaid: boolean
  closed: boolean
  remindersEnabled: boolean
  optedOut: boolean
  paused: boolean
  dueDate: string | null
  today: string
  due: PlannedStep | null
  next: PlannedStep | null
}

export function billingReminderState(input: BillingStateInput): BillingReminderState {
  if (input.entryPaid) return 'paid'
  if (input.closed) return 'closed'
  if (!input.remindersEnabled) return 'link_only'
  if (input.optedOut) return 'opted_out'
  if (input.paused) return 'paused'
  if (!input.dueDate) return 'no_due_date'
  if (!input.due && !input.next) return 'ended'
  if (input.dueDate === input.today) return 'due_today'
  return input.dueDate < input.today ? 'overdue' : 'scheduled'
}

/** A régua só anda nestes estados: é neles que a fila oferece aviso. */
export function remindersRunning(state: BillingReminderState): boolean {
  return state === 'due_today' || state === 'overdue' || state === 'scheduled'
}
