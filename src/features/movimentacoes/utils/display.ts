import type {
  LegalProcessMovement,
  LegalProcessMovementWithContext,
} from '@/types/legalProcess.types'
import { parseMovementText, type MovementText } from './movementText'

const PROCESSOS_WORKFLOW = 'wf-processos'

/**
 * O DIA do ato, sem hora.
 *
 * `movement_date` é timestamptz, mas a origem só informa a data: montar um
 * `Date` a partir do carimbo completo trazia uma hora inventada e, em fuso
 * negativo, o dia anterior ao que o tribunal registrou. Cortar o ISO por
 * posição é a convenção do projeto para esta coluna.
 *
 * ⚠️ A mesma função existe, privada, em `MovimentacoesFeed.tsx:15` e em
 * `ProcessoDetailPage.tsx` (`formatMovementDate`). Unificar as três é
 * refatoração daqueles módulos, fora do escopo deste.
 */
export function formatMovementDay(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-')
  if (!year || !month || !day) return '—'
  return `${day}/${month}/${year}`
}

type MovementCrmItem = LegalProcessMovementWithContext['legal_process']['crm_items'][number]

/** O card do workflow de processos é o que carrega o cliente; qualquer um
 * serve quando não há. Mesma escolha de `MovimentacoesFeed` e
 * `groupProcessNews`. */
function masterItem(movimentacao: LegalProcessMovementWithContext): MovementCrmItem | null {
  const items = movimentacao.legal_process.crm_items ?? []
  return items.find((item) => item.workflow_id === PROCESSOS_WORKFLOW) ?? items[0] ?? null
}

/** Nome do cliente, ou `null` quando a parte não é cliente cadastrado — o nulo
 * é o que permite omitir a linha em vez de imprimir '(sem cliente)'. */
export function movementClientName(
  movimentacao: LegalProcessMovementWithContext,
): string | null {
  const client = masterItem(movimentacao)?.client
  if (!client) return null
  if (client.type === 'individual') return client.name
  return client.trade_name ?? client.company_name
}

/** O que identifica a linha: o CNJ primeiro, o título do card quando não há
 * número. */
export function movementProcessLabel(movimentacao: LegalProcessMovementWithContext): {
  label: string
  isCnj: boolean
} {
  const cnj = movimentacao.legal_process.cnj_number
  if (cnj) return { label: cnj, isCnj: true }

  const title = masterItem(movimentacao)?.title?.trim()
  return { label: title || 'Processo sem número', isCnj: false }
}

/**
 * O ato como a linha o mostra: movimento em cima, complementos embaixo.
 *
 * A classificação da origem vira o título no sync REST; o webhook não manda
 * classificação, então a descrição é tudo que há. Em 48 das 171 linhas da base
 * esse texto vem no formato codificado da TPU, e é `parseMovementText` que
 * separa o que se lê do que é código — ver `movementText.ts`.
 */
export function movementText(
  // `Pick` e não o tipo inteiro: é só o que a função lê, e assim ela serve
  // tanto à listagem (que tem o contexto do processo) quanto à timeline dentro
  // do processo, que só tem a movimentação.
  movimentacao: Pick<LegalProcessMovement, 'title' | 'description'>,
): MovementText {
  return parseMovementText(movimentacao.title?.trim() || movimentacao.description)
}

/** Sugestão para a tarefa nascida do ato, cortada no limite da coluna
 * `tasks.title` (200 no schema Zod). Leva o complemento: "Expedição de
 * documento — Mandado" diz o que precisa ser feito; só "Expedição de
 * documento" não. */
export function suggestedTaskTitle(
  movimentacao: Pick<LegalProcessMovement, 'title' | 'description'>,
): string {
  const { headline, detail } = movementText(movimentacao)
  return [headline, detail]
    .filter(Boolean)
    .join(' — ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}
