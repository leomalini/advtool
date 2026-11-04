'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Scale, Check, Undo2, Percent } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  ASSESS_BEFORE_PAYMENT_REASON,
  FINANCIAL_CATEGORY_LABELS,
  describePercentageNote,
  estimatedFee,
  formatCurrency,
  getCashFlowDate,
  getFinancialSituation,
  isToAssess,
  needsAmountBeforePayment,
  ZERO_AMOUNT_PAYMENT_REASON,
} from '@/types/financialEntry.types'
import { getClientDisplayName } from '@/types/cliente.types'
import type { PendingAttachments } from '@/types/document.types'
import type { FinancialEntryInput } from '@/schemas/financialEntry.schema'
import { CHARGE_BLOCK_REASONS, summarizePaymentCharges } from '@/types/paymentCharge.types'
import { usePermissions } from '@/hooks/usePermissions'
import { useMounted } from '@/hooks/useMounted'
import { useOfficeSettings } from '@/features/configuracoes/hooks/useOfficeSettings'
import { useFinancialEntries } from '../hooks/useFinancialEntries'
import {
  useCreateFinancialEntry,
  useUpdateFinancialEntry,
} from '../hooks/useFinancialEntryMutations'
import { FinancialEntryForm, type FinancialEntrySubmitOptions } from './FinancialEntryForm'
import { FinancialEntryDetailModal } from './FinancialEntryDetailModal'
import { FinanceiroFilterBar } from './FinanceiroFilterBar'
import { FinancialOverview } from './FinancialOverview'
import { FinancialCashFlowChart } from './FinancialCashFlowChart'
import { FinancialSituationBadge } from './FinancialSituationBadge'
import { AttachmentCountBadge } from './AttachmentCountBadge'
import { PaymentLinkBadge } from './PaymentLinkBadge'
import { SuccessFeesPanel } from './SuccessFeesPanel'
import { AssessSuccessFeeDialog } from './AssessSuccessFeeDialog'
import {
  clearListFilters,
  countListFilters,
  filterFinancialEntries,
  periodOf,
  sortByCashFlowDate,
  type FinancialFilters,
} from '../utils/filterFinancialEntries'
import {
  parseFinancialUrl,
  serializeFinancialUrl,
  type FinanceiroTab,
} from '../utils/financialFiltersUrl'
import { describePeriod, isAllDates } from '../utils/periods'
import { SUCCESS_FEE_FORM_DEFAULTS } from '../utils/successFees'
import { Can } from '@/components/shared/Can'

/** Uma constante só para cabeçalho e linhas não saírem de sincronia. */
const TABLE_GRID = 'grid grid-cols-[1fr_150px_150px_100px_120px_100px_44px]'

/** 'yyyy-MM-dd' → 'dd/MM/yyyy'. */
function formatDay(iso: string): string {
  return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR })
}

/**
 * The Financeiro screen. The filters and the open entry start from the URL
 * (`financialFiltersUrl.ts`) and are written back to it, so a dashboard link,
 * the bell's `?id=` or a reload land on the same screen.
 *
 * The state is the source of truth and the URL mirrors it — not the other way
 * round: Next applies `history.replaceState` to `useSearchParams` inside a
 * transition, and a date input driven by the URL would lag behind the typing.
 */
