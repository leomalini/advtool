import { htmlToText, excerptFrom } from './htmlToText'
import { movementHash } from './hashes'
import { toIsoDate } from './dates'
import { deadlineStartFrom, publicationDateFrom } from '@/lib/prazos'
import type { PublicationIngestRow, PublicationIngestParty } from '@/lib/publicacoes/ingest'
import type { BpIntimacao, BpMovimentacao, BpWebhookDiarioData } from './types'

/**
 * As duas formas em que a BuscaProcessos entrega uma publicação, traduzidas
 * para a linha de `publications`.
 *
 * Ficam juntas e fora dos sincronizadores porque o webhook precisa das duas: o
 * corpo que ele recebe pode ter a forma de uma intimação (`dataPublicacao`) ou
 * de uma movimentação de diário (`tipo_publicacao`), e mapear de novo lá
 * abriria a porta para as duas versões divergirem — que é a origem de toda
 * duplicata deste módulo.
 */

/** GET /v1/intimacoes — a íntegra vem em HTML e `conteudo` é só um trecho. */
export function intimacaoToPublicationRow(
  intimacao: BpIntimacao,
  legalProcessId: string | null,
): PublicationIngestRow {
  const contentText = htmlToText(intimacao.conteudoCompletoHtml) || (intimacao.conteudo ?? '')
  const publicationDate = intimacao.dataPublicacao ?? null

  return {
    legal_process_id: legalProcessId,
    cnj_number: intimacao.processo?.numeroCnj ?? null,
    source: 'busca_processos',
    external_id: intimacao.id != null ? String(intimacao.id) : null,
    court: intimacao.diario?.sigla ?? null,
    diario_name: intimacao.diario?.nome ?? null,
    diario_sigla: intimacao.diario?.sigla ?? null,
    oab_state: intimacao.oab?.estado ?? null,
    oab_number: intimacao.oab?.numero ?? null,
    publication_date: publicationDate,
    // A API só informa a publicação. A disponibilização fica nula em vez de
    // ser chutada para trás — é dado do diário, não nosso.
    availability_date: null,
    deadline_start_at: publicationDate ? deadlineStartFrom(publicationDate) : null,
    title: intimacao.titulo ?? null,
    excerpt: excerptFrom(contentText || (intimacao.conteudo ?? '')),
    content_html: intimacao.conteudoCompletoHtml ?? null,
    content_text: contentText,
    external_url: intimacao.link ?? null,
    raw_data: intimacao,
  }
}

/**
 * Movimentação com `tipo_publicacao` preenchido — origem diário oficial.
 *
 * O `external_id` reaproveita o hash de deduplicação da timeline, com prefixo
 * para não colidir com o id de uma intimação vinda de /v1/intimacoes.
 */
export async function movimentacaoToPublicationRow(
  mov: BpMovimentacao,
  { legalProcessId, cnj }: { legalProcessId: string | null; cnj: string | null },
): Promise<PublicationIngestRow> {
  const conteudo = mov.conteudo ?? ''

  // `data` na movimentação é a DISPONIBILIZAÇÃO no diário, não a publicação.
  // Daí saem as outras duas por dias úteis: publicação no primeiro dia útil
  // seguinte (Lei 11.419/2006, art. 4º §3º) e início do prazo no primeiro dia
  // útil seguinte a essa (art. 4º §4º).
  const availabilityDate = toIsoDate(mov.data)
  const publicationDate = availabilityDate ? publicationDateFrom(availabilityDate) : null

  return {
    legal_process_id: legalProcessId,
    cnj_number: cnj,
    source: 'busca_processos',
    external_id: `mov:${await movementHash(mov)}`,
    court: mov.fonte?.sigla ?? null,
    diario_sigla: mov.fonte?.sigla ?? null,
    availability_date: availabilityDate,
    publication_date: publicationDate,
    deadline_start_at: publicationDate ? deadlineStartFrom(publicationDate) : null,
    // O tipo que a tela mostra ("APELAÇÃO CÍVEL") vem pronto aqui — é o único
    // caminho em que a API informa esse campo.
    publication_type: mov.tipo_publicacao ?? null,
    title: mov.classificacao_predita?.nome ?? null,
    excerpt: excerptFrom(conteudo),
    // Movimentação vem em texto puro, sem marcação: não há HTML a guardar.
    content_html: null,
    content_text: conteudo,
    // A página do diário no tribunal. Chega junto com `tipo_publicacao` — só a
    // publicação tem link, a movimentação de serventuário vem com null. Sem
    // este mapeamento a publicação que entra pelo cadastro do processo ficava
    // sem link nenhum, enquanto a mesma publicação vinda por OAB ou webhook
    // tinha o dela.
    external_url: mov.link_publicacao_tribunal ?? null,
    raw_data: mov,
  }
}

// ── Publicação de diário vinda do WEBHOOK ─────────────────────────────────────

type DiarioMovimentacao = NonNullable<BpWebhookDiarioData['movimentacao']>

