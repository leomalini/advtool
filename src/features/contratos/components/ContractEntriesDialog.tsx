'use client'

import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { formatCurrency, formatPercent } from '@/types/financialEntry.types'
import { useEnableRemindersBatch } from '@/features/financeiro/hooks/usePaymentChargeMutations'
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
  const enableReminders = useEnableRemindersBatch()

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
            isLoading={createEntries.isPending || enableReminders.isPending}
            onCancel={() => onOpenChange(false)}
            onConfirm={(drafts, withReminders) =>
              createEntries.mutate(
                { contract, drafts },
                {
                  onSuccess: (created) => {
                    // Só as parcelas com vencimento: a régua conta a partir dele.
                    const installments = created
                      .filter(
                        (entry) =>
                          entry.type === 'receita' &&
                          entry.settlement_kind === 'scheduled' &&
                          !!entry.due_date &&
                          Number(entry.amount) >= 1
                      )
                      .map((entry) => entry.id)
                    if (withReminders && installments.length > 0) {
                      enableReminders.mutate(installments, { onSettled: () => onOpenChange(false) })
                    } else {
                      onOpenChange(false)
                    }
                  },
                }
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
  onConfirm: (drafts: ContractEntryDraft[], withReminders: boolean) => void
}) {
  const { can, isLoading: permissionsLoading } = usePermissions()
  const [drafts, setDrafts] = useState(() => buildContractEntryDrafts(contract))
  const [withReminders, setWithReminders] = useState(false)
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
            const successFeePercent = draft.percent
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
                    {successFeePercent !== null ? (
                      <p className="flex h-8 items-center justify-end text-sm text-muted-foreground">
                        a apurar
                      </p>
                    ) : (
                      <CurrencyInput
                        value={draft.amount}
                        onChange={(value) => update(draft.key, { amount: value ?? 0 })}
                        className="h-8 text-sm"
                      />
                    )}
                  </div>
                </div>
                {successFeePercent !== null && (
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatPercent(successFeePercent)} sobre
                    </span>
                    <Input
                      aria-label="Sobre o que incide o êxito"
                      value={draft.base_description}
                      maxLength={300}
                      onChange={(event) =>
                        update(draft.key, { base_description: event.target.value })
                      }
                      className="h-8 text-sm"
                    />
                  </div>
                )}
                {successFeePercent !== null && !error && (
                  <p className="text-[11px] text-muted-foreground">
                    Fica em R$ 0, a apurar, até se saber o valor da base: aí é só usar
                    “Apurar” no lançamento.
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

      {kind.type === 'receita' && can('financeiro', 'create') && (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={withReminders}
            onCheckedChange={(checked) => setWithReminders(checked === true)}
            className="mt-0.5"
          />
          <span>
            Gerar o link e cobrar automaticamente as parcelas
            <span className="block text-xs text-muted-foreground">
              Cada parcela ganha a página de pagamento e os lembretes da régua.
            </span>
          </span>
        </label>
      )}

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Agora não
        </Button>
        <Button
          disabled={isLoading || permissionsLoading || hasErrors || drafts.length === 0}
          onClick={() => onConfirm(drafts, withReminders)}
        >
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {drafts.length === 1 ? 'Criar o lançamento' : `Criar ${drafts.length} lançamentos`}
        </Button>
      </DialogFooter>
    </>
  )
}
