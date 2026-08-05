'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check, Plus, Scale, Trash2, Undo2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { cn } from '@/lib/utils'
import {
  FINANCIAL_CATEGORY_LABELS,
  formatCurrency,
  isFinancialEntryOverdue,
  type FinancialEntryWithRelations,
} from '@/types/financialEntry.types'
import type { FinancialEntryInput } from '@/schemas/financialEntry.schema'
import { useFinancialEntriesForEntity } from '../hooks/useFinancialEntries'
import {
  useCreateFinancialEntry,
  useUpdateFinancialEntry,
  useDeleteFinancialEntry,
} from '../hooks/useFinancialEntryMutations'
import { FinancialEntryForm } from './FinancialEntryForm'
import { FinancialEntryDetailModal } from './FinancialEntryDetailModal'

interface FinancialEntriesTabProps {
  legalProcessId?: string | null
  crmItemIds?: string[]
  clientId?: string | null
  /** Onde novos lançamentos são gravados. */
  lockedLegalProcessId?: string | null
  lockedCrmItemId?: string | null
  lockedClientId?: string | null
  itemLabel?: string
}

/** Aba Financeiro — compartilhada entre CasoModal, ProcessoModal e
 * ClienteDetailModal, para os três ficarem idênticos. */
export function FinancialEntriesTab({
  legalProcessId,
  crmItemIds,
  clientId,
  lockedLegalProcessId,
  lockedCrmItemId,
  lockedClientId,
  itemLabel = 'item',
}: FinancialEntriesTabProps) {
  const { data: entries = [], isLoading, isError } = useFinancialEntriesForEntity({
    legalProcessId,
    crmItemIds,
    clientId,
  })
  const createEntry = useCreateFinancialEntry()
  const updateEntry = useUpdateFinancialEntry()
  const deleteEntry = useDeleteFinancialEntry()

  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<FinancialEntryWithRelations | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Lê da lista viva para o detalhe não congelar após uma edição.
  const selected = selectedId ? (entries.find((e) => e.id === selectedId) ?? null) : null

  async function handleCreate(data: FinancialEntryInput) {
    await createEntry.mutateAsync({
      ...data,
      legal_process_id: lockedLegalProcessId ?? data.legal_process_id,
      crm_item_id: lockedCrmItemId ?? data.crm_item_id,
      client_id: lockedClientId ?? data.client_id,
    })
    setCreateOpen(false)
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

  const receitas = entries.filter((e) => e.type === 'receita')
  const despesas = entries.filter((e) => e.type === 'despesa')
  const recebido = receitas.filter((e) => e.status === 'pago').reduce((s, e) => s + Number(e.amount), 0)
  const aReceber = receitas.filter((e) => e.status !== 'pago').reduce((s, e) => s + Number(e.amount), 0)
  const totalDespesas = despesas.reduce((s, e) => s + Number(e.amount), 0)

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
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          Novo lançamento
        </button>
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
              const overdue = isFinancialEntryOverdue(entry)

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
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                          isPaid
                            ? 'bg-success/12 text-success'
                            : overdue
                              ? 'bg-destructive/12 text-destructive'
                              : 'bg-warning/12 text-warning'
                        )}
                      >
                        {isPaid ? 'Pago' : overdue ? 'Atrasado' : 'Pendente'}
                      </span>
                      <p className="text-sm font-medium truncate">{entry.description}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{FINANCIAL_CATEGORY_LABELS[entry.category]}</span>
                      <span>·</span>
                      <span className={cn(overdue && 'text-destructive font-medium')}>
                        {isPaid && entry.paid_at
                          ? `Pago em ${format(parseISO(entry.paid_at), 'dd/MM/yyyy', { locale: ptBR })}`
                          : `Vence ${format(parseISO(entry.due_date), 'dd/MM/yyyy', { locale: ptBR })}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <p
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        isReceita ? 'text-success' : 'text-destructive'
                      )}
                    >
                      {isReceita ? '+' : '−'}
                      {formatCurrency(Number(entry.amount))}
                    </p>

                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        title={isPaid ? 'Marcar como pendente' : 'Marcar como pago'}
                        onClick={(e) => {
                          e.stopPropagation() // não abre o detalhe
                          updateEntry.mutate({
                            id: entry.id,
                            status: isPaid ? 'pendente' : 'pago',
                          })
                        }}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        {isPaid ? <Undo2 className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        title="Excluir"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingDelete(entry)
                        }}
                        className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Novo Lançamento</DialogTitle>
          </DialogHeader>
          {/* hideLinks: aberto de dentro de um caso/processo/cliente, o vínculo
              já vem travado pelas props. */}
          <FinancialEntryForm
            onSubmit={handleCreate}
            isLoading={createEntry.isPending}
            hideLinks
          />
        </DialogContent>
      </Dialog>

      <FinancialEntryDetailModal
        entry={selected}
        open={!!selected}
        onClose={() => setSelectedId(null)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Excluir lançamento"
        description={`"${pendingDelete?.description}" será removido permanentemente.`}
        isLoading={deleteEntry.isPending}
        onConfirm={() => {
          if (!pendingDelete) return
          deleteEntry.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })
        }}
      />
    </div>
  )
}
