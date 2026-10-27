'use client'

import { useRef, useState } from 'react'
import { Loader2, Paperclip, X } from 'lucide-react'
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
import { MAX_FILE_SIZE } from '@/schemas/document.schema'
import { formatFileSize } from '@/types/document.types'
import { todayISO } from '@/types/financialEntry.types'

interface ContractSignDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Já existe versão assinada anexada: o arquivo vira opcional de verdade. */
  hasSignedFile: boolean
  /** Há um envio aberto na D4Sign: marcar aqui não o cancela. */
  hasOpenSignature?: boolean
  isLoading: boolean
  onConfirm: (signedAt: string, signedFile: File | null) => void
}

/**
 * "Marcar como assinado": a data da assinatura e, se houver, o PDF assinado.
 *
 * Depois de confirmar, a página do contrato oferece a prévia dos lançamentos
 * (ContractEntriesDialog) — num passo à parte, para a assinatura não depender
 * de permissão no Financeiro.
 */
export function ContractSignDialog({
  open,
  onOpenChange,
  hasSignedFile,
  hasOpenSignature,
  isLoading,
  onConfirm,
}: ContractSignDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(value) => !isLoading && onOpenChange(value)}>
      <DialogContent className="sm:max-w-[440px]">
        {/* Montado a cada abertura: começa com a data de hoje e sem arquivo. */}
        {open && (
          <SignForm
            hasSignedFile={hasSignedFile}
            hasOpenSignature={hasOpenSignature}
            isLoading={isLoading}
            onCancel={() => onOpenChange(false)}
            onConfirm={onConfirm}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SignForm({
  hasSignedFile,
  hasOpenSignature,
  isLoading,
  onCancel,
  onConfirm,
}: Omit<ContractSignDialogProps, 'open' | 'onOpenChange'> & { onCancel: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [signedAt, setSignedAt] = useState(todayISO())
  const [file, setFile] = useState<File | null>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)

  function pickFile(list: FileList | null) {
    const picked = list?.[0] ?? null
    setSizeError(null)
    if (picked && picked.size > MAX_FILE_SIZE) {
      setSizeError(`O arquivo passa de ${formatFileSize(MAX_FILE_SIZE)}.`)
      return
    }
    setFile(picked)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Marcar como assinado</DialogTitle>
        <DialogDescription>
          O contrato passa a vigente. Informe quando foi assinado
          {hasSignedFile ? '.' : ' e, se tiver, anexe a versão assinada.'}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {hasOpenSignature && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            Há um envio aberto na D4Sign. Marcar como assinado aqui não o cancela: quem ainda não
            assinou continua recebendo o link. Para parar, cancele o envio na seção Assinatura.
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="contract-sign-date">Assinado em</Label>
          <Input
            id="contract-sign-date"
            type="date"
            value={signedAt}
            onChange={(event) => setSignedAt(event.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Versão assinada</Label>
          {file ? (
            <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                aria-label="Tirar o arquivo"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              <Paperclip className="h-3.5 w-3.5" />
              Escolher arquivo
            </Button>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => pickFile(event.target.files)}
          />
          {sizeError ? (
            <p className="text-xs text-destructive">{sizeError}</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {hasSignedFile
                ? 'Já há uma versão assinada anexada. Outra entra ao lado dela.'
                : 'Opcional. Dá para anexar depois, nos arquivos do contrato.'}
            </p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button disabled={isLoading || !signedAt} onClick={() => onConfirm(signedAt, file)}>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          Confirmar assinatura
        </Button>
      </DialogFooter>
    </>
  )
}