/**
 * `diario_movimentacao_nova` — o evento do monitoramento por OAB/termo.
 *
 * É o caminho por onde a intimação chega sozinha, e a forma dele não tem nada
 * a ver com a de `/v1/intimacoes`: o CNJ vem em `processo.numero_novo`, o tipo
 * em `tipo` (não `tipo_publicacao`), o conteúdo em HTML e a data com hora.
 *
 * O `conteudo` PRECISA passar por `htmlToText`: é o texto normalizado que
 * alimenta a impressão digital, e é só por ele que esta publicação reconhece a
 * gêmea que entrou pelo cadastro do processo (texto puro) ou pela busca por
 * OAB (outro HTML). HTML cru no `content_text` deixaria cada fonte com um
 * fingerprint diferente — ou seja, de volta à duplicata.
 */
/**
 * O CNJ de uma publicação de diário.
 *
 * `processo.numero_novo` é o campo do contrato, e é o que chega numa reentrega
 * manual daquele formato. As entregas reais não trazem esse objeto: o número
 * está em `numero_processo` — e em `processo_id`, que apesar do nome vem com o
 * CNJ. Conferido nas entregas de `diario_movimentacao_nova` registradas em
 * `webhook_events`, não inferido do nome do campo.
 *
 * A máscara é o que separa o CNJ de um id numérico que ocupe o mesmo campo: sem
 * ela, `processo_id: 222` entraria como número de processo — e o `cnj_number`
 * da publicação é por onde a intimação encontra o processo do escritório.
 */
const CNJ_MASK = /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/

export function diarioCnj(mov: DiarioMovimentacao): string | null {
  for (const candidate of [mov.processo?.numero_novo, mov.numero_processo, mov.processo_id]) {
    const value = typeof candidate === 'string' ? candidate.trim() : null
    if (value && CNJ_MASK.test(value)) return value
  }
  return null
}

export function diarioToPublicationRow(
  mov: DiarioMovimentacao,
  legalProcessId: string | null,
): PublicationIngestRow {
  const contentText = htmlToText(mov.conteudo)

  // `data` é a DISPONIBILIZAÇÃO no diário — confirmado com a origem, não
  // inferido do nome do campo. Publicação e início do prazo saem dela por dias
  // úteis (Lei 11.419/2006, art. 4º §3º e §4º), mesmo tratamento da
  // movimentação de diário vinda do REST — o que faz a mesma publicação cair
  // na mesma data por qualquer das duas portas, e é do que a janela de
  // deduplicação depende.
  //
  // Se algum dia a origem passar a mandar aqui a data de PUBLICAÇÃO, o prazo
  // inteiro anda um dia útil para frente e ninguém percebe: seria preciso
  // usar `data` direto como publication_date.
  const availabilityDate = toIsoDate(mov.data)
  const publicationDate = availabilityDate ? publicationDateFrom(availabilityDate) : null

  const advogado = (mov.envolvidos ?? []).find((envolvido) => isAdvogado(envolvido.envolvido_tipo))
  const oab = parseOab(advogado?.oab)

  return {
    legal_process_id: legalProcessId,
    cnj_number: diarioCnj(mov),
    source: 'busca_processos',
    // Id estável da origem, com prefixo para não colidir com o id de uma
    // intimação de /v1/intimacoes nem com o hash de uma movimentação.
    external_id: mov.id != null ? `diario:${mov.id}` : null,
    diario_name: diarioName(mov.diario_oficial),
    oab_state: oab?.estado ?? null,
    oab_number: oab?.numero ?? null,
    availability_date: availabilityDate,
    publication_date: publicationDate,
    deadline_start_at: publicationDate ? deadlineStartFrom(publicationDate) : null,
    publication_type: mov.tipo ?? null,
    subject: mov.secao ?? null,
    title: mov.texto_categoria ?? null,
    excerpt: excerptFrom(contentText),
    content_html: mov.conteudo ?? null,
    content_text: contentText,
    external_url: mov.link ?? null,
    raw_data: mov,
    parties: (mov.envolvidos ?? []).map((envolvido, position) => ({
      name: envolvido.nome,
      // A tabela só aceita estes dois papéis (migration 44); quem não é
      // advogado é destinatário da intimação.
      role: isAdvogado(envolvido.envolvido_tipo) ? 'advogado' : 'destinatario',
      oab: envolvido.oab ?? null,
      position,
    })) satisfies PublicationIngestParty[],
  }
}

function isAdvogado(tipo: string | null | undefined): boolean {
  return /advog/i.test(tipo ?? '')
}

/** '26/05/2026 | Diário Oficial Exemplo' → 'Diário Oficial Exemplo'. */
function diarioName(value: string | null | undefined): string | null {
  if (!value) return null
  const parts = value.split('|')
  return (parts.length > 1 ? parts.slice(1).join('|') : parts[0]).trim() || null
}

/** '123456/SP' → { numero: '123456', estado: 'SP' }. */
function parseOab(value: string | null | undefined): { numero: string; estado: string } | null {
  const match = (value ?? '').match(/(\d+)\s*\/\s*([A-Za-z]{2})/)
  if (!match) return null
  return { numero: match[1], estado: match[2].toUpperCase() }
}
