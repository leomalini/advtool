import { addDays, differenceInCalendarDays, differenceInMinutes, format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { EventClient } from '@/types/event.types'
import type { HearingProcessCrmItem, HearingWithContext } from '@/types/hearing.types'
import { parseMovementText } from '@/features/movimentacoes/utils/movementText'

const PROCESSOS_WORKFLOW = 'wf-processos'

function clientName(client: EventClient | null | undefined): string | null {
  if (!client) return null
  if (client.type === 'individual') return client.name
  return client.trade_name ?? client.company_name
}

/** O card do workflow de processos carrega o cliente; qualquer um serve
 * quando não há. A mesma escolha de `movimentacoes/utils/display.ts`. */
function masterItem(hearing: HearingWithContext): HearingProcessCrmItem | null {
  const items = hearing.legal_process?.crm_items ?? []
  return items.find((item) => item.workflow_id === PROCESSOS_WORKFLOW) ?? items[0] ?? null
}

/** O cliente do compromisso, e o do processo quando o compromisso não tem —
 * a ficha sem data não tem compromisso nenhum. */
export function hearingClientName(hearing: HearingWithContext): string | null {
  return clientName(hearing.event?.client) ?? clientName(masterItem(hearing)?.client)
}

export function hearingProcessLabel(hearing: HearingWithContext): {
  label: string
  isCnj: boolean
} {
  const cnj = hearing.legal_process?.cnj_number
  if (cnj) return { label: cnj, isCnj: true }
  const title = masterItem(hearing)?.title?.trim()
  if (title) return { label: title, isCnj: false }
  return { label: hearing.legal_process ? 'Processo sem número' : 'Sem processo', isCnj: false }
}

/** Onde: vara e comarca do processo; sem processo, o local do compromisso. */
export function hearingPlace(hearing: HearingWithContext): string | null {
  const process = hearing.legal_process
  const court = [process?.court_division, process?.comarca].filter(Boolean).join(' · ')
  return court || hearing.event?.location || null
}

export function hearingKindLabel(hearing: HearingWithContext): string {
  return hearing.kind?.label ?? 'Audiência'
}

/** "14:00 – 14:30". Mesmo início e fim (compromisso antigo, sem duração) vira
 * só a hora. */
export function hearingTimeRange(startAt: string, endAt: string, allDay: boolean): string {
  if (allDay) return 'Dia todo'
  const start = format(parseISO(startAt), 'HH:mm')
  const end = format(parseISO(endAt), 'HH:mm')
  return start === end ? start : `${start} – ${end}`
}

/** "12/11/2026 às 14:20". */
export function formatHearingDateTime(iso: string): string {
  return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm")
}

/** "quinta, 12 de novembro de 2026 · 14:20". */
export function formatHearingLong(iso: string): string {
  return format(parseISO(iso), "EEEE, d 'de' MMMM 'de' yyyy · HH:mm", { locale: ptBR })
}

/**
 * Quanto falta, no relógio local. A contagem em dias é por dia de calendário,
 * não por 24 h: uma audiência amanhã às 9h é "amanhã" mesmo às 23h de hoje.
 */
export function hearingCountdown(startAt: string, endAt: string, now: Date): string {
  const start = parseISO(startAt)
  const end = parseISO(endAt)

  if (now >= start && now <= end) return 'Agora'

  const minutes = differenceInMinutes(start, now)
  if (minutes > 0 && minutes < 60) return `Em ${minutes} min`

  const days = differenceInCalendarDays(start, now)
  if (days === 0) return start > now ? 'Hoje' : 'Encerrada hoje'
  if (days === 1) return 'Amanhã'
  if (days > 1) return `Em ${days} dias`
  if (days === -1) return 'Ontem'
  return `Há ${-days} dias`
}

/** Cabeçalho do dia na pauta: "Hoje", "Amanhã" ou o dia da semana. */
export function dayHeading(dayKey: string, today: Date): { title: string; subtitle: string } {
  const day = parseISO(dayKey)
  const subtitle = format(day, "EEEE, d 'de' MMMM", { locale: ptBR })
  const offset = differenceInCalendarDays(day, today)
  if (offset === 0) return { title: 'Hoje', subtitle }
  if (offset === 1) return { title: 'Amanhã', subtitle }
  return { title: format(day, 'EEEE', { locale: ptBR }), subtitle: format(day, "d 'de' MMMM", { locale: ptBR }) }
}

/** O ato que designou a audiência, legível: sem os códigos da TPU. */
export function hearingMovementText(hearing: HearingWithContext): string | null {
  const movement = hearing.movement
  if (!movement) return null
  const { headline, detail } = parseMovementText(movement.title?.trim() || movement.description)
  return [headline, detail].filter(Boolean).join(' — ')
}

/** O DIA do ato. `movement_date` é meia-noite UTC do dia — cortar o ISO é a
 * convenção do projeto para esta coluna (ver `formatMovementDay`). */
export function formatActDay(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** Fim da janela da pauta: o último instante do dia `days - 1` a partir de
 * hoje. "7 dias" = hoje e os seis seguintes. */
export function windowEnd(today: Date, days: number): Date {
  const last = addDays(today, days - 1)
  last.setHours(23, 59, 59, 999)
  return last
}
