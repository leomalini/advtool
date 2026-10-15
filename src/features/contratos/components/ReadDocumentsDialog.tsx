'use client'

import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FileSearch, Loader2, Paperclip, ShieldAlert, X } from 'lucide-react'
import { toast } from 'sonner'
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
import { documentKeys } from '@/features/documentos/hooks/useDocuments'
import { aiFileTypeFromName } from '@/features/ia/files/constants'
import { useAuth } from '@/hooks/useAuth'
import { MAX_FILE_SIZE } from '@/schemas/document.schema'
import {
  PARTY_ROLE_PRESETS,
  sourceKindLabel,
  type ContractParty,
  type ContractWithRelations,
} from '@/types/contract.types'
import {
  formatFileSize,
  getFileExtension,
  type DocumentWithRelations,
} from '@/types/document.types'
import type { DocumentTemplate } from '@/types/documentTemplate.types'
import { contractKeys } from '../hooks/useContracts'
import type { ReaderResult } from '../reading/readerTypes'
import { initialReviewState, type ReviewState } from '../reading/reviewState'
import { applyReading, readContractDocuments } from '../services/contractReader.service'
import { uploadContractFile } from '../services/contracts.service'
import { ReadingReview } from './ReadingReview'

/** Os mesmos tetos da rota: 10 documentos e 50 MB por leitura. */
const MAX_DOCUMENTS = 10
const MAX_TOTAL_BYTES = 50 * 1024 * 1024

type Stage = 'pick' | 'reading' | 'review' | 'saving'

interface ReadDocumentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contract: ContractWithRelations
  template: DocumentTemplate | null
  existingDocuments: readonly DocumentWithRelations[]
  parties: readonly ContractParty[]
}

/**
 * "Ler documentos": sobe os documentos das partes (ou escolhe os que já estão
 * no contrato), lê todos num pedido à IA e mostra o resultado para conferir.
 * Só depois da conferência as partes são criadas.
 */
