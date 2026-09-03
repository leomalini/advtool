'use client'

import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ArrowUpRight, BookOpen, Download, FileText, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Publication } from '@/types/publication.types'
import type { LegalProcessPublicDocument } from '@/types/legalProcess.types'

/**
 * Cards da linha do tempo do processo.
 *
 * Os três tipos dividem a mesma aba e não pedem a mesma atenção. A hierarquia
 * é deliberada: publicação é intimação com prazo correndo e recebe fundo
 * tingido; documento é artefato disponível, com moldura discreta; movimentação
 * é registro do que aconteceu e fica sem realce nenhum.
 *
 * A coluna de data com 92px é a mesma nos três — é o que faz a lista ler como
 * uma linha do tempo em vez de três listas empilhadas.
 */

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return '—'
  }
}

export function PublicacaoTimelineCard({ publicacao }: { publicacao: Publication }) {
  const unread = !publicacao.read_at

  return (
    <Link
      href={`/publicacoes/${publicacao.id}`}
      className={cn(
        'group flex gap-4 border-l-2 p-4 transition-colors',
        'bg-info/[0.05] hover:bg-info/[0.09]',
        unread ? 'border-l-warning' : 'border-l-info/60',
      )}
    >
      <div className="flex w-[92px] shrink-0 flex-col">
        <p className="text-xs font-medium tabular-nums">
          {formatDate(publicacao.publication_date)}
        </p>
        <span className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-info">
          <BookOpen className="h-2.5 w-2.5" />
          Publicação
        </span>
        {unread && (
          <span className="mt-1 inline-flex w-fit items-center rounded-full bg-warning/12 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning">
            Não lida
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
            #{publicacao.sequence_number}
          </span>
          {publicacao.diario_sigla && (
            <span className="rounded bg-info/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-info">
              {publicacao.diario_sigla}
            </span>
          )}
          {publicacao.publication_type && (
            <span className="text-[11px] text-muted-foreground">{publicacao.publication_type}</span>
          )}
          {publicacao.handled_at && (
            <span className="rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold text-success">
              Tratada
            </span>
          )}
        </div>

        <p className={cn('mt-1 text-sm', unread ? 'font-semibold' : 'font-medium')}>
          {publicacao.title ?? 'Publicação'}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{publicacao.excerpt}</p>

        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1 text-[11px] font-medium text-warning">
          <Flame className="h-3 w-3" />
          Início do prazo em {formatDate(publicacao.deadline_start_at)}
        </div>
      </div>

      <ArrowUpRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-info" />
    </Link>
  )
}

/**
 * Documento público disponibilizado pelo tribunal.
 *
 * "Expedição de documento" é o ato; o nome do documento é o que foi expedido.
 * Baixar é uma consulta cobrada, então o botão é explícito e não abre sozinho.
 */
export function DocumentoTimelineCard({
  documento,
  cnj,
}: {
  documento: LegalProcessPublicDocument
  cnj: string | null
}) {
  const detalhes = [
    documento.page_count ? `${documento.page_count} página(s)` : null,
    documento.doc_type,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex gap-4 border-l-2 border-l-border p-4">
      <div className="flex w-[92px] shrink-0 flex-col">
        <p className="text-xs font-medium tabular-nums">{formatDate(documento.document_date)}</p>
        <span className="mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          <FileText className="h-2.5 w-2.5" />
          Expedição
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Expedição de documento</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {documento.title ?? 'Documento sem título'}
          {detalhes && ` · ${detalhes}`}
        </p>
        {documento.description && documento.description !== documento.title && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {documento.description}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-start gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-[9px] font-bold uppercase text-muted-foreground">
          {documento.file_extension ?? 'doc'}
        </span>
        {cnj && (
          <a
            href={`/api/buscaprocessos/processos/${encodeURIComponent(cnj)}/documentos/${encodeURIComponent(documento.external_id)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Download className="h-3 w-3" />
            Abrir
          </a>
        )}
      </div>
    </div>
  )
}
