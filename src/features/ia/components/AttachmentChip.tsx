'use client'

import { AlertCircle, FileImage, FileSpreadsheet, FileText, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { aiFileTypeFromName, type AiFileKind } from '../files/constants'
import type { AttachmentStatus } from '../hooks/useChatAttachments'

const KIND_ICONS: Record<AiFileKind, React.ComponentType<{ className?: string }>> = {
  pdf: FileText,
  image: FileImage,
  docx: FileText,
  xlsx: FileSpreadsheet,
  csv: FileSpreadsheet,
  txt: FileText,
}

interface AttachmentChipProps {
  fileName: string
  /** Abre o arquivo (rota que redireciona para URL assinada). */
  href?: string
  status?: AttachmentStatus
  onRemove?: () => void
  /** Dentro do balão do usuário, que tem fundo `primary`. */
  onPrimary?: boolean
}

/**
 * Um anexo: na caixa de envio (com status do upload e remover) ou dentro de
 * uma mensagem (link para abrir).
 */
export function AttachmentChip({ fileName, href, status, onRemove, onPrimary = false }: AttachmentChipProps) {
  const kind = aiFileTypeFromName(fileName)?.kind
  const Icon =
    status === 'uploading' ? Loader2 : status === 'error' ? AlertCircle : kind ? KIND_ICONS[kind] : FileText

  const className = cn(
    'inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs',
    onPrimary
      ? 'border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground'
      : 'bg-background text-foreground',
    status === 'error' && 'border-destructive/50 text-destructive',
  )

  const content = (
    <>
      <Icon className={cn('h-3.5 w-3.5 shrink-0', status === 'uploading' && 'animate-spin')} />
      <span className="truncate">{fileName}</span>
    </>
  )

  if (href) {
    return (
      // Rota de API que responde com redirect para o Storage — não é navegação
      // do app, por isso <a> e não <Link>.
      <a href={href} target="_blank" rel="noopener noreferrer" className={cn(className, 'hover:underline')}>
        {content}
      </a>
    )
  }

  return (
    <span className={className}>
      {content}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${fileName}`}
          className="ml-0.5 rounded text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  )
}
