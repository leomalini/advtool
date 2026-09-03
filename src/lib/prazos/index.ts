/**
 * Motor de prazos processuais.
 *
 * Regras implementadas, com a fonte de cada uma:
 *
 *   · Publicação — Lei 11.419/2006 art. 4º §3º (e CPC art. 224 §2º):
 *     considera-se publicado no primeiro dia útil seguinte ao da
 *     disponibilização no Diário eletrônico.
 *   · Início do prazo — Lei 11.419/2006 art. 4º §4º (e CPC art. 224 §3º): o
 *     prazo começa a correr no primeiro dia útil seguinte ao da publicação.
 *   · Contagem — CPC art. 219: prazo processual em dias úteis. Prazo de direito
 *     material corre em dias corridos, daí o parâmetro `counting`.
 *   · Recesso — CPC art. 220 e CLT art. 775-A: o prazo fica suspenso entre 20
 *     de dezembro e 20 de janeiro, inclusive. A mesma janela vale para a
 *     Justiça do Trabalho, então não há regra por ramo aqui.
 *
 * Datas são strings 'yyyy-MM-dd' e a aritmética é toda em UTC. Objeto `Date`
 * em horário local desloca um dia inteiro dependendo do fuso — é o mesmo
 * defeito que a migration 33 teve de corrigir nos eventos.
 */
import { nationalHolidays, type IsoDate } from './feriados'

export type { IsoDate }
export { holidayName, easterSunday } from './feriados'

export type Counting = 'uteis' | 'corridos'

export interface PrazoOptions {
  /** Feriados locais e dias sem expediente forense, em 'yyyy-MM-dd'. */
  extraHolidays?: readonly IsoDate[]
  /** Desliga a suspensão de 20/12 a 20/01. Use para prazo de direito material,
   * que não se suspende no recesso. */
  ignoreRecess?: boolean
}

const DAY_MS = 86_400_000

function toDate(iso: IsoDate): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toIso(date: Date): IsoDate {
  return date.toISOString().slice(0, 10)
}

function shift(iso: IsoDate, days: number): IsoDate {
  return toIso(new Date(toDate(iso).getTime() + days * DAY_MS))
}

/** 20/12 a 20/01, inclusive nas duas pontas. */
function isInRecess(iso: IsoDate): boolean {
  const month = Number(iso.slice(5, 7))
  const day = Number(iso.slice(8, 10))
  return (month === 12 && day >= 20) || (month === 1 && day <= 20)
}

function isWeekend(iso: IsoDate): boolean {
  const weekday = toDate(iso).getUTCDay()
  return weekday === 0 || weekday === 6
}

/**
 * Dia útil forense: não é fim de semana, feriado nacional, feriado informado
 * nem dia dentro do recesso.
 */
export function isBusinessDay(iso: IsoDate, options: PrazoOptions = {}): boolean {
  if (isWeekend(iso)) return false
  if (!options.ignoreRecess && isInRecess(iso)) return false
  if (nationalHolidays(Number(iso.slice(0, 4))).has(iso)) return false
  return !options.extraHolidays?.includes(iso)
}

/** Primeiro dia útil DEPOIS da data informada (nunca a própria data). */
export function nextBusinessDay(iso: IsoDate, options: PrazoOptions = {}): IsoDate {
  let cursor = shift(iso, 1)
  // 42 dias cobre o recesso inteiro somado a feriados na saída dele; sem o
  // teto, uma opção mal formada viraria laço infinito.
  for (let guard = 0; guard < 42; guard++) {
    if (isBusinessDay(cursor, options)) return cursor
    cursor = shift(cursor, 1)
  }
  throw new Error(`Nenhum dia útil encontrado nos 42 dias após ${iso}`)
}

/** A própria data, se for útil; senão o próximo dia útil. */
export function businessDayOnOrAfter(iso: IsoDate, options: PrazoOptions = {}): IsoDate {
  return isBusinessDay(iso, options) ? iso : nextBusinessDay(iso, options)
}

/**
 * Soma dias ao prazo. Em dias úteis, `days` conta apenas dias úteis; em dias
 * corridos, o vencimento que cair em dia não útil é prorrogado para o próximo
 * dia útil (CPC art. 224 §1º).
 */
export function addDays(
  startIso: IsoDate,
  days: number,
  counting: Counting = 'uteis',
  options: PrazoOptions = {},
): IsoDate {
  if (days <= 0) return startIso

  if (counting === 'corridos') {
    return businessDayOnOrAfter(shift(startIso, days - 1), options)
  }

  // O primeiro dia do prazo é o próprio `startIso`, que já é útil por
  // construção — daí a contagem começar em 1.
  let cursor = startIso
  let counted = 1
  while (counted < days) {
    cursor = nextBusinessDay(cursor, options)
    counted++
  }
  return cursor
}

// ── As três datas da tela de publicação ───────────────────────────────────────

/** Disponibilização → publicação: primeiro dia útil seguinte (CPC 224 §2º). */
export function publicationDateFrom(
  availabilityIso: IsoDate,
  options: PrazoOptions = {},
): IsoDate {
  return nextBusinessDay(availabilityIso, options)
}

/** Publicação → início do prazo: primeiro dia útil seguinte (CPC 224 §3º). */
export function deadlineStartFrom(
  publicationIso: IsoDate,
  options: PrazoOptions = {},
): IsoDate {
  return nextBusinessDay(publicationIso, options)
}

export interface PrazoResult {
  /** Primeiro dia do prazo. */
  start: IsoDate
  /** Último dia — o vencimento. */
  end: IsoDate
  /** Dias corridos entre hoje e o vencimento; negativo quando já venceu. */
  remainingDays: number
  expired: boolean
}

/**
 * Prazo completo a partir da publicação.
 *
 * `today` é parâmetro em vez de `new Date()` interno para a função ser pura —
 * o que a torna testável e evita que a mesma publicação mostre contagem
 * diferente conforme o fuso de quem abriu a tela.
 */
export function calculatePrazo(
  publicationIso: IsoDate,
  days: number,
  today: IsoDate,
  counting: Counting = 'uteis',
  options: PrazoOptions = {},
): PrazoResult {
  const start = deadlineStartFrom(publicationIso, options)
  const end = addDays(start, days, counting, options)
  const remainingDays = Math.round((toDate(end).getTime() - toDate(today).getTime()) / DAY_MS)

  return { start, end, remainingDays, expired: remainingDays < 0 }
}
