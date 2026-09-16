'use client'

import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileQuestion, Link2Off, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { PortalLinkInvalidError } from '../services/portal.service'
import { isNeedsDocument, usePortalData } from '../hooks/usePortal'
import { PortalDocumentGate } from './PortalDocumentGate'
import { PortalProcessCard } from './PortalProcessCard'

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
          error instanceof Error
            ? error.message
            : 'Tente novamente em alguns instantes.'
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
        <div className="flex flex-col gap-4">
          {data.processes.map((processo) => (
            <PortalProcessCard key={processo.id} processo={processo} />
          ))}
        </div>
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
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  )
}
