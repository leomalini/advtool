import { tool } from 'ai'
import { z } from 'zod'
import { clientLabel, ilikeFilter, limitSchema, toolError, type ToolClient } from '../shared'

const LIST_SELECT =
  'id, type, name, company_name, trade_name, cpf, cnpj, phone, email, legal_areas, ' +
  'assignee:profiles!clients_assigned_to_fkey(full_name)'

const DETAIL_SELECT =
  LIST_SELECT +
  ', notes, tags, birth_date, profession, marital_status, nationality, created_at, ' +
  'contacts:client_contacts(*), addresses:client_addresses(*)'

type ListRow = {
  id: string
  type: string
  name: string | null
  company_name: string | null
  trade_name: string | null
  cpf: string | null
  cnpj: string | null
  phone: string | null
  email: string | null
  legal_areas: string[]
  assignee: { full_name: string } | null
}

function summarize(row: ListRow) {
  return {
    id: row.id,
    nome: clientLabel(row),
    tipo: row.type === 'company' ? 'Pessoa jurídica' : 'Pessoa física',
    documento: row.cpf ?? row.cnpj ?? null,
    telefone: row.phone,
    email: row.email,
    areas: row.legal_areas ?? [],
    responsavel: row.assignee?.full_name ?? null,
  }
}

export function createClientTools(supabase: ToolClient) {
  return {
    buscar_clientes: tool({
      description:
        'Busca clientes do escritório por nome, razão social, nome fantasia, CPF ou CNPJ. ' +
        'Sem termo, lista os mais recentes. Use antes de qualquer pergunta sobre um cliente ' +
        'para descobrir o id.',
      inputSchema: z.object({
        termo: z.string().max(120).optional().describe('Trecho do nome ou do documento.'),
        limite: limitSchema,
      }),
      execute: async ({ termo, limite }) => {
        let query = supabase
          .from('clients')
          .select(LIST_SELECT)
          .order('created_at', { ascending: false })
          .limit(limite ?? 10)

        const term = termo?.trim()
        if (term) {
          const filters = [
            ilikeFilter('name', term),
            ilikeFilter('company_name', term),
            ilikeFilter('trade_name', term),
          ]
          // Colunas normalizadas (migration 59): o documento é gravado ora
          // mascarado, ora em dígitos puros.
          const digits = term.replace(/\D/g, '')
          if (digits.length >= 3) {
            filters.push(`cpf_digits.like.%${digits}%`, `cnpj_digits.like.%${digits}%`)
          }
          query = query.or(filters.join(','))
        }

        const { data, error } = await query
        if (error) return toolError('clientes', error)
        return { clientes: ((data ?? []) as unknown as ListRow[]).map(summarize) }
      },
    }),

    detalhar_cliente: tool({
      description:
        'Ficha completa de um cliente pelo id: qualificação, contatos, endereços e observações.',
      inputSchema: z.object({ cliente_id: z.string().uuid() }),
      execute: async ({ cliente_id }) => {
        const { data, error } = await supabase
          .from('clients')
          .select(DETAIL_SELECT)
          .eq('id', cliente_id)
          .maybeSingle()
        if (error) return toolError('o cliente', error)
        if (!data) return { error: 'Cliente não encontrado ou sem acesso.' }

        const row = data as unknown as ListRow & {
          notes: string | null
          tags: string[]
          birth_date: string | null
          profession: string | null
          marital_status: string | null
          nationality: string | null
          created_at: string
          contacts: Array<{ name?: string; phone?: string | null; email?: string | null; role?: string | null }>
          addresses: Array<Record<string, unknown>>
        }
        return {
          ...summarize(row),
          observacoes: row.notes,
          tags: row.tags ?? [],
          nascimento: row.birth_date,
          profissao: row.profession,
          estado_civil: row.marital_status,
          nacionalidade: row.nationality,
          cadastrado_em: row.created_at,
          contatos: row.contacts ?? [],
          enderecos: row.addresses ?? [],
        }
      },
    }),
  }
}
