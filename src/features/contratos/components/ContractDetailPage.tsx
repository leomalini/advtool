'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  FileSignature,
  Loader2,
  Pencil,
  Receipt,
  Trash2,
  User,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { InfoStripItem } from '@/components/shared/DetailStrip'
import { getClientDisplayName } from '@/types/cliente.types'
import {
  CONTRACT_KIND_LABELS,
  CONTRACT_STATUS_LABELS,
  formatPercent,
  getContractNoticeDate,
  type ContractWithRelations,
} from '@/types/contract.types'
import { formatCurrency } from '@/types/financialEntry.types'
import { formatDate, formatDateTime } from '@/utils/date'
import { getDisplayName } from '@/utils/profile'
import { GenerateDocumentDialog } from '@/features/documentos/components/GenerateDocumentDialog'
import { useDocumentsForEntity } from '@/features/documentos/hooks/useDocuments'
import { useDocumentTemplates } from '@/features/documentos/hooks/useDocumentTemplates'
import { useFinancialEntriesForEntity } from '@/features/financeiro/hooks/useFinancialEntries'
import {
  useContract,
  useContractParties,
  useContractStatusChanges,
} from '../hooks/useContracts'
import { useDeleteContract } from '../hooks/useContractMutations'
import { buildContractEntryDrafts } from '../utils/contractEntries'
import { ContractAssemblySteps, type AssemblyStep } from './ContractAssemblySteps'
import { ContractEntriesDialog } from './ContractEntriesDialog'
import { ContractFilesSection } from './ContractFilesSection'
import { ContractFinanceSection } from './ContractFinanceSection'
import { ContractPartiesSection } from './ContractPartiesSection'
import { ReadDocumentsDialog } from './ReadDocumentsDialog'
import { ContractFormDialog } from './ContractFormDialog'
import { ContractSituationBadge } from './ContractSituationBadge'
import { ContractStatusActions } from './ContractStatusActions'

function clientName(contract: ContractWithRelations): string | null {
  return contract.client
    ? getClientDisplayName(contract.client as Parameters<typeof getClientDisplayName>[0])
    : null
}

/** "10× de R$ 500,00" — a parcela é o total dividido, como a minuta vai dizer. */
function describeInstallments(contract: ContractWithRelations): string | null {
  if (!contract.installments) return null
  if (contract.total_amount === null) return `${contract.installments}×`
  const each = Math.round((contract.total_amount / contract.installments) * 100) / 100
  return `${contract.installments}× de ${formatCurrency(each)}`
}

function describeTerm(contract: ContractWithRelations): string | null {
  if (contract.start_date && contract.end_date) {
    return `${formatDate(contract.start_date)} – ${formatDate(contract.end_date)}`
  }
  if (contract.end_date) return `até ${formatDate(contract.end_date)}`
  if (contract.start_date) return `desde ${formatDate(contract.start_date)}`
  return null
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{value ?? '—'}</span>
    </div>
  )
}

