'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check, Percent, Plus, Scale, Trash2, Undo2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'
import {
  ASSESS_BEFORE_PAYMENT_REASON,
  FINANCIAL_CATEGORY_LABELS,
  describeEntryDeletion,
  describePercentageNote,
  estimatedFee,
  formatCurrency,
  getFinancialSituation,
  isToAssess,
  needsAmountBeforePayment,
  ZERO_AMOUNT_PAYMENT_REASON,
  type FinancialEntryWithRelations,
} from '@/types/financialEntry.types'
import type { PendingAttachments } from '@/types/document.types'
import type { FinancialEntryInput } from '@/schemas/financialEntry.schema'
import { CHARGE_BLOCK_REASONS, summarizePaymentCharges } from '@/types/paymentCharge.types'
import { usePermissions } from '@/hooks/usePermissions'
import { useOfficeSettings } from '@/features/configuracoes/hooks/useOfficeSettings'
import { useFinancialEntriesForEntity } from '../hooks/useFinancialEntries'
import {
  useCreateFinancialEntry,
  useUpdateFinancialEntry,
  useDeleteFinancialEntry,
} from '../hooks/useFinancialEntryMutations'
import { FinancialEntryForm, type FinancialEntrySubmitOptions } from './FinancialEntryForm'
import { FinancialEntryDetailModal } from './FinancialEntryDetailModal'
import { useTriageStatedAmount } from '@/features/publicacoes/hooks/usePublications'
import { STATED_AMOUNT_KIND_LABELS } from '@/types/publication.types'
import { AssessSuccessFeeDialog, type AssessmentSuggestion } from './AssessSuccessFeeDialog'
import { SUCCESS_FEE_FORM_DEFAULTS } from '../utils/successFees'
import { FinancialSituationBadge } from './FinancialSituationBadge'
import { AttachmentCountBadge } from './AttachmentCountBadge'
import { PaymentLinkBadge } from './PaymentLinkBadge'
import { Can } from '@/components/shared/Can'

interface FinancialEntriesTabProps {
  legalProcessId?: string | null
  crmItemIds?: string[]
  clientId?: string | null
  contractId?: string | null
  /** Onde novos lançamentos são gravados. */
  lockedLegalProcessId?: string | null
  lockedCrmItemId?: string | null
  lockedClientId?: string | null
  lockedContractId?: string | null
  itemLabel?: string
  /** The bell's notice (migration 90): a success fee to open in "Apurar", and
   * the publication whose value fills the base. */
  initialAssessEntryId?: string | null
  assessPublicationId?: string | null
  /** Closed what the notice opened: the page takes it out of the URL. */
  onInitialAssessClose?: () => void
}

/**
 * A linha do "quando". Cobre os quatro casos que a taxonomia produz — inclusive
 * o sem data, onde formatar `null` devolveria "Invalid Date" na tela.
 *
 * Para condição especial o texto da condição vem antes da previsão: é ele que
 * diz o que precisa acontecer; a data, quando existe, é só uma estimativa.
 */
function describeWhen(entry: FinancialEntryWithRelations): string {
  const asDate = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })

  if (entry.status === 'pago' && entry.paid_at) return `Pago em ${asDate(entry.paid_at)}`

  if (entry.settlement_kind === 'conditional') {
    const condition = entry.condition_description ?? 'Condição especial'
    return entry.due_date ? `${condition} · prev. ${asDate(entry.due_date)}` : condition
  }

  return entry.due_date ? `Vence ${asDate(entry.due_date)}` : 'Sem data definida'
}

/** Aba Financeiro — compartilhada entre CasoModal, a página do processo e
 * a página do cliente, para os três ficarem idênticos. */
