'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Download, FileText, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { LegalProcessPublicDocument } from '@/types/legalProcess.types'

function formatDocDate(value: string | null): string | null {
  if (!value) return null
  try {
    return format(parseISO(value), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
  } catch {
    return null
  }
}

interface DocumentosPublicosTabProps {
  cnj: string | null
  documents: LegalProcessPublicDocument[]
  /** Nulo quando o bloco nunca foi sincronizado — distingue "não buscamos" de
   * "buscamos e o tribunal não tem documento público". */
  syncedAt: string | null
  onSync?: () => void
  isSyncing?: boolean
}

/**
 * Documentos públicos do processo no tribunal.
 *
 * É catálogo, não arquivo nosso: a lista vem do cache local, mas o PDF só é
 * buscado quando alguém clica — cada download é uma consulta cobrada. Por isso
 * o botão leva para a rota que faz o repasse com a API key, e não para a
 * `download_url`, que responderia 401 no navegador.
 */
export function DocumentosPublicosTab({
  cnj,
  documents,
  syncedAt,
  onSync,
  isSyncing = false,
}: DocumentosPublicosTabProps) {
  if (!cnj) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Processo sem número CNJ — não há como consultar os autos.
      </p>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <FileText className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {syncedAt
            ? 'O tribunal não disponibilizou documentos públicos para este processo.'
            : 'Documentos públicos ainda não foram carregados.'}
        </p>
        {!syncedAt && onSync && (
          <Button size="sm" variant="outline" onClick={onSync} disabled={isSyncing}>
            <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isSyncing && 'animate-spin')} />
            Buscar documentos
          </Button>
        )}
      </div>
    )
  }

  const sorted = [...documents].sort((a, b) =>
    (b.document_date ?? '').localeCompare(a.document_date ?? ''),
  )

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">
        Lista guardada do tribunal. Abrir um documento faz o download pela BuscaProcessos e consome
        créditos.
      </p>

      <div className="divide-y divide-border rounded-lg border border-border">
        {sorted.map((doc) => {
          const when = formatDocDate(doc.document_date)
          return (
            <div key={doc.id} className="flex items-center gap-3 p-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-[9px] font-bold uppercase text-muted-foreground">
                {doc.file_extension ?? 'doc'}
              </span>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {doc.title ?? 'Documento sem título'}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {[
                    when,
                    doc.page_count ? `${doc.page_count} página(s)` : null,
                    doc.description !== doc.title ? doc.description : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>

              <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" asChild>
                <a
                  href={`/api/buscaprocessos/processos/${encodeURIComponent(cnj)}/documentos/${encodeURIComponent(doc.external_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Download className="mr-1 h-3 w-3" />
                  Abrir
                </a>
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
