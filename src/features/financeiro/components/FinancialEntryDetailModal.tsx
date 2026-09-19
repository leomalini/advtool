'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Calendar,
  Check,
  Gavel,
  Hourglass,
  Pencil,
  Tag,
  Trash2,
  Undo2,
  User,
  X,
} from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'
import {
  FINANCIAL_CATEGORY_LABELS,
  describeEntryDeletion,
  formatCurrency,
  getFinancialSituation,
  type FinancialEntryWithRelations,
} from '@/types/financialEntry.types'
import { getClientDisplayName } from '@/types/cliente.types'
import { FINANCIAL_DOCUMENT_CATEGORIES } from '@/types/document.types'
import type { FinancialEntryInput } from '@/schemas/financialEntry.schema'
import { useLegalProcess } from '@/features/processos/hooks/useLegalProcesses'
import { DocumentsTab } from '@/features/documentos/components/DocumentsTab'
import { getCrmItemClientName } from '@/types/crmItem.types'
import { useUpdateFinancialEntry, useDeleteFinancialEntry } from '../hooks/useFinancialEntryMutations'
import { FinancialEntryForm } from './FinancialEntryForm'
import { FinancialSituationBadge } from './FinancialSituationBadge'
import { Can } from '@/components/shared/Can'

interface FinancialEntryDetailModalProps {
  entry: FinancialEntryWithRelations | null
  open: boolean
  onClose: () => void
}

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export function FinancialEntryDetailModal({
  entry,
  open,
  onClose,
}: FinancialEntryDetailModalProps) {
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const updateEntry = useUpdateFinancialEntry()
  const deleteEntry = useDeleteFinancialEntry()
  const { data: processo } = useLegalProcess(entry?.legal_process_id ?? '')

  if (!entry) return null

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      setEditing(false)
      onClose()
    }
  }

  async function handleUpdate(data: FinancialEntryInput) {
    await updateEntry.mutateAsync({ id: entry!.id, ...data })
    setEditing(false)
  }

  async function handleDelete() {
    await deleteEntry.mutateAsync(entry!.id)
    setConfirmDelete(false)
    onClose()
  }

  const isReceita = entry.type === 'receita'
  const isPaid = entry.status === 'pago'
  const situation = getFinancialSituation(entry)
  const overdue = situation === 'vencido'
  const isConditional = entry.settlement_kind === 'conditional'
  const accent = isReceita ? 'var(--success)' : 'var(--destructive)'

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-[520px] p-0 gap-0 overflow-hidden"
        >
          {/* min-w-0 nos dois wrappers: são os itens do grid do DialogContent.
              Sem ele, texto que não quebra (processo no formulário, nome de
              anexo) alarga a coluna e o overflow-hidden corta o modal. */}
          {editing ? (
            <div className="flex flex-col max-h-[85vh] min-w-0">
              <div className="shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b">
                <DialogTitle className="text-sm font-semibold">Editar Lançamento</DialogTitle>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/60 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5">
                <FinancialEntryForm
                  defaultValues={{
                    type: entry.type,
                    category: entry.category,
                    description: entry.description,
                    amount: Number(entry.amount),
                    status: entry.status,
                    settlement_kind: entry.settlement_kind,
                    // A chave é enviada mesmo valendo undefined, e o spread do
                    // form a sobrepõe ao default `todayISO()` — que é o que
                    // deixa o campo vazio ao editar uma condição sem previsão,
                    // em vez de inventar a data de hoje.
                    due_date: entry.due_date ?? undefined,
                    condition_description: entry.condition_description ?? undefined,
                    paid_at: entry.paid_at ?? undefined,
                    client_id: entry.client_id ?? undefined,
                    crm_item_id: entry.crm_item_id ?? undefined,
                    legal_process_id: entry.legal_process_id ?? undefined,
                  }}
                  onSubmit={handleUpdate}
                  isLoading={updateEntry.isPending}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col max-h-[85vh] min-w-0">
              {/* Header — tingido pelo tipo do lançamento */}
              <div
                className="relative shrink-0 px-6 pt-5 pb-4 border-b"
                style={{ backgroundColor: `color-mix(in srgb, ${accent} 6%, transparent)` }}
              >
                <div
                  className="absolute inset-x-0 top-0 h-[3px]"
                  style={{ backgroundColor: accent }}
                />
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute top-3.5 right-4 p-1.5 rounded-md text-muted-foreground/50 hover:text-muted-foreground hover:bg-black/5 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white"
                    style={{ backgroundColor: accent }}
                  >
                    {isReceita ? 'Receita' : 'Despesa'}
                  </span>
                  <FinancialSituationBadge entry={entry} className="px-2" />
                </div>

                <DialogTitle className="text-[17px] font-medium leading-snug pr-8">
                  {entry.description}
                </DialogTitle>

                <p
                  className="text-2xl font-bold tabular-nums mt-2"
                  style={{ color: accent }}
                >
                  {isReceita ? '+' : '−'}
                  {formatCurrency(Number(entry.amount))}
                </p>
              </div>

              {/* Corpo */}
              <div className="flex-1 overflow-y-auto min-h-0 px-6 py-5 space-y-4">
                {/* A condição vem antes da data: para estes lançamentos é ela
                    que determina o recebimento, e a data é só estimativa. */}
                {isConditional && (
                  <InfoRow icon={<Hourglass className="h-4 w-4 text-info/70" />}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50">
                      Condição para {isReceita ? 'receber' : 'pagar'}
                    </p>
                    <p className="text-sm">{entry.condition_description}</p>
                  </InfoRow>
                )}

                {/* `displayDate` pode ser null: condição especial sem previsão
                    é estado válido, e parseISO(null) quebraria a tela. */}
                {(() => {
                  const displayDate = isPaid && entry.paid_at ? entry.paid_at : entry.due_date
                  const label = isPaid ? 'Pago em' : isConditional ? 'Previsão' : 'Vencimento'

                  return (
                    <InfoRow icon={<Calendar className="h-4 w-4 text-muted-foreground/60" />}>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50">
                        {label}
                      </p>
                      {displayDate ? (
                        <p className={cn('text-sm', overdue && 'text-destructive font-medium')}>
                          {format(parseISO(displayDate), "dd 'de' MMMM 'de' yyyy", {
                            locale: ptBR,
                          })}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Sem data definida
                        </p>
                      )}
                      {isPaid && entry.paid_at && entry.due_date && entry.paid_at !== entry.due_date && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {isConditional ? 'Previa' : 'Vencia'} em{' '}
                          {format(parseISO(entry.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                        </p>
                      )}
                    </InfoRow>
                  )
                })()}

                <InfoRow icon={<Tag className="h-4 w-4 text-muted-foreground/60" />}>
                  <p className="text-sm">{FINANCIAL_CATEGORY_LABELS[entry.category]}</p>
                </InfoRow>

                {entry.client && (
                  <InfoRow icon={<User className="h-4 w-4 text-muted-foreground/60" />}>
                    <Link href={`/clientes/${entry.client.id}`} className="group block">
                      <p className="text-sm group-hover:underline">
                        {getClientDisplayName(
                          entry.client as Parameters<typeof getClientDisplayName>[0]
                        )}
                      </p>
                    </Link>
                  </InfoRow>
                )}

                {processo && (
                  <InfoRow icon={<Gavel className="h-4 w-4 text-muted-foreground/60" />}>
                    <Link href={`/processos?id=${processo.id}`} className="group block">
                      <p className="text-sm group-hover:underline">
                        {getCrmItemClientName(processo.crm_item)}
                      </p>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        {processo.cnj_number ?? 'Sem CNJ'}
                      </p>
                    </Link>
                  </InfoRow>
                )}

                {!entry.client && !processo && (
                  <p className="text-xs text-muted-foreground">
                    Lançamento avulso — sem cliente ou processo vinculado.
                  </p>
                )}

                {/* Comprovante, nota fiscal, boleto. Pertencem só ao
                    lançamento (migration 63): não levam o cliente nem o
                    processo dele, e saem junto se ele for excluído. */}
                <div className="pt-4 border-t">
                  <DocumentsTab
                    compact
                    financialEntryId={entry.id}
                    lockedFinancialEntryId={entry.id}
                    categories={FINANCIAL_DOCUMENT_CATEGORIES}
                    defaultCategory="comprovante"
                    itemLabel="lançamento"
                  />
                </div>
              </div>

              {/* Rodapé */}
              <div className="shrink-0 flex items-center justify-between gap-2 px-6 py-4 border-t bg-background">
                <Can resource="financeiro" action="delete" fallback={<span />}>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </button>
                </Can>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateEntry.mutate({
                        id: entry.id,
                        status: isPaid ? 'pendente' : 'pago',
                      })
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted/40 transition-colors"
                  >
                    {isPaid ? (
                      <>
                        <Undo2 className="h-3.5 w-3.5" />
                        Reabrir
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Marcar como pago
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir lançamento"
        description={describeEntryDeletion(entry)}
        isLoading={deleteEntry.isPending}
        onConfirm={handleDelete}
      />
    </>
  )
}