export function ContractDetailPage({ contractId }: { contractId: string }) {
  const router = useRouter()
  const { data: contract, isLoading, error } = useContract(contractId)
  const { data: statusChanges = [] } = useContractStatusChanges(contractId)
  const { data: parties = [] } = useContractParties(contractId)
  const { data: documents = [] } = useDocumentsForEntity({ contractId })
  const { data: templates = [] } = useDocumentTemplates()
  const { data: entries = [] } = useFinancialEntriesForEntity({ contractId })
  const deleteContract = useDeleteContract()
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [readOpen, setReadOpen] = useState(false)
  // Aberta pela assinatura, a prévia diz isso no texto e conta as parcelas a
  // partir da data assinada — o contrato em cache ainda não a tem.
  const [entriesDialog, setEntriesDialog] = useState<{ signedAt: string | null } | null>(null)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-muted-foreground">Contrato não encontrado</p>
        <Button variant="outline" onClick={() => router.push('/contratos')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
      </div>
    )
  }

  const client = clientName(contract)
  const fileCount = contract.documents?.length ?? 0
  const noticeDate = getContractNoticeDate(contract)
  const template = templates.find((item) => item.id === contract.template_id) ?? null
  const templateRoles = template?.parties ?? []
  const missingRoles = templateRoles.filter(
    (role) => !parties.some((party) => party.role_key === role.key),
  )
  const hasMinuta = documents.some((document) => document.contract_file_role === 'minuta')
  const partyNames = new Map(parties.map((party) => [party.id, party.name ?? party.role_label]))
  const assembling = contract.status === 'rascunho' || contract.status === 'aguardando_assinatura'

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** Ao assinar, a prévia só abre se houver o que lançar e nada lançado ainda:
   * reabrir e assinar de novo não oferece as parcelas duas vezes. */
  function offerEntriesAfterSigning(signedAt: string) {
    if (!contract || entries.length > 0) return
    const drafts = buildContractEntryDrafts({ ...contract, signed_at: signedAt })
    if (drafts.length > 0) setEntriesDialog({ signedAt })
  }

  const steps: AssemblyStep[] = [
    {
      key: 'modelo',
      label: 'Modelo',
      detail: template ? template.name : 'Sem modelo — escolha em Editar',
      done: !!template,
      onClick: () => setEditOpen(true),
    },
    {
      key: 'partes',
      label: 'Partes',
      detail:
        missingRoles.length > 0
          ? `Falta: ${missingRoles.map((role) => role.label).join(', ')}`
          : parties.length === 0
            ? 'Nenhuma parte'
            : `${parties.length} ${parties.length === 1 ? 'parte' : 'partes'}`,
      done: parties.length > 0 && missingRoles.length === 0,
      onClick: () => scrollTo('partes'),
    },
    {
      key: 'valores',
      label: 'Valores e vigência',
      detail:
        contract.total_amount !== null
          ? formatCurrency(contract.total_amount)
          : 'Sem valor — complete em Editar',
      done: contract.total_amount !== null,
      onClick: () => setEditOpen(true),
    },
    {
      key: 'minuta',
      label: 'Minuta',
      detail: hasMinuta ? 'Gerada — veja em Arquivos' : 'Gerar do modelo',
      done: hasMinuta,
      onClick: () => (hasMinuta ? scrollTo('arquivos') : setGenerateOpen(true)),
    },
  ]

  return (
    <div className="-m-6 flex h-full flex-col">
      <div className="shrink-0 border-b bg-card px-6 py-3">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground" aria-label="Trilha">
          <Link href="/dashboard" className="transition-colors hover:text-foreground">
            Início
          </Link>
          <span className="text-border">/</span>
          <Link href="/contratos" className="transition-colors hover:text-foreground">
            Contratos
          </Link>
          <span className="text-border">/</span>
          <span className="truncate font-medium text-foreground">{contract.title}</span>
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4 p-6">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-start justify-between gap-4 p-5">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <FileSignature className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="truncate text-xl font-bold tracking-tight">{contract.title}</h1>
                    <ContractSituationBadge contract={contract} bordered className="text-[11px]" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {CONTRACT_KIND_LABELS[contract.kind]}
                    {client && contract.client_id && (
                      <>
                        {' · '}
                        <Link
                          href={`/clientes/${contract.client_id}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {client}
                        </Link>
                      </>
                    )}
                    {contract.legal_process && (
                      <>
                        {' · '}
                        <Link
                          href={`/processos/${contract.legal_process.id}`}
                          className="font-mono text-xs hover:text-foreground hover:underline"
                        >
                          {contract.legal_process.cnj_number ?? 'Processo sem CNJ'}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Can resource="contratos" action="update">
                  <ContractStatusActions contract={contract} onSigned={offerEntriesAfterSigning} />
                  <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                    Editar
                  </Button>
                </Can>
                <Can resource="contratos" action="delete">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Excluir contrato"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </Can>
              </div>
            </div>

            <div className="grid grid-cols-2 border-t border-border md:flex">
              <InfoStripItem
                icon={<Wallet className="h-3 w-3" />}
                label="Valor"
                value={contract.total_amount !== null ? formatCurrency(contract.total_amount) : null}
              />
              <InfoStripItem
                icon={<Receipt className="h-3 w-3" />}
                label="Parcelas"
                value={describeInstallments(contract)}
              />
              <InfoStripItem
                icon={<Calendar className="h-3 w-3" />}
                label="Vigência"
                value={describeTerm(contract)}
              />
              <InfoStripItem
                icon={<User className="h-3 w-3" />}
                label="Responsável"
                value={contract.responsible ? getDisplayName(contract.responsible.full_name) : null}
              />
            </div>
          </div>

          {assembling && <ContractAssemblySteps steps={steps} />}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0 space-y-4">
              <div id="partes" className="scroll-mt-4">
                <ContractPartiesSection
                  contractId={contract.id}
                  templateRoles={templateRoles}
                  documents={documents}
                  onReadDocuments={() => setReadOpen(true)}
                />
              </div>
              <div id="arquivos" className="scroll-mt-4">
                <ContractFilesSection
                  contract={contract}
                  onGenerate={() => setGenerateOpen(true)}
                  partyNames={partyNames}
                />
              </div>
              {/* Sem ver o Financeiro, a RLS devolve a lista vazia: a seção
                  diria "nenhum lançamento" de um contrato que tem. */}
              <Can resource="financeiro" action="view">
                <ContractFinanceSection
                  contract={contract}
                  onOpenEntries={() => setEntriesDialog({ signedAt: null })}
                />
              </Can>

              {contract.notes && (
                <section className="space-y-2 rounded-xl border border-border bg-card p-5">
                  <h2 className="text-sm font-semibold">Observações</h2>
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                    {contract.notes}
                  </p>
                </section>
              )}
            </div>

            <div className="space-y-4">
              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="mb-1 text-sm font-semibold">Detalhes</h2>
                <div className="divide-y">
                  <DetailRow
                    label="1º vencimento"
                    value={contract.first_due_date ? formatDate(contract.first_due_date) : null}
                  />
                  {contract.kind === 'honorarios' && (
                    <DetailRow
                      label="Êxito"
                      value={
                        contract.success_fee_percent !== null
                          ? formatPercent(contract.success_fee_percent)
                          : null
                      }
                    />
                  )}
                  <DetailRow
                    label="Assinado em"
                    value={contract.signed_at ? formatDate(contract.signed_at) : null}
                  />
                  <DetailRow
                    label="Aviso"
                    value={
                      noticeDate
                        ? `${formatDate(noticeDate)} (${contract.notice_days} dias antes)`
                        : `${contract.notice_days} dias antes do fim`
                    }
                  />
                  <DetailRow label="Renova sozinho" value={contract.auto_renew ? 'Sim' : 'Não'} />
                  <DetailRow label="Reajuste" value={contract.adjustment_index} />
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-5">
                <h2 className="mb-3 text-sm font-semibold">Histórico</h2>
                {statusChanges.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem mudanças registradas.</p>
                ) : (
                  <ol className="space-y-3">
                    {statusChanges.map((change) => (
                      <li key={change.id} className="flex gap-3 text-sm">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                        <div className="min-w-0">
                          <p>
                            {change.from_status
                              ? `${CONTRACT_STATUS_LABELS[change.from_status]} → ${CONTRACT_STATUS_LABELS[change.to_status]}`
                              : `Registrado como ${CONTRACT_STATUS_LABELS[change.to_status].toLowerCase()}`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(change.changed_at)}
                            {change.changer && ` · ${getDisplayName(change.changer.full_name)}`}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>

      <ContractFormDialog open={editOpen} onOpenChange={setEditOpen} contract={contract} />

      <GenerateDocumentDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        templateId={contract.template_id ?? undefined}
        clientId={contract.client_id ?? undefined}
        processId={contract.legal_process_id ?? undefined}
        scope="contratos"
        contractId={contract.id}
        savedValues={contract.template_values}
      />

      <ContractEntriesDialog
        open={entriesDialog !== null}
        onOpenChange={(open) => !open && setEntriesDialog(null)}
        contract={{ ...contract, signed_at: entriesDialog?.signedAt ?? contract.signed_at }}
        afterSigning={!!entriesDialog?.signedAt}
      />

      <ReadDocumentsDialog
        open={readOpen}
        onOpenChange={setReadOpen}
        contract={contract}
        template={template}
        existingDocuments={documents}
        parties={parties}
      />

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Excluir contrato"
        description={
          `"${contract.title}" será removido permanentemente` +
          (fileCount === 0
            ? '.'
            : fileCount === 1
              ? ', junto com o arquivo anexado.'
              : `, junto com os ${fileCount} arquivos anexados.`) +
          (entries.length > 0
            ? ' Os lançamentos ficam no Financeiro, sem o vínculo com o contrato.'
            : '')
        }
        isLoading={deleteContract.isPending}
        onConfirm={() =>
          deleteContract.mutate(contract.id, {
            onSuccess: () => {
              setConfirmDelete(false)
              router.push('/contratos')
            },
          })
        }
      />
    </div>
  )
}
