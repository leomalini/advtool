'use client'

import { useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MAX_FILE_SIZE } from '@/schemas/document.schema'
import {
  DOCUMENT_CATEGORY_LABELS,
  FINANCIAL_DOCUMENT_CATEGORIES,
  formatFileSize,
  type DocumentCategory,
  type PendingAttachments,
} from '@/types/document.types'

interface FinancialEntryAttachmentsFieldProps {
  value: PendingAttachments
  onChange: (value: PendingAttachments) => void
}

/** Chave de um arquivo escolhido. Também é o que impede o mesmo arquivo de
 * entrar duas vezes — e de subir duas vezes. */
function fileKey(file: File): string {
  return `${file.name}-${file.size}-${file.lastModified}`
}

/**
 * Documentos escolhidos ao criar o lançamento. Ficam aqui até ele ser salvo e
 * sobem logo depois (useCreateFinancialEntry) — mesmo fluxo dos anexos do
 * EventForm.
 */
export function FinancialEntryAttachmentsField({
  value,
  onChange,
}: FinancialEntryAttachmentsFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)

  /** Mesmo limite da aba Documentos — recusar aqui evita descobrir só depois
   * de salvar que o arquivo não subiu. */
  function handleFilesPicked(picked: FileList | null) {
    if (!picked || picked.length === 0) return

    const known = new Set(value.files.map(fileKey))
    const accepted: File[] = []
    const tooLarge: string[] = []
    for (const file of Array.from(picked)) {
      if (file.size > MAX_FILE_SIZE) tooLarge.push(file.name)
      else if (!known.has(fileKey(file))) accepted.push(file)
    }

    setSizeError(
      tooLarge.length > 0
        ? `Passa de ${formatFileSize(MAX_FILE_SIZE)} e ficou de fora: ${tooLarge.join(', ')}`
        : null
    )
    onChange({ ...value, files: [...value.files, ...accepted] })
    // Permite escolher o mesmo arquivo de novo: sem isto o input não dispara change.
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Paperclip className="h-3.5 w-3.5" />
          Anexar documentos
          <span className="opacity-60">· até {formatFileSize(MAX_FILE_SIZE)} cada</span>
        </button>

        {value.files.length > 0 && (
          <Select
            value={value.category}
            onValueChange={(v) => onChange({ ...value, category: v as DocumentCategory })}
          >
            <SelectTrigger className="h-7 w-[140px] text-xs" aria-label="Categoria dos documentos">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FINANCIAL_DOCUMENT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {DOCUMENT_CATEGORY_LABELS[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFilesPicked(e.target.files)}
      />

      {value.files.length > 0 && (
        <ul className="space-y-1">
          {value.files.map((file) => (
            <li
              key={fileKey(file)}
              className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1 text-xs"
            >
              <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatFileSize(file.size)}</span>
              <button
                type="button"
                aria-label={`Remover ${file.name}`}
                onClick={() =>
                  onChange({
                    ...value,
                    files: value.files.filter((other) => fileKey(other) !== fileKey(file)),
                  })
                }
                className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {sizeError && <p className="text-[11px] text-destructive">{sizeError}</p>}
    </div>
  )
}