export function FinanceiroContent() {
  const searchParams = useSearchParams()
  // "Today" is the browser's: the server runs on UTC, which from 21h in
  // Brasília is already tomorrow — on the last day of a month it would render
  // next month's period, and hydration would break. Until mounted, the screen
  // below the header is a placeholder on both sides (the data only exists in
  // the browser anyway).
  const mounted = useMounted()
  const [initialUrl] = useState(() => parseFinancialUrl(searchParams))
  const [filters, setFilters] = useState<FinancialFilters>(initialUrl.filters)
  const [selectedId, setSelectedId] = useState<string | null>(initialUrl.entryId)
  const [tab, setTab] = useState<FinanceiroTab>(initialUrl.tab)

  const { data: entries = [], isLoading } = useFinancialEntries()
  const createEntry = useCreateFinancialEntry()
  const updateEntry = useUpdateFinancialEntry()
  // "exito": the same form, opened on a success fee to assess (migration 89).
  // Apart from `createOpen`: the title must not change during the closing fade.
  const [createKind, setCreateKind] = useState<'lancamento' | 'exito'>('lancamento')
  const [createOpen, setCreateOpen] = useState(false)
  const [assessingId, setAssessingId] = useState<string | null>(null)
  const { can } = usePermissions()
  const { data: officeSettings } = useOfficeSettings()
  // Gerar o link junto com o lançamento: só com a conta configurada e para quem
  // pode criar — a rota confere de novo.
  const offerPaymentLink = !!officeSettings?.infinitepay_handle && can('financeiro', 'create')

  // O detalhe lê da lista viva: guardar o objeto do clique congelaria os
  // valores após uma edição.
  const selected = selectedId ? (entries.find((e) => e.id === selectedId) ?? null) : null
  const setSelected = (entry: { id: string } | null) => setSelectedId(entry?.id ?? null)
  const assessing = assessingId ? (entries.find((e) => e.id === assessingId) ?? null) : null

  // An id that is not in the list (deleted, or not visible to this profile)
  // leaves the URL once the list arrives; while it loads, it stays.
  const urlEntryId = isLoading ? selectedId : (selected?.id ?? null)
  const query = serializeFinancialUrl({ filters, entryId: urlEntryId, tab })
  const currentQuery = searchParams.toString()
  useEffect(() => {
    // Also when the URL changed under the screen (a link to /financeiro while
    // on it): the screen did not change, so the URL goes back to saying what
    // it shows. replaceState: no server render, no history entry per click.
    if (query === currentQuery) return
    window.history.replaceState(null, '', `${window.location.pathname}?${query}`)
  }, [query, currentQuery])

  const filtered = useMemo(
    () => sortByCashFlowDate(filterFinancialEntries(entries, filters)),
    [entries, filters]
  )
  // The cards: every filter but the situation — their own slice, which would
  // otherwise zero the cards beside the one clicked.
  const cardRows = useMemo(
    () => filterFinancialEntries(entries, { ...filters, situation: null }),
    [entries, filters]
  )
  // Every date: what the period leaves out, and the chart's six months.
  const allDateRows = useMemo(
    () =>
      filterFinancialEntries(entries, {
        ...filters,
        situation: null,
        periodFrom: null,
        periodTo: null,
        undatedOnly: false,
      }),
    [entries, filters]
  )

  const period = periodOf(filters)
  const hasListFilters = countListFilters(filters) > 0

  function openCreate(kind: 'lancamento' | 'exito') {
    setCreateKind(kind)
    setCreateOpen(true)
  }

  async function handleCreate(
    data: FinancialEntryInput,
    attachments: PendingAttachments,
    { generatePaymentLink }: FinancialEntrySubmitOptions
  ) {
    const created = await createEntry.mutateAsync({ ...data, attachments, generatePaymentLink })
    setCreateOpen(false)
    // Com o link pedido, o próximo passo é mandá-lo: o detalhe abre já com
    // Copiar e WhatsApp.
    if (generatePaymentLink) setSelectedId(created.entryId)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Honorários, custas e despesas do escritório
          </p>
        </div>
        <Can resource="financeiro" action="create">
          <Button size="sm" onClick={() => openCreate('lancamento')}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Lançamento
          </Button>
        </Can>
      </div>

      {mounted ? (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as FinanceiroTab)}
          className="gap-4"
        >
          <TabsList>
            <TabsTrigger value="lancamentos">Lançamentos</TabsTrigger>
            <TabsTrigger value="exitos">Êxitos</TabsTrigger>
          </TabsList>

          <TabsContent value="lancamentos" className="space-y-6">
            <FinanceiroFilterBar filters={filters} onChange={setFilters} />

            <FinancialOverview
              rows={cardRows}
              allDateRows={allDateRows}
              filters={filters}
              onChange={setFilters}
              isLoading={isLoading}
            />

            <FinancialCashFlowChart
              rows={allDateRows}
              filters={filters}
              onChange={setFilters}
              isLoading={isLoading}
            />

            {/* ── Tabela de lançamentos ── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <CardTitle className="text-sm font-semibold">Lançamentos</CardTitle>
                  {!isLoading && entries.length > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {filtered.length} lançamento{filtered.length === 1 ? '' : 's'}{' '}
                      {filters.undatedOnly ? 'sem data definida' : describePeriod(period)}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0 pb-1">
                {isLoading ? (
                  <div className="p-4 space-y-2">
                    {[0, 1, 2].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : entries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
                    <Scale className="w-7 h-7" />
                    <p className="text-sm">Nenhum lançamento registrado</p>
                    <p className="text-xs">
                      Use &ldquo;Novo Lançamento&rdquo; ou a aba Financeiro de um caso/processo
                    </p>
                  </div>
                ) : (
                  // As colunas fixas somam ~736px + gaps; abaixo disso a tabela rola
                  // dentro do próprio card, em vez de empurrar a página.
                  <div className="overflow-x-auto">
                    <div className={cn(TABLE_GRID, 'min-w-[820px] gap-3 px-4 py-2 bg-muted/30 border-y text-xs font-medium text-muted-foreground')}>
                      <span>Descrição</span>
                      <span>Cliente</span>
                      <span>Processo</span>
                      <span>Categoria</span>
                      <span className="text-right">Valor</span>
                      <span>Data</span>
                      <span className="sr-only">Ações</span>
                    </div>
                    <div className="divide-y">
                      {filtered.length === 0 && (
                        <div className="py-10 text-center">
                          <p className="text-sm text-muted-foreground">
                            Nenhum lançamento com esses filtros.
                          </p>
                          <div className="mt-1 flex justify-center gap-4">
                            {hasListFilters && (
                              <button
                                type="button"
                                onClick={() => setFilters(clearListFilters(filters))}
                                className="text-xs text-primary hover:underline"
                              >
                                Limpar filtros
                              </button>
                            )}
                            {(!isAllDates(period) || filters.undatedOnly) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setFilters({
                                    ...filters,
                                    periodFrom: null,
                                    periodTo: null,
                                    undatedOnly: false,
                                  })
                                }
                                className="text-xs text-primary hover:underline"
                              >
                                Ver todas as datas
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {filtered.map((entry) => {
                        const isReceita = entry.type === 'receita'
                        const isPaid = entry.status === 'pago'
                        const situation = getFinancialSituation(entry)
                        const overdue = situation === 'vencido'
                        const isConditional = entry.settlement_kind === 'conditional'
                        const cashFlowDate = getCashFlowDate(entry)
                        const toAssess = isToAssess(entry)
                        const percentageNote = describePercentageNote(entry)
                        const estimate = estimatedFee(entry)
                        // Baixa rápida que o banco recusaria (migration 67): com link
                        // vivo, a baixa cancela o link no detalhe; pago pela
                        // InfinitePay, reabrir é estorno.
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

                        return (
                          <div
                            key={entry.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setSelected(entry)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') setSelected(entry)
                            }}
                            className={cn(
                              TABLE_GRID,
                              // Mesmo min-w do cabeçalho — sem isto as duas partes
                              // desalinham assim que a tabela rola na horizontal.
                              'min-w-[820px] gap-3 px-4 py-3 items-center cursor-pointer hover:bg-muted/20 transition-colors group',
                              'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset'
                            )}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <FinancialSituationBadge entry={entry} short bordered />
                                <span className="text-sm truncate">{entry.description}</span>
                                <AttachmentCountBadge count={entry.documents?.length ?? 0} />
                                <PaymentLinkBadge charges={entry.payment_charges} />
                              </div>
                              {/* A condição é o "vencimento" destes lançamentos —
                                  escondê-la deixaria a linha sem dizer o que se
                                  espera para receber. */}
                              {isConditional && entry.condition_description && (
                                <p
                                  className="text-[11px] text-info/80 truncate mt-0.5 pl-1"
                                  title={entry.condition_description}
                                >
                                  {entry.condition_description}
                                </p>
                              )}
                              {percentageNote && (
                                <p
                                  className="text-[11px] text-muted-foreground truncate mt-0.5 pl-1"
                                  title={percentageNote}
                                >
                                  {percentageNote}
                                </p>
                              )}
                            </div>

                            {/* Cliente e Processo são links: clicar leva ao registro,
                                e o stopPropagation impede que a linha abra junto. */}
                            {entry.client ? (
                              <Link
                                href={`/clientes/${entry.client.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline"
                              >
                                {getClientDisplayName(
                                  entry.client as Parameters<typeof getClientDisplayName>[0]
                                )}
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}

                            {entry.legal_process ? (
                              <Link
                                href={`/processos/${entry.legal_process.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="text-xs font-mono text-muted-foreground truncate hover:text-foreground hover:underline"
                                title={entry.legal_process.cnj_number ?? undefined}
                              >
                                {entry.legal_process.cnj_number ?? 'Sem CNJ'}
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}

                            <p className="text-xs text-muted-foreground">
                              {FINANCIAL_CATEGORY_LABELS[entry.category]}
                            </p>

                            {/* R$ 0,00 would read as nothing to receive: it is
                                not known yet (migration 89). */}
                            {toAssess ? (
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">a apurar</p>
                                {estimate !== null && (
                                  <p className="text-[11px] text-muted-foreground/70 tabular-nums">
                                    est. {formatCurrency(estimate)}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p
                                className={cn(
                                  'text-sm font-semibold text-right tabular-nums',
                                  isReceita ? 'text-success' : 'text-destructive'
                                )}
                              >
                                {isReceita ? '+' : '−'}
                                {formatCurrency(Number(entry.amount))}
                              </p>
                            )}

                            {/* A data que o gráfico e o filtro de período usam: o
                                pago aparece pela data do pagamento, o resto pelo
                                vencimento. Sem isto, filtrar setembro mostraria um
                                pagamento de setembro com a data de agosto. Sem data
                                é estado válido (condição especial): formatar null
                                aqui devolveria "Invalid Date". */}
                            {cashFlowDate ? (
                              <p
                                className={cn(
                                  'text-xs text-muted-foreground',
                                  overdue && 'text-destructive'
                                )}
                                title={
                                  isPaid && entry.due_date
                                    ? `Vencimento: ${formatDay(entry.due_date)}`
                                    : undefined
                                }
                              >
                                {isPaid ? (
                                  <span className="text-success/80">pago </span>
                                ) : (
                                  isConditional && (
                                    <span className="text-muted-foreground/60">prev. </span>
                                  )
                                )}
                                {formatDay(cashFlowDate)}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground/60">Sem data</p>
                            )}

                            {/* Baixa em um clique — o gesto mais repetido do módulo,
                                sem precisar abrir o lançamento. */}
                            <button
                              type="button"
                              title={
                                toAssess
                                  ? 'Apurar'
                                  : (toggleBlockedBy ??
                                    (isPaid ? 'Reabrir (marcar como pendente)' : 'Marcar como pago'))
                              }
                              aria-label={
                                toAssess
                                  ? 'Apurar o êxito'
                                  : isPaid
                                    ? 'Reabrir lançamento'
                                    : 'Marcar como pago'
                              }
                              aria-disabled={!toAssess && toggleBlockedBy !== null}
                              onClick={(e) => {
                                e.stopPropagation() // não abre o detalhe
                                // A success fee to assess has no payment yet:
                                // the gesture opens "Apurar" (migration 89).
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
                                'flex h-7 w-7 items-center justify-center rounded-md border transition-all',
                                'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                                'aria-disabled:cursor-not-allowed aria-disabled:border-border',
                                'aria-disabled:text-muted-foreground/50',
                                'aria-disabled:hover:bg-transparent',
                                isPaid || toAssess
                                  ? 'border-border text-muted-foreground hover:bg-muted'
                                  : 'border-success/40 text-success hover:bg-success/10'
                              )}
                            >
                              {toAssess ? (
                                <Percent className="h-3.5 w-3.5" />
                              ) : isPaid ? (
                                <Undo2 className="h-3.5 w-3.5" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Every success fee, no period: its own filters and cards. */}
          <TabsContent value="exitos">
            <SuccessFeesPanel
              entries={entries}
              isLoading={isLoading}
              onOpenEntry={setSelectedId}
              onAssess={setAssessingId}
              onRegister={() => openCreate('exito')}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-4">
          <Skeleton className="h-[104px] w-full rounded-xl" />
          <Skeleton className="h-[106px] w-full rounded-xl" />
          <Skeleton className="h-[140px] w-full rounded-xl" />
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        {/* Rola por dentro: com vínculos e anexos o formulário passa da altura
            de uma tela de notebook, e o Salvar ficava fora de alcance. */}
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{createKind === 'exito' ? 'Registrar êxito' : 'Novo Lançamento'}</DialogTitle>
          </DialogHeader>
          <FinancialEntryForm
            key={createKind}
            onSubmit={handleCreate}
            isLoading={createEntry.isPending}
            withAttachments
            offerPaymentLink={offerPaymentLink}
            // The success fee starts to assess; process and client are picked
            // in the form, as in a new entry.
            initialValueMode={createKind === 'exito' ? 'percentual' : undefined}
            submitLabel={createKind === 'exito' ? 'Registrar êxito' : undefined}
            defaultValues={createKind === 'exito' ? SUCCESS_FEE_FORM_DEFAULTS : undefined}
          />
        </DialogContent>
      </Dialog>

      <AssessSuccessFeeDialog
        entry={assessing}
        open={!!assessing}
        onOpenChange={(open) => !open && setAssessingId(null)}
      />

      {/* Closing drops `?id=` from the URL (the effect above): a reload does
          not reopen it. */}
      <FinancialEntryDetailModal
        entry={selected}
        open={!!selected}
        onClose={() => setSelectedId(null)}
      />
    </div>
  )
}
