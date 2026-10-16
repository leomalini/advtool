'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/shared/CurrencyInput'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import type { Contract } from '@/types/contract.types'
import { formatCurrency } from '@/types/financialEntry.types'
import { useCreateContractEntries } from '../hooks/useContractMutations'
import {
  buildContractEntryDrafts,
  contractEntryDraftError,
  contractEntryKind,
  type ContractEntryDraft,
} from '../utils/contractEntries'

type ContractForDialog = Parameters<typeof buildContractEntryDrafts>[0] & Pick<Contract, 'title'>

interface ContractEntriesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: ContractForDialog
  /** Aberto logo depois de "Marcar como assinado": o texto diz isso. */
  afterSigning?: boolean
}

/**
 * A prévia dos lançamentos do contrato (docs/contratos.md → Financeiro): as
 * parcelas e o êxito, para conferir, ajustar e confirmar. Nada é lançado
 * antes do clique.
 */
export function ContractEntriesDialog({
  open,
  onOpenChange,
  contract,
  afterSigning = false,
}: ContractEntriesDialogProps) {
  const createEntries = useCreateContractEntries()

  return (
    <Dialog open={open} onOpenChange={(value) => !createEntries.isPending && onOpenChange(value)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]"
        // O foco automático do Radix seleciona o texto da 1ª descrição: uma
        // tecla apagaria o nome da parcela. Aqui a pessoa confere antes.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {/* Montado a cada abertura: a prévia sai do contrato como ele está. */}
        {open && (
          <EntriesForm
            contract={contract}
            afterSigning={afterSigning}
            isLoading={createEntries.isPending}
            onCancel={() => onOpenChange(false)}
            onConfirm={(drafts) =>
              createEntries.mutate(
                { contract, drafts },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function EntriesForm({
  contract,
  afterSigning,
  isLoading,
  onCancel,
  onConfirm,
}: {
  contract: ContractForDialog
  afterSigning: boolean
  isLoading: boolean
  onCancel: () => void
  onConfirm: (drafts: ContractEntryDraft[]) => void
}) {
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [drafts, setDrafts] = useState(() => buildContractEntryDrafts(contract))
  const kind = contractEntryKind(contract.kind)

  const intro = [
    afterSigning
      ? 'Contrato assinado. Quer lançar as parcelas no Financeiro agora?'
      : 'Confira os lançamentos que saem deste contrato.',
    kind?.type === 'despesa'
      ? 'Entram como despesas, ligadas ao contrato.'
      : 'Entram como receitas de honorário, ligadas ao contrato.',
    'Editar o contrato depois não muda estes lançamentos.',
  ].join(' ')

  if (!kind) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Lançar no Financeiro</DialogTitle>
          <DialogDescription>
            Contrato do cliente com terceiros não gera lançamentos: o dinheiro não é do
            escritório.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onCancel}>Fechar</Button>
        </DialogFooter>
      </>
    )
  }

  if (!permissionsLoading && !can('financeiro', 'create')) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Lançar no Financeiro</DialogTitle>
          <DialogDescription>
            {afterSigning ? 'Contrato assinado. ' : ''}Lançar as parcelas pede permissão de
            criar no Financeiro: peça a quem cuida do Financeiro para lançar a partir da página
            deste contrato.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onCancel}>Entendi</Button>
        </DialogFooter>
      </>
    )
  }

  function update(key: string, patch: Partial<ContractEntryDraft>) {
    setDrafts((current) =>
      current.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft))
    )
  }

  const errors = new Map(drafts.map((draft) => [draft.key, contractEntryDraftError(draft)]))
  const hasErrors = [...errors.values()].some(Boolean)
  const scheduledTotal = drafts
    .filter((draft) => draft.settlement_kind === 'scheduled')
    .reduce((sum, draft) => sum + Math.round(draft.amount * 100), 0)
  const contractTotal =
    contract.total_amount !== null ? Math.round(contract.total_amount * 100) : null
  const totalDiffers =
    contractTotal !== null && contractTotal > 0 && scheduledTotal !== contractTotal

  return (
    <>
      <DialogHeader>
        <DialogTitle>Lançar no Financeiro</DialogTitle>
        <DialogDescription>{intro}</DialogDescription>
      </DialogHeader>

      {drafts.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          O contrato não tem valor nem êxito para lançar. Preencha em Editar e volte aqui, ou
          lance à mão na seção Financeiro do contrato.
        </p>
      ) : (
        <ol className="space-y-2">
          {drafts.map((draft) => {
            const error = errors.get(draft.key)
            const conditional = draft.settlement_kind === 'conditional'
            return (
              <li
                key={draft.key}
                className={cn(
                  'space-y-2 rounded-lg border p-3',
                  error && 'border-destructive/40'
                )}
              >
                <div className="flex items-center gap-2">
                  <Input
                    aria-label="Descrição"
                    value={draft.description}
                    maxLength={300}
                    onChange={(event) => update(draft.key, { description: event.target.value })}
                    className="h-8 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((current) => current.filter((item) => item.key !== draft.key))
                    }
                    aria-label="Tirar este lançamento"
                    className={cn(
                      'rounded p-1.5 text-muted-foreground',
                      'hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-2">
                  {conditional ? (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">
                        Condição especial
                      </Label>
                      <Input
                        value={draft.condition_description}
                        maxLength={300}
                        onChange={(event) =>
                          update(draft.key, { condition_description: event.target.value })
                        }
                        className="h-8 text-sm"
                      />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Vencimento</Label>
                      <Input
                        type="date"
                        value={draft.due_date}
                        onChange={(event) => update(draft.key, { due_date: event.target.value })}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Valor</Label>
                    <CurrencyInput
                      value={draft.amount}
                      onChange={(value) => update(draft.key, { amount: value ?? 0 })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                {conditional && !error && draft.amount === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Fica em R$ 0 até se saber o valor: quem der a baixa informa quanto entrou.
                  </p>
                )}
                {error && <p className="text-xs text-destructive">{error}</p>}
              </li>
            )
          })}
        </ol>
      )}

      {totalDiffers && (
        <p className="text-xs text-warning">
          As parcelas somam {formatCurrency(scheduledTotal / 100)}; o contrato diz{' '}
          {formatCurrency((contractTotal ?? 0) / 100)}.
        </p>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Agora não
        </Button>
        <Button
          disabled={isLoading || permissionsLoading || hasErrors || drafts.length === 0}
          onClick={() => onConfirm(drafts)}
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {drafts.length === 1 ? 'Criar o lançamento' : `Criar ${drafts.length} lançamentos`}
        </Button>
      </DialogFooter>
    </>
  )
}
