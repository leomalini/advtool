'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowUpRight, UserCheck } from 'lucide-react'
import { Can } from '@/components/shared/Can'
import { useClientDocumentMatch } from '../hooks/useClientDocumentMatch'
import type { ClientDocumentMatch } from '../services/clientes.service'
import type { RecordKind } from '@/types/cliente.types'
import { ConvertToClientDialog } from './ConvertToClientDialog'

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
 *
 * Desde a migration 78 o cadastro achado pode ser só pessoa. No formulário de
 * cliente, esse é o caminho mais comum de conversão: em vez de "abrir", o aviso
 * oferece "Tornar cliente" — o cadastro novo seria recusado pela constraint, e
 * o que a pessoa quer é o cliente.
 */
export function DuplicateDocumentWarning({
  document,
  excludeId,
  kind = 'client',
}: {
  document: string | null | undefined
  excludeId?: string
  /** O que o formulário está cadastrando. */
  kind?: RecordKind
}) {
  const router = useRouter()
  const { data: existing } = useClientDocumentMatch(document, excludeId)
  const [convertOpen, setConvertOpen] = useState(false)

  if (!existing) return null

  const name = matchDisplayName(existing)
  const href = existing.is_client ? `/clientes/${existing.id}` : `/pessoas/${existing.id}`
  const offerConversion = kind === 'client' && !existing.is_client

  return (
    <div
      role="alert"
      className="mt-2 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <div className="min-w-0 text-xs">
        <p className="text-foreground">
          {offerConversion ? (
            <>
              Este documento é de <span className="font-medium">{name}</span>, cadastrado em
              Pessoas.
            </>
          ) : kind === 'person' && existing.is_client ? (
            <>
              Este documento é do cliente <span className="font-medium">{name}</span>.
            </>
          ) : (
            <>
              Este documento já está no cadastro de{' '}
              <span className="font-medium">{name}</span>.
            </>
          )}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {offerConversion && (
            <Can resource="clientes" action="create">
              <button
                type="button"
                onClick={() => setConvertOpen(true)}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <UserCheck className="h-3 w-3" />
                Tornar cliente
              </button>
            </Can>
          )}
          <Link
            href={href}
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
          >
            Abrir o cadastro existente
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {offerConversion && (
        <ConvertToClientDialog
          open={convertOpen}
          onOpenChange={setConvertOpen}
          personId={existing.id}
          personName={name}
          // O formulário em volta fica para trás: o cliente agora é o
          // cadastro que já existia, com tudo o que ele já tinha.
          onConverted={() => router.push(`/clientes/${existing.id}`)}
        />
      )}
    </div>
  )
}

/** Mesma regra de `getClientDisplayName`, sobre o recorte mínimo que a busca
 * por documento traz — a função original exige o cliente inteiro. */
function matchDisplayName(client: ClientDocumentMatch): string {
  if (client.type === 'individual') return client.name ?? 'cadastro sem nome'
  return client.trade_name ?? client.company_name ?? 'cadastro sem nome'
}
