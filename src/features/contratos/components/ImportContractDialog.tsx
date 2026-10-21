'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { FileUp, Loader2, Paperclip, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CurrencyInput } from '@/components/shared/CurrencyInput'
import { ClienteCombobox } from '@/features/clientes/components/ClienteCombobox'
import { documentKeys } from '@/features/documentos/hooks/useDocuments'
import { aiFileTypeFromName } from '@/features/ia/files/constants'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { MAX_FILE_SIZE } from '@/schemas/document.schema'
import {
  CONTRACT_KIND_HINTS,
  CONTRACT_KIND_LABELS,
  CONTRACT_KINDS,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUSES,
  PARTY_ROLE_PRESETS,
  type ContractFileRole,
  type ContractKind,
  type ContractStatus,
} from '@/types/contract.types'
import { formatFileSize } from '@/types/document.types'
import { contractKeys } from '../hooks/useContracts'
import type { ImportedContractData, ReaderResult } from '../reading/readerTypes'
import { initialReviewState, type ReviewState } from '../reading/reviewState'
import { applyReading, readContractDocuments } from '../services/contractReader.service'
import {
  createContract,
  deleteContract,
  updateContract,
  uploadContractFile,
} from '../services/contracts.service'
import { ReadingReview } from './ReadingReview'

type Stage = 'pick' | 'reading' | 'review' | 'saving'

/** Os números como a revisão os edita: texto, para os campos ficarem livres. */
interface ContractDraft {
  title: string
  status: ContractStatus
  client_id: string | null
  total_amount: number | null
  installments: string
  first_due_date: string
  success_fee_percent: string
  start_date: string
  end_date: string
  adjustment_index: string
  signed_at: string
}

function draftFrom(data: ImportedContractData | null, fallbackTitle: string): ContractDraft {
  return {
    title: data?.title ?? fallbackTitle,
    // Achou a data da assinatura: é a via assinada, o contrato já vale.
    status: data?.signed_at ? 'vigente' : 'rascunho',
    client_id: null,
    total_amount: data?.total_amount ?? null,
    installments: data?.installments ? String(data.installments) : '',
    first_due_date: data?.first_due_date ?? '',
    success_fee_percent: data?.success_fee_percent != null ? String(data.success_fee_percent) : '',
    start_date: data?.start_date ?? '',
    end_date: data?.end_date ?? '',
    adjustment_index: data?.adjustment_index ?? '',
    signed_at: data?.signed_at ?? '',
  }
}

function optionalInt(value: string): number | null {
  const number = Number(value.trim())
  return value.trim() && Number.isInteger(number) && number >= 1 && number <= 360 ? number : null
}

function optionalPercent(value: string): number | null {
  const number = Number(value.trim().replace(',', '.'))
  return value.trim() && Number.isFinite(number) && number >= 0 && number <= 100 ? number : null
}

/**
 * "Importar contrato pronto": o contrato (PDF ou Word) e, se quiser, os
 * documentos das partes. A IA lê tudo num pedido e preenche partes, valores e
 * vigência; quem importa confere e salva.
 *
 * O registro nasce como rascunho ANTES da leitura — a IA lê do Storage, e o
 * arquivo precisa de um dono. Cancelar apaga esse rascunho e os arquivos.
 */
