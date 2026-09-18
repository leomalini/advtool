'use client'

import { Check, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DOCUMENT_CATEGORY_LABELS, type DocumentCategory } from '@/types/document.types'
import type { ActionOutput } from '../tools/actions'
import type { PendingAction } from '../hooks/useExecuteAction'

const ACTION_TITLES: Record<PendingAction['tool'], string> = {
  criar_tarefa: 'Criar tarefa',
  criar_evento: 'Criar compromisso',
  comentar_cliente: 'Comentar no cliente',
  registrar_movimentacao: 'Registrar movimentação',
  salvar_em_documentos: 'Salvar em Documentos',
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
  const rows = Object.entries(action.input).filter(
    ([key, value]) => key in FIELD_LABELS && value !== undefined && value !== '' && value !== null,
  )

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm space-y-2">
      <p className="font-semibold">{ACTION_TITLES[action.tool]}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground">{FIELD_LABELS[key]}</dt>
            <dd className="whitespace-pre-wrap break-words">{formatValue(key, value)}</dd>
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
