'use client'

import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from '@/types/document.types'
import { CONTRACT_KIND_LABELS } from '@/types/contract.types'
import { formatCurrency } from '@/types/financialEntry.types'
import { personFieldValues } from '@/features/documentos/templates/partyFields'
import {
  personFromToolData,
  type PartyToolData,
} from '@/features/contratos/utils/partyToolInput'
import type { ActionOutput } from '../tools/actions'
import type { PendingAction } from '../hooks/useExecuteAction'

const ACTION_TITLES: Record<PendingAction['tool'], string> = {
  criar_tarefa: 'Criar tarefa',
  criar_evento: 'Criar compromisso',
  comentar_cliente: 'Comentar no cliente',
  registrar_movimentacao: 'Registrar movimentação',
  salvar_em_documentos: 'Salvar em Documentos',
  cadastrar_modelo: 'Cadastrar modelo de documento',
  cadastrar_cliente: 'Cadastrar cliente',
  completar_cliente: 'Completar o cadastro do cliente',
  registrar_contrato: 'Registrar contrato',
}

/** Os dados de uma pessoa, linha a linha — para conferir antes de gravar. */
function personRows(data: PartyToolData): [string, string][] {
  const person = personFromToolData(data)
  const values = personFieldValues(person)
  const rows: [string, string | undefined][] = [
    ['Nome', values.nome],
    [person.person_type === 'company' ? 'CNPJ' : 'CPF', values.documento],
    ['RG', values.rg],
    ['Nascimento', values.nascimento],
    ['Nacionalidade', values.nacionalidade],
    ['Estado civil', values.estado_civil],
    ['Profissão', values.profissao],
    ['Endereço', values.endereco],
    ['E-mail', values.email],
    ['Telefone', values.telefone],
    ['Representante', values.representante],
  ]
  return rows.filter((row): row is [string, string] => !!row[1])
}

/** Ações com dados aninhados (pessoa, partes) têm linhas próprias. */
function specificRows(action: PendingAction): [string, string][] | null {
  switch (action.tool) {
    case 'cadastrar_cliente':
      return personRows(action.input.dados)
    case 'completar_cliente':
      return [
        ['Cliente', action.input.cliente_nome],
        ['Só preenche', 'os campos vazios do cadastro'],
        // Nome e documento nunca mudam por esta ação (clientCompletionPatch).
        ...personRows(action.input.dados).filter(
          ([label]) => !['Nome', 'CPF', 'CNPJ'].includes(label),
        ),
      ]
    case 'registrar_contrato': {
      const { input } = action
      const rows: [string, string | undefined][] = [
        ['Tipo', CONTRACT_KIND_LABELS[input.tipo]],
        ['Nome', input.titulo],
        ['Status', input.status === 'aguardando_assinatura' ? 'Aguardando assinatura' : 'Rascunho'],
        ['Cliente', input.cliente_nome],
        ['Processo', input.processo_cnj],
        ['Valor', input.valor_total !== undefined ? formatCurrency(input.valor_total) : undefined],
        ['Parcelas', input.parcelas !== undefined ? String(input.parcelas) : undefined],
        ['Êxito', input.exito_percentual !== undefined ? `${input.exito_percentual}%` : undefined],
        ['Início', input.inicio ? formatValue('data', input.inicio) : undefined],
        ['Fim', input.fim ? formatValue('data', input.fim) : undefined],
        [
          'Partes',
          input.partes.map((party) => `${party.papel_rotulo}: ${party.nome}`).join('\n') ||
            undefined,
        ],
        ['Minuta', input.minuta_arquivo_id ? 'a gerada nesta conversa' : undefined],
        [
          'Anexos',
          input.anexos?.length
            ? `${input.anexos.length} ${input.anexos.length === 1 ? 'documento' : 'documentos'}`
            : undefined,
        ],
      ]
      return rows.filter((row): row is [string, string] => !!row[1])
    }
    default:
      return null
  }
}

/** Campos do input que valem a pena mostrar, com rótulo humano. Ids ficam de
 * fora: o usuário confirma "Maria Silva", não um uuid. */
const FIELD_LABELS: Record<string, string> = {
  titulo: 'Título',
  descricao: 'Descrição',
  prioridade: 'Prioridade',
  vencimento: 'Vencimento',
  hora: 'Hora',
  data: 'Data',
  data_fim: 'Término',
  hora_fim: 'Hora de término',
  tipo_nome: 'Tipo',
  local: 'Local',
  prazo_fatal: 'Prazo fatal',
  importante: 'Importante',
  urgente: 'Urgente',
  comentario: 'Comentário',
  cliente_nome: 'Cliente',
  processo_cnj: 'Processo',
  responsavel_nome: 'Responsável',
  arquivo_nome: 'Arquivo',
  nome: 'Nome',
  categoria: 'Categoria',
}

function formatValue(key: string, value: unknown): string {
  if (key === 'categoria' && typeof value === 'string' && value in DOCUMENT_CATEGORY_LABELS) {
    return DOCUMENT_CATEGORY_LABELS[value as DocumentCategory]
  }
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-')
    return `${d}/${m}/${y}`
  }
  return String(value)
}

interface ActionConfirmCardProps {
  action: PendingAction
  state: 'pending' | 'running' | 'done'
  output?: ActionOutput
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Card que a IA "entrega" quando propõe uma ação. Nada é gravado até o
 * clique em Confirmar — é a confirmação que dispara o service do módulo.
 */
export function ActionConfirmCard({ action, state, output, onConfirm, onCancel }: ActionConfirmCardProps) {
  const rows: [string, string][] =
    specificRows(action) ??
    Object.entries(action.input as Record<string, unknown>)
      .filter(
        ([key, value]) =>
          key in FIELD_LABELS && value !== undefined && value !== '' && value !== null,
      )
      .map(([key, value]) => [FIELD_LABELS[key], formatValue(key, value)])

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
      <p className="font-semibold">{ACTION_TITLES[action.tool]}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="whitespace-pre-wrap break-words">{value}</dd>
          </div>
        ))}
      </dl>

      {state === 'done' && output && (
        <p className={output.ok ? 'text-success' : 'text-muted-foreground'}>
          {output.ok ? 'Confirmado e gravado.' : `Não executado: ${output.motivo}`}
        </p>
      )}

      {state !== 'done' && (
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={onConfirm} disabled={state === 'running'}>
            {state === 'running' ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-1.5" />
            )}
            Confirmar
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={state === 'running'}>
            <X className="h-4 w-4 mr-1.5" />
            Cancelar
          </Button>
        </div>
      )}
    </div>
  )
}