export function ReadDocumentsDialog(props: ReadDocumentsDialogProps) {
  const { open, onOpenChange } = props
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-3xl">
        {/* Montado a cada abertura: começa do zero. */}
        {open && <ReadDocumentsBody {...props} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function ReadDocumentsBody({
  contract,
  template,
  existingDocuments,
  parties,
  onClose,
}: ReadDocumentsDialogProps & { onClose: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const readable = existingDocuments.filter((document) => aiFileTypeFromName(document.file_name))
  const [stage, setStage] = useState<Stage>('pick')
  const [pending, setPending] = useState<File[]>([])
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        readable
          .filter((document) => document.contract_file_role === 'anexo' && !document.source_kind)
          .map((document) => document.id),
      ),
  )
  const [pickError, setPickError] = useState<string | null>(null)
  const [result, setResult] = useState<ReaderResult | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  /** Documentos desta leitura, inclusive os que subiram agora. */
  const [readDocuments, setReadDocuments] = useState<{ id: string; file_path: string }[]>([])

  const templateRoles = template?.parties ?? []
  const roles = [
    ...templateRoles,
    ...PARTY_ROLE_PRESETS.filter((preset) => !templateRoles.some((role) => role.key === preset.key)),
  ]
  const chosenExisting = readable.filter((document) => selected.has(document.id))
  const count = chosenExisting.length + pending.length
  const totalBytes =
    chosenExisting.reduce((sum, document) => sum + document.file_size, 0) +
    pending.reduce((sum, file) => sum + file.size, 0)
  const overLimit = count > MAX_DOCUMENTS || totalBytes > MAX_TOTAL_BYTES

  function addFiles(list: FileList | null) {
    if (!list) return
    setPickError(null)
    const accepted: File[] = []
    for (const file of Array.from(list)) {
      if (!aiFileTypeFromName(file.name)) {
        setPickError(`"${file.name}" não é um formato que a IA lê (PDF, imagem, Word, texto).`)
        continue
      }
      if (file.size > MAX_FILE_SIZE) {
        setPickError(`"${file.name}" passa de ${formatFileSize(MAX_FILE_SIZE)}.`)
        continue
      }
      accepted.push(file)
    }
    setPending((current) => [...current, ...accepted])
    if (inputRef.current) inputRef.current.value = ''
  }

  async function read() {
    if (!user || count === 0 || overLimit) return
    setStage('reading')
    try {
      // A IA lê do Storage: os arquivos novos sobem antes, como anexos do
      // contrato. "Não guardar", na conferência, os apaga.
      const uploaded = await Promise.all(
        pending.map((file) => uploadContractFile(contract.id, 'anexo', file, user.id)),
      )
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      const documents = [
        ...chosenExisting.map((document) => ({ id: document.id, file_path: document.file_path })),
        ...uploaded.map((document) => ({ id: document.id, file_path: document.file_path })),
      ]
      setReadDocuments(documents)
      setPending([])
      const reading = await readContractDocuments({
        contractId: contract.id,
        documentIds: documents.map((document) => document.id),
        mode: 'partes',
      })
      setResult(reading)
      setReview(initialReviewState(reading, roles, templateRoles, parties))
      setStage('review')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler os documentos.')
      setStage('pick')
    }
  }

  async function save() {
    if (!result || !review) return
    setStage('saving')
    try {
      const { parties: added } = await applyReading({
        contractId: contract.id,
        result,
        review,
        documents: readDocuments,
        templateId: contract.template_id,
        savedValues: contract.template_values,
      })
      queryClient.invalidateQueries({ queryKey: contractKeys.all })
      queryClient.invalidateQueries({ queryKey: documentKeys.all })
      toast.success(
        added === 0
          ? 'Leitura salva.'
          : added === 1
            ? '1 parte adicionada.'
            : `${added} partes adicionadas.`,
      )
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a leitura.')
      setStage('review')
    }
  }

  const included = review
    ? Object.values(review.persons).filter((decision) => decision.include && decision.role?.key)
        .length
    : 0
  const missingRole = review
    ? Object.values(review.persons).some((decision) => decision.include && !decision.role?.key)
    : false

  return (
    <>
      <DialogHeader className="shrink-0 border-b px-6 py-4 pr-14 text-left">
        <DialogTitle>Ler documentos</DialogTitle>
        <DialogDescription>
          {stage === 'review' || stage === 'saving'
            ? 'Confira o que foi lido. Nada foi gravado ainda.'
            : 'CNH, RG, certidões, comprovante de residência, contrato social, matrícula… A IA lê ' +
              'todos de uma vez e junta os dados de cada pessoa.'}
        </DialogDescription>
      </DialogHeader>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {(stage === 'pick' || stage === 'reading') && (
          <div className="space-y-5">
            {readable.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Já no contrato
                </h3>
                <ul className="space-y-1.5">
                  {readable.map((document) => (
                    <li key={document.id} className="flex items-center gap-2.5 rounded-md border px-3 py-2">
                      <Checkbox
                        id={`existing-${document.id}`}
                        checked={selected.has(document.id)}
                        disabled={stage === 'reading'}
                        onCheckedChange={(checked) =>
                          setSelected((current) => {
                            const next = new Set(current)
                            if (checked === true) next.add(document.id)
                            else next.delete(document.id)
                            return next
                          })
                        }
                      />
                      <label htmlFor={`existing-${document.id}`} className="min-w-0 flex-1 text-sm">
                        <span className="block truncate">{document.file_name}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {sourceKindLabel(document.source_kind) ?? 'Ainda não lido'} ·{' '}
                          {formatFileSize(document.file_size)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Documentos novos
                </h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={stage === 'reading'}
                  onClick={() => inputRef.current?.click()}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  Escolher arquivos
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(event) => addFiles(event.target.files)}
                />
              </div>
              {pending.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Fotos ou PDFs dos documentos das partes. Eles entram como anexos do contrato.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {pending.map((file, index) => (
                    <li
                      key={`${file.name}-${file.size}-${file.lastModified}`}
                      className="flex items-center gap-2 rounded-md border px-2 py-1.5"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-[8px] font-bold text-muted-foreground">
                        {getFileExtension(file.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formatFileSize(file.size)}
                      </span>
                      <button
                        type="button"
                        disabled={stage === 'reading'}
                        onClick={() =>
                          setPending((current) => current.filter((_, position) => position !== index))
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
            </section>

            <p className="flex items-start gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Os documentos vão inteiros para o provedor de IA. No plano gratuito do Gemini, o
              Google pode usar o conteúdo. A leitura gasta 1 pedido da cota, qualquer que seja o
              número de arquivos.
            </p>
          </div>
        )}

        {(stage === 'review' || stage === 'saving') && result && review && (
          <ReadingReview
            result={result}
            review={review}
            onChange={setReview}
            templateRoles={templateRoles}
            existingPartyDocuments={parties
              .map((party) => party.document)
              .filter((document): document is string => !!document)}
          />
        )}
      </div>

      <DialogFooter className="shrink-0 flex-row flex-wrap items-center gap-2 border-t px-6 py-3 sm:justify-between">
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          {stage === 'pick' || stage === 'reading'
            ? overLimit
              ? `No máximo ${MAX_DOCUMENTS} documentos e ${formatFileSize(MAX_TOTAL_BYTES)} por leitura.`
              : `${count} ${count === 1 ? 'documento' : 'documentos'} · ${formatFileSize(totalBytes)}`
            : missingRole
              ? 'Escolha o papel de cada pessoa incluída.'
              : ''}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} disabled={stage === 'reading' || stage === 'saving'}>
            Cancelar
          </Button>
          {stage === 'pick' || stage === 'reading' ? (
            <Button disabled={count === 0 || overLimit || stage === 'reading'} onClick={() => void read()}>
              {stage === 'reading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileSearch className="h-4 w-4" />
              )}
              {stage === 'reading' ? 'Lendo…' : 'Ler com IA'}
            </Button>
          ) : (
            <Button disabled={missingRole || stage === 'saving'} onClick={() => void save()}>
              {stage === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
              {included === 0
                ? 'Salvar sem partes'
                : included === 1
                  ? 'Adicionar 1 parte'
                  : `Adicionar ${included} partes`}
            </Button>
          )}
        </div>
      </DialogFooter>
    </>
  )
}
