'use client'

import { getToolName, isToolUIPart } from 'ai'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssistantUIMessage } from '../tools'
import { ACTION_TOOL_NAMES, type ActionOutput, type ActionToolName } from '../tools/actions'
import type { PendingAction } from '../hooks/useExecuteAction'
import { aiFileHref, parseAiFileUrl } from '../files/constants'
import { ActionConfirmCard } from './ActionConfirmCard'
import { AttachmentChip } from './AttachmentChip'
import { GeneratedFileCard } from './GeneratedFileCard'
import { MarkdownText } from './MarkdownText'

const READ_TOOL_LABELS: Record<string, string> = {
  buscar_clientes: 'Buscando clientes',
  detalhar_cliente: 'Lendo ficha do cliente',
  buscar_processos: 'Buscando processos',
  detalhar_processo: 'Lendo o processo',
  eventos_no_periodo: 'Consultando a agenda',
  listar_tarefas: 'Consultando tarefas',
  tipos_de_evento: 'Lendo tipos de compromisso',
  listar_publicacoes: 'Consultando publicações',
  ler_publicacao: 'Lendo a publicação',
  listar_lancamentos: 'Consultando o financeiro',
  membros_do_escritorio: 'Consultando a equipe',
  listar_documentos: 'Consultando documentos',
  ler_arquivo: 'Lendo o arquivo',
  listar_modelos: 'Consultando modelos',
  gerar_documento_de_modelo: 'Gerando documento do modelo',
  gerar_pdf: 'Gerando PDF',
}

/** Tools que devolvem um arquivo gerado — viram card de download. */
const GENERATOR_TOOLS: ReadonlySet<string> = new Set(['gerar_documento_de_modelo', 'gerar_pdf'])

interface GeneratedOutput {
  arquivo_id: string
  nome: string
  campos_faltando?: string[]
  avisos?: string[]
}

function isGeneratedOutput(output: unknown): output is GeneratedOutput {
  return (
    typeof output === 'object' &&
    output !== null &&
    typeof (output as { arquivo_id?: unknown }).arquivo_id === 'string' &&
    typeof (output as { nome?: unknown }).nome === 'string'
  )
}

function isActionTool(name: string): name is ActionToolName {
  return (ACTION_TOOL_NAMES as string[]).includes(name)
}

interface MessagePartsProps {
  message: AssistantUIMessage
  /** Esta mensagem está chegando agora. Fora disso, uma consulta sem
   * resultado é de um turno interrompido — não de algo em andamento. */
  streaming: boolean
  /** Ação em execução no momento (toolCallId), para o card mostrar o spinner. */
  runningCallId: string | null
  onConfirmAction: (toolCallId: string, action: PendingAction) => void
  onCancelAction: (toolCallId: string, action: PendingAction) => void
}

export function MessageParts({
  message,
  streaming,
  runningCallId,
  onConfirmAction,
  onCancelAction,
}: MessagePartsProps) {
  return (
    <div className="space-y-2">
      {message.parts.map((part, index) => {
        if (part.type === 'text') {
          if (!part.text.trim()) return null
          // Parte de texto não tem id próprio. A posição é estável: `parts`
          // só cresce no fim, nunca reordena.
          const key = `text-${index}`
          // Só a IA escreve Markdown. O que o usuário digita aparece como
          // digitou — um `*` numa pergunta não pode virar itálico.
          if (message.role === 'assistant') {
            return <MarkdownText key={key} text={part.text} />
          }
          return (
            <p key={key} className="whitespace-pre-wrap break-words leading-relaxed">
              {part.text}
            </p>
          )
        }

        if (part.type === 'file') {
          const id = parseAiFileUrl(part.url)
          return (
            <div key={`file-${index}`}>
              <AttachmentChip
                fileName={part.filename ?? 'arquivo'}
                href={id ? aiFileHref(id) : undefined}
                onPrimary={message.role === 'user'}
              />
            </div>
          )
        }

        if (!isToolUIPart(part)) return null
        const name = getToolName(part)

        if (isActionTool(name)) {
          // O card só aparece com o input completo; enquanto o modelo ainda
          // escreve o JSON, um chip basta.
          if (part.state === 'input-streaming') {
            return <ToolChip key={part.toolCallId} label="Preparando ação" busy={streaming} />
          }
          if (part.state === 'output-error') {
            return <ToolChip key={part.toolCallId} label="A ação não pôde ser preparada" />
          }
          if (part.state !== 'input-available' && part.state !== 'output-available') {
            return null
          }

          const action = { tool: name, input: part.input } as PendingAction
          const done = part.state === 'output-available'
          return (
            <ActionConfirmCard
              key={part.toolCallId}
              action={action}
              state={done ? 'done' : runningCallId === part.toolCallId ? 'running' : 'pending'}
              // `getToolName` não estreita o union de parts; o nome já garantiu
              // que é uma tool de ação, cuja saída é ActionOutput.
              output={done ? (part.output as ActionOutput) : undefined}
              onConfirm={() => onConfirmAction(part.toolCallId, action)}
              onCancel={() => onCancelAction(part.toolCallId, action)}
            />
          )
        }

        if (
          GENERATOR_TOOLS.has(name) &&
          part.state === 'output-available' &&
          isGeneratedOutput(part.output)
        ) {
          return (
            <GeneratedFileCard
              key={part.toolCallId}
              fileId={part.output.arquivo_id}
              fileName={part.output.nome}
              missingFields={part.output.campos_faltando}
              notes={part.output.avisos}
            />
          )
        }

        const label = READ_TOOL_LABELS[name] ?? name
        const inFlight = part.state === 'input-streaming' || part.state === 'input-available'
        return (
          <ToolChip
            key={part.toolCallId}
            label={part.state === 'output-error' ? `${label}: falhou` : label}
            busy={inFlight && streaming}
          />
        )
      })}
    </div>
  )
}

function ToolChip({ label, busy = false }: { label: string; busy?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground',
        busy && 'border-primary/30',
      )}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
      {label}
    </span>
  )
}
