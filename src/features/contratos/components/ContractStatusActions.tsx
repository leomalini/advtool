'use client'

import { useState } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  CONTRACT_NEXT_STATUS,
  CONTRACT_STATUS_ACTION_LABELS,
  CONTRACT_STATUSES,
  type ContractStatus,
  type ContractWithRelations,
} from '@/types/contract.types'
import { useChangeContractStatus } from '../hooks/useContractMutations'
import { ContractSignDialog } from './ContractSignDialog'

/** Fechar o contrato pede confirmação; o resto se desfaz pelo mesmo menu. */
const CLOSING_STATUSES = new Set<ContractStatus>(['encerrado', 'rescindido'])

const CLOSING_DESCRIPTIONS: Partial<Record<ContractStatus, string>> = {
  encerrado: 'O contrato deixa de valer e sai da Agenda e dos avisos de vencimento.',
  rescindido:
    'O contrato foi desfeito antes do fim e sai da Agenda e dos avisos de vencimento. ' +
    'Lançamentos em aberto continuam no Financeiro.',
}

interface ContractStatusActionsProps {
  contract: ContractWithRelations
  /** Depois de "Marcar como assinado" dar certo — a página oferece a prévia
   * dos lançamentos. */
  onSigned?: (signedAt: string) => void
  /** Com a D4Sign configurada, "Enviar para assinatura" abre o envio por ela;
   * marcar só o status (assinatura em papel) fica no menu. */
  onSendForSignature?: () => void
  /** Há um envio aberto na D4Sign — "Marcar como assinado" avisa. */
  hasOpenSignature?: boolean
}

/** O próximo passo do ciclo como botão principal; os demais status num menu,
 * para corrigir um clique errado ou pular etapas. */
export function ContractStatusActions({
  contract,
  onSigned,
  onSendForSignature,
  hasOpenSignature = false,
}: ContractStatusActionsProps) {
  const changeStatus = useChangeContractStatus()
  const [signOpen, setSignOpen] = useState(false)
  const [closing, setClosing] = useState<ContractStatus | null>(null)

  const next = CONTRACT_NEXT_STATUS[contract.status]
  // O botão principal envia pela D4Sign; mudar só o status vira item do menu.
  const sendsBySignature = next === 'aguardando_assinatura' && !!onSendForSignature
  const others = CONTRACT_STATUSES.filter(
    (status) => status !== contract.status && (status !== next || sendsBySignature),
  )
  const hasSignedFile =
    contract.documents?.some((document) => document.contract_file_role === 'assinado') ?? false

  function request(status: ContractStatus) {
    if (status === 'vigente' && contract.status !== 'encerrado' && contract.status !== 'rescindido') {
      setSignOpen(true)
      return
    }
    if (CLOSING_STATUSES.has(status)) {
      setClosing(status)
      return
    }
    changeStatus.mutate({ id: contract.id, status })
  }

  return (
    <>
      <div className="flex items-center">
        {next && (
          <Button
            size="sm"
            className="rounded-r-none"
            disabled={changeStatus.isPending}
            onClick={() => (sendsBySignature ? onSendForSignature?.() : request(next))}
          >
            {changeStatus.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {CONTRACT_STATUS_ACTION_LABELS[next]}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant={next ? 'default' : 'outline'}
              className={next ? 'rounded-l-none border-l border-primary-foreground/20 px-2' : undefined}
              disabled={changeStatus.isPending}
              aria-label="Mudar status"
            >
              {!next && 'Mudar status'}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Mudar para</DropdownMenuLabel>
            {others.map((status) => (
              <DropdownMenuItem key={status} onSelect={() => request(status)}>
                {status === 'vigente' &&
                (contract.status === 'encerrado' || contract.status === 'rescindido')
                  ? 'Reabrir como vigente'
                  : status === 'aguardando_assinatura' && sendsBySignature
                    ? 'Só marcar como aguardando (assinatura por fora)'
                    : CONTRACT_STATUS_ACTION_LABELS[status]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ContractSignDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        hasSignedFile={hasSignedFile}
        hasOpenSignature={hasOpenSignature}
        isLoading={changeStatus.isPending}
        onConfirm={(signedAt, signedFile) =>
          changeStatus.mutate(
            { id: contract.id, status: 'vigente', signedAt, signedFile },
            {
              onSuccess: () => {
                setSignOpen(false)
                onSigned?.(signedAt)
              },
            }
          )
        }
      />

      <ConfirmDialog
        open={closing !== null}
        onOpenChange={(open) => !open && setClosing(null)}
        title={closing ? `${CONTRACT_STATUS_ACTION_LABELS[closing]} o contrato?` : ''}
        description={closing ? (CLOSING_DESCRIPTIONS[closing] ?? '') : ''}
        confirmLabel={closing ? CONTRACT_STATUS_ACTION_LABELS[closing] : ''}
        loadingLabel="Salvando..."
        isLoading={changeStatus.isPending}
        onConfirm={() => {
          if (!closing) return
          changeStatus.mutate(
            { id: contract.id, status: closing },
            { onSuccess: () => setClosing(null) }
          )
        }}
      />
    </>
  )
}
