'use client'

import Link from 'next/link'
import { FileCheck2, Signature } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import type { DocumentWithRelations } from '@/types/document.types'
import { SIGNABLE_FILE_TYPES, type DocumentSignatureSeal } from '@/types/signature.types'
import {
  useDocumentSignatures,
  useSignatureAvailability,
  useSignatureSeals,
} from '../hooks/useSignatures'
import { SendForSignatureDialog } from './SendForSignatureDialog'
import { SignatureRequestList } from './SignatureRequestList'

const EMPTY_SEALS = new Map<string, DocumentSignatureSeal>()

/**
 * O que as listas de Documentos precisam para assinatura: se a D4Sign está
 * pronta e o selo de cada arquivo. Uma consulta de cada para a lista inteira.
 */
export function useDocumentSignatureSeals() {
  const availability = useSignatureAvailability()
  const ready = availability.data === true
  const seals = useSignatureSeals(ready)
  return { ready, seals: seals.data ?? EMPTY_SEALS }
}

/**
 * Pode sair para assinatura daqui: PDF ou Word, sem envio — nem aberto, nem
 * assinado. Arquivo de contrato sai pelo contrato; anexo de lançamento não sai.
 */
export function canSendDocumentForSignature(
  document: DocumentWithRelations,
  seal: DocumentSignatureSeal | undefined,
): boolean {
  return (
    !document.contract_id &&
    !document.financial_entry_id &&
    SIGNABLE_FILE_TYPES.includes(document.file_type) &&
    !seal
  )
}

type SealKey = 'preparing' | 'sent' | 'failed' | 'signed' | 'signed_copy'

const SEAL_LABEL: Record<SealKey, string> = {
  preparing: 'Em assinatura',
  sent: 'Em assinatura',
  failed: 'Envio parou',
  signed: 'Assinado',
  signed_copy: 'Cópia assinada',
}

const SEAL_CLASS: Record<SealKey, string> = {
  preparing: 'bg-warning/12 text-warning',
  sent: 'bg-warning/12 text-warning',
  failed: 'bg-destructive/10 text-destructive',
  signed: 'bg-success/12 text-success',
  signed_copy: 'bg-success/12 text-success',
}

function sealKey(seal: DocumentSignatureSeal): SealKey {
  return seal.kind === 'in_progress' ? seal.status : seal.kind
}

interface DocumentSignatureSealBadgeProps {
  seal: DocumentSignatureSeal
  /** Abre os envios do arquivo (só documento avulso). */
  onOpen: () => void
  /** A cópia assinada, quando está na mesma lista. */
  onOpenSignedCopy?: () => void
}

/**
 * O selo de um arquivo: em assinatura, parado, assinado ou cópia assinada.
 * Arquivo de contrato leva à seção Assinatura do contrato, onde o envio vive.
 */
export function DocumentSignatureSealBadge({
  seal,
  onOpen,
  onOpenSignedCopy,
}: DocumentSignatureSealBadgeProps) {
  const key = sealKey(seal)
  const className = cn(
    'inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-semibold',
    SEAL_CLASS[key],
  )
  const content = (
    <>
      {seal.kind === 'in_progress' ? <Signature className="h-3 w-3" /> : <FileCheck2 className="h-3 w-3" />}
      {SEAL_LABEL[key]}
    </>
  )

  if (seal.kind === 'signed_copy') return <span className={className}>{content}</span>

  return (
    <span className="inline-flex items-center gap-1.5">
      {seal.contractId ? (
        <Link
          href={`/contratos/${seal.contractId}#assinatura`}
          className={cn(className, 'hover:underline')}
          title="Ver na seção Assinatura do contrato"
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onOpen}
          className={cn(className, 'hover:underline')}
          title="Ver o envio para assinatura"
        >
          {content}
        </button>
      )}
      {seal.kind === 'signed' && onOpenSignedCopy && (
        <button
          type="button"
          onClick={onOpenSignedCopy}
          className="text-[10.5px] font-medium text-primary hover:underline"
        >
          ver a versão assinada
        </button>
      )}
    </span>
  )
}

interface DocumentSignatureDialogsProps {
  /** O arquivo do "Enviar para assinatura" aberto. */
  sending: DocumentWithRelations | null
  onSendingChange: (document: DocumentWithRelations | null) => void
  /** O arquivo cujos envios estão abertos. */
  viewing: DocumentWithRelations | null
  onViewingChange: (document: DocumentWithRelations | null) => void
}

/** Os dois diálogos de uma lista de Documentos, montados uma vez por lista. */
export function DocumentSignatureDialogs({
  sending,
  onSendingChange,
  viewing,
  onViewingChange,
}: DocumentSignatureDialogsProps) {
  return (
    <>
      {sending && (
        <SendForSignatureDialog
          open
          onOpenChange={(open) => !open && onSendingChange(null)}
          target={{ kind: 'document', document: sending }}
        />
      )}
      <DocumentSignaturesDialog document={viewing} onClose={() => onViewingChange(null)} />
    </>
  )
}

function DocumentSignaturesDialog({
  document,
  onClose,
}: {
  document: DocumentWithRelations | null
  onClose: () => void
}) {
  const { data: requests = [], isLoading, error } = useDocumentSignatures(document?.id ?? null)
  const { can } = usePermissions()

  return (
    <Dialog open={!!document} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assinatura</DialogTitle>
          <DialogDescription className="truncate">{document?.file_name}</DialogDescription>
        </DialogHeader>
        <SignatureRequestList
          requests={requests}
          isLoading={isLoading}
          error={error}
          canEdit={can('documentos', 'update')}
          emptyText="Nada enviado pela D4Sign."
        />
      </DialogContent>
    </Dialog>
  )
}