export function FinancialEntriesTab({
  legalProcessId,
  crmItemIds,
  clientId,
  contractId,
  lockedLegalProcessId,
  lockedCrmItemId,
  lockedClientId,
  lockedContractId,
  itemLabel = 'item',
  initialAssessEntryId = null,
  assessPublicationId = null,
  onInitialAssessClose,
}: FinancialEntriesTabProps) {
  const { data: entries = [], isLoading, isError } = useFinancialEntriesForEntity({
    legalProcessId,
    crmItemIds,
    clientId,
    contractId,
  })
  const createEntry = useCreateFinancialEntry()
  const updateEntry = useUpdateFinancialEntry()
  const deleteEntry = useDeleteFinancialEntry()

  // "exito": the same form, opened on a success fee to assess (migration 89).
  // Apart from `createOpen`: the title must not change during the closing fade.
  const [createKind, setCreateKind] = useState<'lancamento' | 'exito'>('lancamento')
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<FinancialEntryWithRelations | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [assessingId, setAssessingId] = useState<string | null>(initialAssessEntryId)
  const fromNotice = assessingId !== null && assessingId === initialAssessEntryId
  const { data: statedAmount } = useTriageStatedAmount(fromNotice ? assessPublicationId : null)
  const suggestion: AssessmentSuggestion | null =
    fromNotice && statedAmount && assessPublicationId
      ? {
          amount: statedAmount.amount,
          source:
            `${STATED_AMOUNT_KIND_LABELS[statedAmount.kind]} de ` +
            `${formatCurrency(statedAmount.amount)} na publicação` +
            (statedAmount.sequenceNumber ? ` #${statedAmount.sequenceNumber}` : ''),
          href: `/publicacoes/${assessPublicationId}`,
        }
      : null
  const { can } = usePermissions()
  const { data: officeSettings } = useOfficeSettings()
  const offerPaymentLink = !!officeSettings?.infinitepay_handle && can('financeiro', 'create')

  // Lê da lista viva para o detalhe não congelar após uma edição.
  const selected = selectedId ? (entries.find((e) => e.id === selectedId) ?? null) : null
  const assessing = assessingId ? (entries.find((e) => e.id === assessingId) ?? null) : null

  function openCreate(kind: 'lancamento' | 'exito') {
    setCreateKind(kind)
    setCreateOpen(true)
  }

  async function handleCreate(
    data: FinancialEntryInput,
    attachments: PendingAttachments,
    { generatePaymentLink }: FinancialEntrySubmitOptions
  ) {
    const created = await createEntry.mutateAsync({
      ...data,
      legal_process_id: lockedLegalProcessId ?? data.legal_process_id,
      crm_item_id: lockedCrmItemId ?? data.crm_item_id,
      client_id: lockedClientId ?? data.client_id,
      contract_id: lockedContractId ?? data.contract_id,
      attachments,
      generatePaymentLink,
    })
    setCreateOpen(false)
    // Link pedido: o detalhe abre já com Copiar e WhatsApp.
    if (generatePaymentLink) setSelectedId(created.entryId)
  }

  if (isLoading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <Scale className="w-8 h-8" />
        <div className="text-center">
          <p className="text-sm font-medium">Não foi possível carregar o financeiro</p>
          <p className="text-xs mt-1">Tente fechar e abrir novamente.</p>
        </div>
      </div>
    )
  }

  const sum = (list: FinancialEntryWithRelations[]) =>
    list.reduce((s, e) => s + Number(e.amount), 0)

  const receitas = entries.filter((e) => e.type === 'receita')
  const despesas = entries.filter((e) => e.type === 'despesa')
  const recebido = sum(receitas.filter((e) => e.status === 'pago'))
  // "A receber" aqui é a mesma definição da tela principal: TUDO que não foi
  // pago, com data ou por condição.
  const aReceber = sum(receitas.filter((e) => e.status !== 'pago'))
  const condicionais = receitas.filter(
    (e) => getFinancialSituation(e) === 'condicao_especial'
  )
  // R$ 0 until assessed: counted apart, with what their estimates would yield.
  const aApurar = receitas.filter(isToAssess)
  const aApurarEstimate = aApurar.reduce((s, e) => s + (estimatedFee(e) ?? 0), 0)
  const totalDespesas = sum(despesas)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground/80">Financeiro</h3>
          {entries.length > 0 && (
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
              {entries.length}
            </span>
          )}
        </div>
        <Can resource="financeiro" action="create">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openCreate('exito')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/40"
            >
              <Percent className="w-3.5 h-3.5" />
              Registrar êxito
            </button>
            <button
              type="button"
              onClick={() => openCreate('lancamento')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
            >
              <Plus className="w-3.5 h-3.5" />
              Novo lançamento
            </button>
          </div>
        </Can>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <Scale className="w-7 h-7" />
          <p className="text-sm">Nenhum lançamento</p>
          <p className="text-xs">Honorários, custas e despesas deste {itemLabel} aparecem aqui</p>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Recebido</p>
              <p className="text-sm font-semibold text-success mt-1">{formatCurrency(recebido)}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">A receber</p>
              <p className="text-sm font-semibold text-warning mt-1">{formatCurrency(aReceber)}</p>
              {/* Quanto do "a receber" não tem data para acontecer — o número
                  sozinho sugeriria que tudo ali já está agendado. */}
              {condicionais.length > 0 && (
                <p className="text-[10px] text-info mt-0.5">
                  {formatCurrency(sum(condicionais))} em condição especial
                </p>
              )}
              {aApurar.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  + {aApurar.length} êxito{aApurar.length === 1 ? '' : 's'} a apurar
                  {aApurarEstimate > 0 && ` (est. ${formatCurrency(aApurarEstimate)})`}
                </p>
              )}
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Despesas</p>
              <p className="text-sm font-semibold text-destructive mt-1">
                {formatCurrency(totalDespesas)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {entries.map((entry) => {
              const isReceita = entry.type === 'receita'
              const isPaid = entry.status === 'pago'
              const situation = getFinancialSituation(entry)
              const overdue = situation === 'vencido'
              const toAssess = isToAssess(entry)
              const percentageNote = describePercentageNote(entry)
              // O que o banco recusaria (migration 67) vira aviso no clique.
              const charges = summarizePaymentCharges(entry.payment_charges)
              const toggleBlockedBy = isPaid
                ? charges.paid
                  ? CHARGE_BLOCK_REASONS.reopenPaidOnline
                  : null
                : charges.live
                  ? CHARGE_BLOCK_REASONS.markPaidWithLiveLink
                  : needsAmountBeforePayment(entry)
                    ? ZERO_AMOUNT_PAYMENT_REASON
                    : null
              const deleteBlockedBy = charges.paid
                ? CHARGE_BLOCK_REASONS.deletePaidOnline
                : charges.live
                  ? CHARGE_BLOCK_REASONS.deleteWithLiveLink
                  : null

              return (
                <div
                  key={entry.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(entry.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setSelectedId(entry.id)
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-lg border border-border p-3 group cursor-pointer',
                    'hover:bg-muted/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    overdue && 'border-destructive/40'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FinancialSituationBadge entry={entry} />
                      <p className="text-sm font-medium truncate">{entry.description}</p>
                      <AttachmentCountBadge count={entry.documents?.length ?? 0} />
                      <PaymentLinkBadge charges={entry.payment_charges} />
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{FINANCIAL_CATEGORY_LABELS[entry.category]}</span>
                      <span>·</span>
                      <span className={cn(overdue && 'text-destructive font-medium')}>
                        {describeWhen(entry)}
                      </span>
                    </div>
                    {percentageNote && (
                      <p className="mt-0.5 text-[11px] text-info/80">{percentageNote}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {toAssess ? (
                      <p className="text-sm text-muted-foreground">a apurar</p>
                    ) : (
                      <p
                        className={cn(
                          'text-sm font-semibold tabular-nums',
                          isReceita ? 'text-success' : 'text-destructive'
                        )}
                      >
                        {isReceita ? '+' : '−'}
                        {formatCurrency(Number(entry.amount))}
                      </p>
                    )}

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        title={
                          toAssess
                            ? 'Apurar'
                            : (toggleBlockedBy ??
                              (isPaid ? 'Marcar como pendente' : 'Marcar como pago'))
                        }
                        aria-disabled={!toAssess && toggleBlockedBy !== null}
                        onClick={(e) => {
                          e.stopPropagation() // não abre o detalhe
                          // A success fee to assess has no payment yet: the
                          // gesture opens "Apurar" (migration 89).
                          if (toAssess) {
                            if (can('financeiro', 'update')) setAssessingId(entry.id)
                            else toast.info(ASSESS_BEFORE_PAYMENT_REASON)
                            return
                          }
                          if (toggleBlockedBy) {
                            toast.info(toggleBlockedBy)
                            return
                          }
                          updateEntry.mutate({
                            id: entry.id,
                            status: isPaid ? 'pendente' : 'pago',
                          })
                        }}
                        className={cn(
                          'p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted',
                          'transition-colors aria-disabled:opacity-50 aria-disabled:cursor-not-allowed'
                        )}
                      >
                        {toAssess ? (
                          <Percent className="w-3.5 h-3.5" />
                        ) : isPaid ? (
                          <Undo2 className="w-3.5 h-3.5" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <Can resource="financeiro" action="delete">
                        <button
                          type="button"
                          title={deleteBlockedBy ?? 'Excluir'}
                          aria-disabled={deleteBlockedBy !== null}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (deleteBlockedBy) {
                              toast.info(deleteBlockedBy)
                              return
                            }
                            setPendingDelete(entry)
                          }}
                          className={cn(
                            'p-1.5 rounded text-muted-foreground transition-colors',
                            'hover:text-destructive hover:bg-destructive/10',
                            'aria-disabled:opacity-50 aria-disabled:cursor-not-allowed'
                          )}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </Can>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {/* Rola por dentro — com anexos o formulário passa da altura da tela. */}
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{createKind === 'exito' ? 'Registrar êxito' : 'Novo Lançamento'}</DialogTitle>
          </DialogHeader>
          {/* hideLinks: aberto de dentro de um caso/processo/cliente, o vínculo
              já vem travado pelas props. The locked process goes along so a
              percentage can offer its case value as the estimate. */}
          <FinancialEntryForm
            key={createKind}
            onSubmit={handleCreate}
            isLoading={createEntry.isPending}
            hideLinks
            withAttachments
            offerPaymentLink={offerPaymentLink}
            initialValueMode={createKind === 'exito' ? 'percentual' : undefined}
            submitLabel={createKind === 'exito' ? 'Registrar êxito' : undefined}
            defaultValues={{
              ...(createKind === 'exito' && SUCCESS_FEE_FORM_DEFAULTS),
              legal_process_id: lockedLegalProcessId ?? undefined,
            }}
          />
        </DialogContent>
      </Dialog>

      {/* An old notice may point to one already assessed: then nothing opens. */}
      <AssessSuccessFeeDialog
        entry={assessing}
        open={!!assessing && isToAssess(assessing)}
        suggestion={suggestion}
        onOpenChange={(open) => {
          if (open) return
          if (fromNotice) onInitialAssessClose?.()
          setAssessingId(null)
        }}
      />

      <FinancialEntryDetailModal
        entry={selected}
        open={!!selected}
        onClose={() => setSelectedId(null)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Excluir lançamento"
        description={pendingDelete ? describeEntryDeletion(pendingDelete) : ''}
        isLoading={deleteEntry.isPending}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteEntry.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })
        }}
      />
    </div>
  )
}
