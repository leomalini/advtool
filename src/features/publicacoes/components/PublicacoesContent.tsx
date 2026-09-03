'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileWarning, Loader2, Newspaper, RefreshCw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useDebounce } from '@/hooks/useDebounce'
import { usePublications, useSyncIntimacoes } from '../hooks/usePublications'
import type { PublicationWithRelations } from '@/types/publication.types'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return '—'
  }
}

/** Linha da fila. O estado (não lida / tratada) é a informação que decide se
 * a pessoa precisa abrir, então vem antes do texto. */
function PublicacaoRow({
  publicacao,
  onOpen,
}: {
  publicacao: PublicationWithRelations
  onOpen: () => void
}) {
  const unread = !publicacao.read_at
  const orphan = !publicacao.legal_process_id

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
        'hover:bg-accent focus-visible:outline-none focus-visible:bg-accent',
        unread && 'bg-warning/[0.04]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
          unread ? 'bg-warning' : 'bg-transparent',
        )}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
            #{publicacao.sequence_number}
          </span>
          {publicacao.diario_sigla && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {publicacao.diario_sigla}
            </span>
          )}
          <span className="font-mono text-[11px] text-muted-foreground">
            {publicacao.cnj_number ?? 'sem CNJ'}
          </span>
          {orphan && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[10px] font-semibold text-warning">
              <FileWarning className="h-2.5 w-2.5" />
              Processo não cadastrado
            </span>
          )}
          {publicacao.handled_at && (
            <span className="rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold text-success">
              Tratada
            </span>
          )}
        </div>

        <p className={cn('mt-1 truncate text-sm', unread ? 'font-semibold' : 'font-medium')}>
          {publicacao.title ?? 'Publicação sem título'}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{publicacao.excerpt}</p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-[11px] font-medium tabular-nums">
          {formatDate(publicacao.publication_date)}
        </p>
        <p className="text-[10px] text-muted-foreground">
          prazo em {formatDate(publicacao.deadline_start_at)}
        </p>
      </div>
    </button>
  )
}

export function PublicacoesContent() {
  const router = useRouter()
  const [onlyUnread, setOnlyUnread] = useState(true)
  const [onlyOrphans, setOnlyOrphans] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)

  const filters = useMemo(
    () => ({ onlyUnread, onlyOrphans, search: debouncedSearch }),
    [onlyUnread, onlyOrphans, debouncedSearch],
  )

  const { data: publicacoes = [], isLoading } = usePublications(filters)
  const sync = useSyncIntimacoes()

  return (
    <div className="-m-6 flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b bg-card px-6 py-3.5">
        <div>
          <h1 className="text-sm font-semibold text-foreground">Publicações</h1>
          <p className="text-xs text-muted-foreground">
            Diários oficiais encontrados pelas OABs cadastradas em Configurações
          </p>
        </div>

        <Button size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
          {sync.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Buscar publicações
        </Button>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-card px-6 py-2.5">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar no texto, título ou CNJ"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
            className="h-3.5 w-3.5 accent-current"
          />
          Apenas não lidas
        </label>

        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <input
            type="checkbox"
            checked={onlyOrphans}
            onChange={(e) => setOnlyOrphans(e.target.checked)}
            className="h-3.5 w-3.5 accent-current"
          />
          Sem processo cadastrado
        </label>

        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {publicacoes.length} publicação(ões)
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="space-y-2 p-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        )}

        {!isLoading && publicacoes.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
            <Newspaper className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {onlyUnread
                ? 'Nenhuma publicação não lida.'
                : 'Nenhuma publicação importada ainda.'}
            </p>
            <p className="max-w-md text-xs text-muted-foreground">
              As publicações chegam pelas inscrições na OAB preenchidas nos perfis, em
              Configurações. Sem OAB e UF cadastradas não há o que consultar.
            </p>
          </div>
        )}

        {!isLoading && publicacoes.length > 0 && (
          <div className="divide-y divide-border">
            {publicacoes.map((publicacao) => (
              <PublicacaoRow
                key={publicacao.id}
                publicacao={publicacao}
                onOpen={() => router.push(`/publicacoes/${publicacao.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
