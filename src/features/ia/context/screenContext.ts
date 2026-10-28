import { z } from 'zod'

/**
 * O contexto da tela (fase 4a): onde a pessoa estava ao perguntar, pelo
 * painel do Assistente. Vai na própria mensagem, como parte `data-context`, e
 * é gravado com ela em `ai_messages.parts`. Assim o histórico que o modelo
 * recebe é o mesmo a cada turno (o cache e o raciocínio dependem disso), e
 * cada pergunta guarda a tela daquele momento.
 *
 * Fica fora do `system` de propósito: o prefixo cacheado é o mesmo para toda
 * a equipe e não pode mudar a cada tela.
 */

/**
 * Os registros que abrem em página, mais a audiência. A ficha da audiência é
 * um modal, que trava o resto da tela (o painel inclusive): ela não registra
 * nada, e entra pelo botão do próprio modal, que manda a pergunta pronta com
 * o contexto (ver `askAssistant`).
 */
export const SCREEN_ENTITY_KINDS = [
  'cliente',
  'pessoa',
  'processo',
  'contrato',
  'publicacao',
  'audiencia',
] as const

export type ScreenEntityKind = (typeof SCREEN_ENTITY_KINDS)[number]

export const SCREEN_ENTITY_LABELS: Record<ScreenEntityKind, string> = {
  cliente: 'Cliente',
  pessoa: 'Pessoa',
  processo: 'Processo',
  contrato: 'Contrato',
  publicacao: 'Publicação',
  audiencia: 'Audiência',
}

/** Limites do que o navegador pode mandar: o bloco entra em toda pergunta. */
const MAX_LABEL = 300
const MAX_ENTITIES = 3
const MAX_FILTERS = 12
const MAX_FILTER_LABEL = 60
const MAX_FILTER_VALUE = 200

const screenEntitySchema = z.object({
  kind: z.enum(SCREEN_ENTITY_KINDS),
  id: z.string().uuid(),
  label: z.string().max(MAX_LABEL),
})

const screenFilterSchema = z.object({
  label: z.string().min(1).max(MAX_FILTER_LABEL),
  value: z.string().min(1).max(MAX_FILTER_VALUE),
})

/** Validado na rota (`dataSchemas` do `safeValidateUIMessages`). */
export const screenContextSchema = z.object({
  page: z.string().min(1).max(80),
  /** O primeiro é o registro da página; os outros, ligados a ele (o cliente
   * do processo, o processo da publicação). */
  entities: z.array(screenEntitySchema).max(MAX_ENTITIES),
  filters: z.array(screenFilterSchema).max(MAX_FILTERS),
})

export type ScreenEntity = z.infer<typeof screenEntitySchema>
export type ScreenFilter = z.infer<typeof screenFilterSchema>
export type ScreenContext = z.infer<typeof screenContextSchema>

/** O que uma tela informa sobre si (ver `useAssistantScreen`). */
export interface ScreenRegistration {
  entities?: ScreenEntity[]
  filters?: ScreenFilter[]
}

/** Filtros a partir de pares rótulo → valor; o que está vazio fica de fora. */
export function screenFilters(
  entries: ReadonlyArray<readonly [label: string, value: string | null | undefined | false]>,
): ScreenFilter[] {
  return entries.flatMap(([label, value]) => (value ? [{ label, value }] : []))
}

/** Pessoa da equipe num filtro: o nome para ler, o id para as tools. */
export function personFilterValue(id: string | null, name: string | undefined): string | null {
  if (!id) return null
  return name ? `${name} (id: ${id})` : `id: ${id}`
}

export const SECTION_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  crm: 'CRM',
  processos: 'Processos',
  movimentacoes: 'Movimentações',
  publicacoes: 'Publicações',
  agenda: 'Agenda',
  audiencias: 'Audiências',
  clientes: 'Clientes',
  pessoas: 'Pessoas',
  tarefas: 'Tarefas',
  documentos: 'Documentos',
  contratos: 'Contratos',
  financeiro: 'Financeiro',
  pendencias: 'Pendências',
  configuracoes: 'Configurações',
}

/** Rótulo da página pela primeira parte da rota ("/processos/…" → Processos). */
function pageLabel(pathname: string): string {
  const section = pathname.split('/')[1] ?? ''
  return SECTION_LABELS[section] ?? 'Outra página'
}

/**
 * O contexto a partir da rota e do que as telas montadas registraram. Os
 * registros da última tela a montar vêm primeiro; um id repetido conta uma
 * vez. Corta nos limites do esquema em vez de deixar a rota recusar.
 */
export function buildScreenContext(
  pathname: string,
  registrations: readonly ScreenRegistration[],
): ScreenContext {
  const seen = new Set<string>()
  const entities: ScreenEntity[] = []
  for (const registration of [...registrations].reverse()) {
    for (const entity of registration.entities ?? []) {
      if (seen.has(entity.id)) continue
      seen.add(entity.id)
      entities.push({ ...entity, label: entity.label.trim().slice(0, MAX_LABEL) })
    }
  }

  const filters = registrations
    .flatMap((registration) => registration.filters ?? [])
    .map((filter) => ({
      label: filter.label.trim().slice(0, MAX_FILTER_LABEL),
      value: filter.value.trim().slice(0, MAX_FILTER_VALUE),
    }))
    .filter((filter) => filter.label !== '' && filter.value !== '')

  return {
    page: pageLabel(pathname),
    entities: entities.slice(0, MAX_ENTITIES),
    filters: filters.slice(0, MAX_FILTERS),
  }
}

/** Uma linha para a tela: o registro em foco, ou a página com os filtros. */
export function screenContextSummary(context: ScreenContext): string {
  const focus = context.entities[0]
  if (focus) {
    const kind = SCREEN_ENTITY_LABELS[focus.kind]
    return focus.label ? `${kind}: ${focus.label}` : kind
  }
  const filters = context.filters.length
  if (filters === 0) return context.page
  return `${context.page} · ${filters} ${filters === 1 ? 'filtro' : 'filtros'}`
}

/** Sem `<` e `>`: o texto vem do cadastro e não pode fechar o bloco. */
function plain(text: string): string {
  return text.replace(/[<>]/g, '')
}

function describeEntity(entity: ScreenEntity): string {
  const kind = SCREEN_ENTITY_LABELS[entity.kind].toLowerCase()
  const label = entity.label ? ` "${plain(entity.label)}"` : ''
  return `${kind}${label} (id: ${entity.id})`
}

/**
 * O bloco que o modelo recebe no começo da pergunta. Determinístico: a mesma
 * parte gera sempre o mesmo texto, turno após turno.
 */
export function formatScreenContext(context: ScreenContext): string {
  const [focus, ...others] = context.entities
  const lines = [`Página: ${plain(context.page)}`]
  if (focus) lines.push(`Em foco: ${describeEntity(focus)}`)
  for (const entity of others) lines.push(`Também na tela: ${describeEntity(entity)}`)
  if (context.filters.length > 0) {
    const filters = context.filters.map((f) => `${plain(f.label)}: ${plain(f.value)}`)
    lines.push(`Filtros: ${filters.join('; ')}`)
  }
  return `<tela_atual>\n${lines.join('\n')}\n</tela_atual>`
}