export function ImportContractDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Fecha só pelo Cancelar: é ele que apaga o rascunho criado para a
          leitura — fechar pelo X ou pelo Esc deixaria o rascunho para trás. */}
      <DialogContent
        className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-3xl"
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        {open && <ImportBody onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ImportBody({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const contractInput = useRef<HTMLInputElement>(null)
  const othersInput = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<Stage>('pick')
  const [kind, setKind] = useState<ContractKind>('cliente_terceiros')
  const [contractFile, setContractFile] = useState<File | null>(null)
  const [fileRole, setFileRole] = useState<ContractFileRole>('assinado')
  const [others, setOthers] = useState<File[]>([])
  const [pickError, setPickError] = useState<string | null>(null)
  const [contractId, setContractId] = useState<string | null>(null)
  const [contractDocumentId, setContractDocumentId] = useState<string | null>(null)
  const [documents, setDocuments] = useState<{ id: string; file_path: string }[]>([])
  const [result, setResult] = useState<ReaderResult | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  const [draft, setDraft] = useState<ContractDraft | null>(null)

  const roles = PARTY_ROLE_PRESETS

  function accept(file: File): boolean {
    if (!aiFileTypeFromName(file.name)) {
      setPickError(`"${file.name}" não é um formato que a IA lê (PDF, imagem, Word, texto).`)
      return false
    }
    if (file.size > MAX_FILE_SIZE) {
      setPickError(`"${file.name}" passa de ${formatFileSize(MAX_FILE_SIZE)}.`)
      return false
    }
    return true
  }

  async function discardDraft() {
    if (!contractId) return
    try {
      await deleteContract(contractId)
      queryClient.invalidateQueries({ queryKey: contractKeys.all })
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
    } catch {
      toast.error('Não foi possível apagar o rascunho da importação. Exclua-o em Contratos.')
    }
  }

  async function read() {
    if (!user || !contractFile) return
    setStage('reading')
    let createdId: string | null = null
    try {
      const contract = await createContract(
        {
          kind,
          title: contractFile.name.replace(/\.[^.]+$/, ''),
          status: 'rascunho',
          client_id: '',
          legal_process_id: '',
          responsible_id: user.id,
          template_id: '',
          total_amount: null,
          installments: null,
          first_due_date: '',
          success_fee_percent: null,
          start_date: '',
          end_date: '',
          notice_days: 30,
          auto_renew: false,
          adjustment_index: '',
          signed_at: '',
          notes: '',
        },
        user.id,
      )
      createdId = contract.id
      setContractId(contract.id)
      const main = await uploadContractFile(contract.id, fileRole, contractFile, user.id)
      const attached = await Promise.all(
        others.map((file) => uploadContractFile(contract.id, 'anexo', file, user.id)),
      )
      const all = [main, ...attached].map((document) => ({
        id: document.id,
        file_path: document.file_path,
      }))
      setContractDocumentId(main.id)
      setDocuments(all)
      const reading = await readContractDocuments({
        contractId: contract.id,
        documentIds: all.map((document) => document.id),
        mode: 'importar',
      })
      // Só cliente vira o cliente do contrato: o fiador já cadastrado como
      // pessoa empresta os dados à parte, não a titularidade.
      const firstClient =
        reading.persons.find((person) => person.clientMatch?.isClient)?.clientMatch ?? null
      setResult(reading)
      setReview(initialReviewState(reading, roles, [], []))
      setDraft({
        ...draftFrom(reading.contract, contract.title),
        client_id: firstClient?.id ?? null,
      })
      if (reading.contract?.kind) setKind(reading.contract.kind)
      setStage('review')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler o contrato.')
      // Nada a conferir: o rascunho criado para a leitura não serve a ninguém.
      if (createdId) {
        await deleteContract(createdId).catch(() => undefined)
        setContractId(null)
      }
      setStage('pick')
    }
  }

  async function save() {
    if (!contractId || !result || !review || !draft) return
    if (kind === 'honorarios' && !draft.client_id) {
      toast.error('Contrato de honorários precisa do cliente.')
      return
    }
    setStage('saving')
    try {
      await updateContract({
        id: contractId,
        kind,
        title: draft.title.trim() || 'Contrato importado',
        status: draft.status,
        client_id: draft.client_id ?? '',
        total_amount: draft.total_amount,
        installments: optionalInt(draft.installments),
        first_due_date: draft.first_due_date,
        success_fee_percent: kind === 'honorarios' ? optionalPercent(draft.success_fee_percent) : null,
        start_date: draft.start_date,
        end_date: draft.end_date,
        adjustment_index: draft.adjustment_index,
        signed_at: draft.signed_at,
      })
      await applyReading({
        contractId,
        result,
        review,
        documents,
        templateId: null,
        savedValues: {},
        contractDocumentId: contractDocumentId ?? undefined,
      })
      queryClient.invalidateQueries({ queryKey: contractKeys.all })
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      toast.success('Contrato importado!')
      onClose()
      router.push(`/contratos/${contractId}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a importação.')
      setStage('review')
    }
  }

  async function cancel() {
    if (stage === 'review') await discardDraft()
    onClose()
  }

  const busy = stage === 'reading' || stage === 'saving'
  const missingRole = review
    ? Object.values(review.persons).some((decision) => decision.include && !decision.role?.key)
    : false
  const setField = (patch: Partial<ContractDraft>) =>
    setDraft((current) => (current ? { ...current, ...patch } : current))

  return (
    <>
      <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14 text-left">
        <DialogTitle>Importar contrato pronto</DialogTitle>
        <DialogDescription>
          {stage === 'review' || stage === 'saving'
            ? 'Confira o que foi lido. O contrato só é salvo quando você confirmar.'
            : 'Suba o contrato (e, se quiser, os documentos das partes). A IA preenche partes, ' +
              'valores e vigência para você conferir.'}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {(stage === 'pick' || stage === 'reading') && (
          <>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {CONTRACT_KINDS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={busy}
                    onClick={() => setKind(option)}
                    aria-pressed={kind === option}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left transition-all',
                      kind === option
                        ? 'border-primary bg-primary/8 text-foreground'
                        : 'border-border text-muted-foreground hover:border-foreground/30',
                    )}
                  >
                    <span className="block text-sm font-medium">{CONTRACT_KIND_LABELS[option]}</span>
                    <span className="block text-[11px] opacity-75">{CONTRACT_KIND_HINTS[option]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>O contrato</Label>
              {contractFile ? (
                <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{contractFile.name}</span>
                  <Select
                    value={fileRole}
                    onValueChange={(value) => setFileRole(value as ContractFileRole)}
                    disabled={busy}
                  >
                    <SelectTrigger className="h-8 w-[130px] text-xs" aria-label="O arquivo é">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="assinado">Via assinada</SelectItem>
                      <SelectItem value="minuta">Minuta</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setContractFile(null)}
                    aria-label="Tirar o arquivo"
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <Button type="button" variant="outline" onClick={() => contractInput.current?.click()}>
                  <FileUp className="h-4 w-4" />
                  Escolher o contrato
                </Button>
              )}
              <input
                ref={contractInput}
                type="file"
                className="hidden"
                onChange={(event) => {
                  setPickError(null)
                  const file = event.target.files?.[0]
                  if (file && accept(file)) setContractFile(file)
                  event.target.value = ''
                }}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Documentos das partes (opcional)</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => othersInput.current?.click()}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Escolher
                </Button>
                <input
                  ref={othersInput}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    setPickError(null)
                    const files = Array.from(event.target.files ?? []).filter(accept)
                    setOthers((current) => [...current, ...files].slice(0, 9))
                    event.target.value = ''
                  }}
                />
              </div>
              {others.length > 0 && (
                <ul className="space-y-1">
                  {others.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          setOthers((current) => current.filter((_, position) => position !== index))
                        }
                        aria-label={`Tirar ${file.name}`}
                        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {pickError && <p className="text-xs text-destructive">{pickError}</p>}
            </div>

            <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Os arquivos vão inteiros para o provedor de IA. No plano gratuito do Gemini, o Google
              pode usar o conteúdo. A leitura gasta 1 pedido da cota.
            </p>
          </>
        )}

        {(stage === 'review' || stage === 'saving') && result && review && draft && (
          <>
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                O contrato
              </h3>
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <div className="space-y-1.5">
                  <Label htmlFor="import-title">Nome</Label>
                  <Input
                    id="import-title"
                    value={draft.title}
                    onChange={(event) => setField({ title: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo</Label>
                  <Select value={kind} onValueChange={(value) => setKind(value as ContractKind)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_KINDS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {CONTRACT_KIND_LABELS[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select
                    value={draft.status}
                    onValueChange={(value) => setField({ status: value as ContractStatus })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONTRACT_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {CONTRACT_STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="import-signed">Assinado em</Label>
                  <Input
                    id="import-signed"
                    type="date"
                    value={draft.signed_at}
                    onChange={(event) => setField({ signed_at: event.target.value })}
                  />
                </div>
                <div className="min-w-0 space-y-1.5">
                  <Label>Cliente{kind === 'honorarios' ? ' *' : ''}</Label>
                  <ClienteCombobox
                    value={draft.client_id}
                    onChange={(id) => setField({ client_id: id })}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Valor total</Label>
                  <CurrencyInput
                    value={draft.total_amount ?? undefined}
                    onChange={(value) => setField({ total_amount: value ?? null })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="import-installments">Parcelas</Label>
                  <Input
                    id="import-installments"
                    inputMode="numeric"
                    value={draft.installments}
                    onChange={(event) => setField({ installments: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="import-first-due">1º vencimento</Label>
                  <Input
                    id="import-first-due"
                    type="date"
                    value={draft.first_due_date}
                    onChange={(event) => setField({ first_due_date: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="import-start">Início</Label>
                  <Input
                    id="import-start"
                    type="date"
                    value={draft.start_date}
                    onChange={(event) => setField({ start_date: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="import-end">Fim</Label>
                  <Input
                    id="import-end"
                    type="date"
                    value={draft.end_date}
                    onChange={(event) => setField({ end_date: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="import-adjustment">Reajuste</Label>
                  <Input
                    id="import-adjustment"
                    value={draft.adjustment_index}
                    onChange={(event) => setField({ adjustment_index: event.target.value })}
                  />
                </div>
                {kind === 'honorarios' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="import-fee">Êxito (%)</Label>
                    <Input
                      id="import-fee"
                      inputMode="decimal"
                      value={draft.success_fee_percent}
                      onChange={(event) => setField({ success_fee_percent: event.target.value })}
                    />
                  </div>
                )}
              </div>
            </section>

            <ReadingReview
              result={result}
              review={review}
              onChange={setReview}
              templateRoles={[]}
              requiredDocumentIds={contractDocumentId ? [contractDocumentId] : []}
            />
          </>
        )}
      </div>

      <DialogFooter className="shrink-0 flex-row flex-wrap items-center gap-2 border-t px-6 py-3 sm:justify-between">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {stage === 'review' && missingRole ? 'Escolha o papel de cada pessoa incluída.' : ''}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => void cancel()} disabled={busy}>
            Cancelar
          </Button>
          {stage === 'pick' || stage === 'reading' ? (
            <Button disabled={!contractFile || busy} onClick={() => void read()}>
              {stage === 'reading' && <Loader2 className="h-4 w-4 animate-spin" />}
              {stage === 'reading' ? 'Lendo…' : 'Ler com IA'}
            </Button>
          ) : (
            <Button disabled={missingRole || busy} onClick={() => void save()}>
              {stage === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar contrato
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  )
}
