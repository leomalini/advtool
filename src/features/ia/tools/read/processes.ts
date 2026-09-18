import { tool } from 'ai'
import { z } from 'zod'
import { PROCESS_STATUS_LABELS, PROCESS_TYPE_LABELS } from '@/types/legalProcess.types'
import type { ProcessStatus, ProcessType } from '@/types/legalProcess.types'
import { clientLabel, ilikeFilter, limitSchema, toolError, type ToolClient } from '../shared'

const LIST_SELECT =
  'id, cnj_number, court, court_division, comarca, plaintiff, defendant, status, process_type, ' +
  'subject, procedural_class, filing_date, case_value, updated_at, ' +
  'parties:legal_process_parties(name, polo, party_type, client_id, ' +
  'client:clients(type, name, company_name, trade_name))'

type PartyRow = {
  name: string
  polo: 'ativo' | 'passivo'
  party_type: string | null
  client_id: string | null
  client: { type: string; name: string | null; company_name: string | null; trade_name: string | null } | null
}

type ListRow = {
  id: string
  cnj_number: string | null
  court: string | null
  court_division: string | null
  comarca: string | null
  plaintiff: string | null
  defendant: string | null
  status: ProcessStatus
  process_type: ProcessType
  subject: string | null
  procedural_class: string | null
  filing_date: string | null
  case_value: number | null
  updated_at: string
  parties: PartyRow[]
}

function summarize(row: ListRow) {
  const parties = row.parties ?? []
  const byPolo = (polo: PartyRow['polo']) =>
    parties.filter((p) => p.polo === polo).map((p) => p.name)
  const clients = parties
    .filter((p) => p.client_id)
    .map((p) => ({ cliente_id: p.client_id, nome: clientLabel(p.client) ?? p.name }))

  return {
    id: row.id,
    cnj: row.cnj_number,
    tribunal: row.court,
    vara: row.court_division,
    comarca: row.comarca,
    status: PROCESS_STATUS_LABELS[row.status] ?? row.status,
    tipo: PROCESS_TYPE_LABELS[row.process_type] ?? row.process_type,
    assunto: row.subject,
    classe: row.procedural_class,
    polo_ativo: byPolo('ativo').length ? byPolo('ativo') : [row.plaintiff].filter(Boolean),
    polo_passivo: byPolo('passivo').length ? byPolo('passivo') : [row.defendant].filter(Boolean),
    clientes_vinculados: clients,
    ajuizado_em: row.filing_date,
    valor_da_causa: row.case_value,
    atualizado_em: row.updated_at,
  }
}

export function createProcessTools(supabase: ToolClient) {
  return {
    buscar_processos: tool({
      description:
        'Busca processos por número CNJ (ou parte dele), nome de parte, assunto ou tribunal, ' +
        'e/ou pelo id de um cliente vinculado. Sem filtros, lista os atualizados mais recentemente.',
      inputSchema: z.object({
        termo: z.string().max(120).optional().describe('CNJ, nome de parte, assunto ou tribunal.'),
        cliente_id: z.string().uuid().optional().describe('Só processos deste cliente.'),
        status: z.enum(['ativo', 'arquivado', 'suspenso']).optional(),
        limite: limitSchema,
      }),
      execute: async ({ termo, cliente_id, status, limite }) => {
        const max = limite ?? 10

        // Por cliente: as partes é que apontam para o cadastro; o filtro é
        // resolvido primeiro para não depender de embed filtrado.
        let ids: string[] | null = null
        if (cliente_id) {
          const { data, error } = await supabase
            .from('legal_process_parties')
            .select('legal_process_id')
            .eq('client_id', cliente_id)
          if (error) return toolError('processos', error)
          ids = [...new Set((data ?? []).map((r) => r.legal_process_id as string))]
          if (ids.length === 0) return { processos: [] }
        }

        let query = supabase
          .from('legal_processes')
          .select(LIST_SELECT)
          .order('updated_at', { ascending: false })
          .limit(max)
        if (ids) query = query.in('id', ids)
        if (status) query = query.eq('status', status)

        const term = termo?.trim()
        if (term) {
          query = query.or(
            ['cnj_number', 'plaintiff', 'defendant', 'subject', 'court']
              .map((column) => ilikeFilter(column, term))
              .join(','),
          )
        }

        const { data, error } = await query
        if (error) return toolError('processos', error)
        let rows = (data ?? []) as unknown as ListRow[]

        // O `or` acima não alcança as partes (tabela filha). Segunda passada
        // por nome de parte quando a primeira não achou nada.
        if (term && rows.length === 0) {
          const { data: parties, error: partiesError } = await supabase
            .from('legal_process_parties')
            .select('legal_process_id')
            // Filtro direto (fora do `or`): o valor não passa pela sintaxe do
            // PostgREST, basta tirar os curingas.
            .ilike('name', `%${term.replace(/[%_]/g, ' ')}%`)
            .limit(max)
          if (partiesError) return toolError('processos', partiesError)
          const partyIds = [...new Set((parties ?? []).map((r) => r.legal_process_id as string))]
          if (partyIds.length > 0) {
            const { data: byParty, error: byPartyError } = await supabase
              .from('legal_processes')
              .select(LIST_SELECT)
              .in('id', ids ? partyIds.filter((id) => ids!.includes(id)) : partyIds)
              .limit(max)
            if (byPartyError) return toolError('processos', byPartyError)
            rows = (byParty ?? []) as unknown as ListRow[]
          }
        }

        return { processos: rows.map(summarize) }
      },
    }),

    detalhar_processo: tool({
      description:
        'Detalhes de um processo pelo id: capa, partes, resumo gerado pela BuscaProcessos (quando ' +
        'existe) e as últimas movimentações/publicações.',
      inputSchema: z.object({
        processo_id: z.string().uuid(),
        movimentacoes: z.number().int().min(0).max(30).optional()
          .describe('Quantas movimentações recentes incluir (padrão 10).'),
      }),
      execute: async ({ processo_id, movimentacoes }) => {
        const { data, error } = await supabase
          .from('legal_processes')
          .select(LIST_SELECT + ', ai_summary, ai_summary_updated_at, opposing_counsel')
          .eq('id', processo_id)
          .maybeSingle()
        if (error) return toolError('o processo', error)
        if (!data) return { error: 'Processo não encontrado ou sem acesso.' }

        const { data: moves, error: movesError } = await supabase
          .from('legal_process_movements')
          .select('id, movement_date, kind, title, description, read_at, handled_at')
          .eq('legal_process_id', processo_id)
          .order('movement_date', { ascending: false })
          .limit(movimentacoes ?? 10)
        if (movesError) return toolError('as movimentações', movesError)

        const row = data as unknown as ListRow & {
          ai_summary: string | null
          ai_summary_updated_at: string | null
          opposing_counsel: string | null
        }
        return {
          ...summarize(row),
          advogado_contrario: row.opposing_counsel,
          resumo_ia: row.ai_summary,
          resumo_ia_em: row.ai_summary_updated_at,
          movimentacoes: (moves ?? []).map((m) => ({
            id: m.id,
            data: m.movement_date,
            tipo: m.kind,
            titulo: m.title,
            descricao: m.description,
            lida: m.read_at != null,
            tratada: m.handled_at != null,
          })),
        }
      },
    }),
  }
}
