'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowUpRight } from 'lucide-react'
import { useClientDocumentMatch } from '../hooks/useClientDocumentMatch'
import type { ClientDocumentMatch } from '../services/clientes.service'

/**
 * Avisa, ainda no formulário, que o documento digitado já pertence a um
 * cadastro.
 *
 * Fica logo abaixo do campo de CPF/CNPJ e serve aos dois formulários (PF e PJ)
 * e a todos os caminhos que abrem um deles — inclusive o cadastro de cliente a
 * partir de uma parte do processo, que é onde a duplicata acontecia com mais
 * frequência: a parte chega do tribunal com nome e documento, e quem cadastra
 * não tem como saber que aquele CPF já está na base.
 *
 * Não bloqueia o envio. Quem decide é o usuário — pode ser homônimo mal
 * digitado, pode ser correção. Quem barra de verdade é a constraint da
 * migration 59; isto é o aviso que evita chegar lá com o formulário cheio.
 */
export function DuplicateDocumentWarning({
  document,
  excludeId,
}: {
  document: string | null | undefined
  excludeId?: string
}) {
  const { data: existing } = useClientDocumentMatch(document, excludeId)

  if (!existing) return null

  return (
    <div
      role="alert"
      className="mt-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <div className="min-w-0 text-xs">
        <p className="text-foreground">
          Este documento já está no cadastro de{' '}
          <span className="font-medium">{matchDisplayName(existing)}</span>.
        </p>
        <Link
          href={`/clientes/${existing.id}`}
          className="mt-0.5 inline-flex items-center gap-1 font-semibold text-primary hover:underline"
        >
          Abrir o cadastro existente
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}

/** Mesma regra de `getClientDisplayName`, sobre o recorte mínimo que a busca
 * por documento traz — a função original exige o cliente inteiro. */
function matchDisplayName(client: ClientDocumentMatch): string {
  if (client.type === 'individual') return client.name ?? 'cliente sem nome'
  return client.trade_name ?? client.company_name ?? 'cliente sem nome'
}
