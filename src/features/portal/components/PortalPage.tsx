'use client'

import { useMemo, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileQuestion, Link2Off, Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { PortalLinkInvalidError } from '../services/portal.service'
import { isNeedsDocument, usePortalData } from '../hooks/usePortal'
import { PortalDocumentGate } from './PortalDocumentGate'
import { PortalProcessCard } from './PortalProcessCard'
import type { PortalProcess } from '@/types/clientPortal.types'

/** A partir de quantos processos a busca aparece. Abaixo disso a lista inteira
 * já está à vista, e um campo de busca só ocuparia espaço. */
const SEARCH_THRESHOLD = 5

/**
 * A página inteira do portal do cliente.
 *
 * Quatro estados, e a ordem em que são tratados importa: "precisa do
 * documento" chega como erro 401 do React Query, mas não é falha nenhuma — é a
 * porta. Tratá-lo depois do caso genérico de erro mostraria "algo deu errado"
 * para quem apenas ainda não digitou o CPF.
 */
export function PortalPage({ token }: { token: string }) {
  const { data, error, isPending } = usePortalData(token)

  if (isPending) return <PortalSkeleton />

  if (isNeedsDocument(error)) {
    return <PortalDocumentGate token={token} documentKind={error.challenge.document_kind} />
  }

  if (error instanceof PortalLinkInvalidError) {
    return (
      <PortalMessage
        icon={<Link2Off className="size-6" aria-hidden />}
        title="Link não disponível"
        description={error.message}
      />
    )
  }

  if (error || !data) {
    return (
      <PortalMessage
        icon={<Loader2 className="size-6" aria-hidden />}
        title="Não foi possível carregar"
        description={
          error instanceof Error ? error.message : 'Tente novamente em alguns instantes.'
        }
      />
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">Acompanhamento processual</p>
        <h1 className="text-2xl font-semibold leading-tight">{data.client_name}</h1>
      </header>

      {data.processes.length === 0 ? (
        <PortalMessage
          icon={<FileQuestion className="size-6" aria-hidden />}
          title="Nenhum processo por aqui ainda"
          description="Assim que houver um processo vinculado ao seu cadastro, ele aparece nesta página."
        />
      ) : (
        <ProcessList token={token} processes={data.processes} />
      )}

      <footer className="flex flex-col gap-1 border-t pt-4 text-xs text-muted-foreground">
        <p>
          Informações atualizadas em{' '}
          {format(parseISO(data.generated_at), "d 'de' MMMM 'de' yyyy, HH:mm", {
            locale: ptBR,
          })}
          .
        </p>
        {/* A ressalva não é jurídica por desencargo: a página mostra o que o
            escritório publicou, que é um recorte do processo. Sem dizê-lo, o
            silêncio sobre um ato vira "não aconteceu nada". */}
        <p>
          Esta página reúne as movimentações publicadas pelo escritório e não
          substitui a orientação do seu advogado.
        </p>
      </footer>
    </div>
  )
}

/**
 * A lista de processos.
 *
 * Um card aberto por vez, de propósito: com vários abertos a página volta a
 * ser a rolagem infinita que o acordeão veio resolver, e ninguém compara duas
 * timelines lado a lado num celular.
 *
 * Processo único abre sozinho — é o caso mais comum, e obrigar um toque para
 * ver a única coisa que existe na página é atrito puro.
 */
function ProcessList({ token, processes }: { token: string; processes: PortalProcess[] }) {
  const [openId, setOpenId] = useState<string | null>(
    processes.length === 1 ? processes[0].id : null
  )
  const [query, setQuery] = useState('')

  const showSearch = processes.length >= SEARCH_THRESHOLD

  const filtered = useMemo(() => {
    const termo = query.trim().toLowerCase()
    if (!termo) return processes

    // Busca pelos campos que o cliente tem como saber de cor: o número do
    // processo (inclusive só um pedaço dele) e as palavras do título, da
    // classe e da comarca.
    const digits = termo.replace(/\D/g, '')

    return processes.filter((processo) => {
      const haystack = [processo.title, processo.procedural_class, processo.comarca, processo.subject]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      if (haystack.includes(termo)) return true

      return Boolean(
        digits && processo.cnj_number?.replace(/\D/g, '').includes(digits)
      )
    })
  }, [processes, query])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {processes.length === 1 ? '1 processo' : `${processes.length} processos`}
          {query.trim() && filtered.length !== processes.length && (
            <> · {filtered.length} na busca</>
          )}
        </p>

        {showSearch && (
          <div className="relative w-full sm:w-64">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por número ou assunto"
              aria-label="Buscar processo"
              className="h-9 pl-9 text-sm"
            />
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nenhum processo corresponde a “{query.trim()}”.
        </p>
      ) : (
        filtered.map((processo) => (
          <PortalProcessCard
            key={processo.id}
            processo={processo}
            token={token}
            isOpen={openId === processo.id}
            onToggle={() => setOpenId((current) => (current === processo.id ? null : processo.id))}
          />
        ))
      )}
    </div>
  )
}

function PortalMessage({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <h1 className="text-lg font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function PortalSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-56" />
      </div>
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  )
}
