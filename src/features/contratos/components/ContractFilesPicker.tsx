'use client'

import { useRef, useState } from 'react'
import { Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MAX_FILE_SIZE } from '@/schemas/document.schema'
import {
  CONTRACT_FILE_ROLE_LABELS,
  CONTRACT_FILE_ROLES,
  type ContractFileRole,
} from '@/types/contract.types'
import { formatFileSize, getFileExtension } from '@/types/document.types'
import type { PendingContractFile } from '../hooks/useContractMutations'

interface ContractFilesPickerProps {
  value: PendingContractFile[]
  onChange: (files: PendingContractFile[]) => void
  /** Papel sugerido para o arquivo escolhido: minuta num rascunho, assinado
   * num contrato que já vale. Cada um pode ser trocado na lista. */
  defaultRole: ContractFileRole
}

/** Arquivos escolhidos no cadastro do contrato, para subir depois de salvar —
 * mesmo papel do `FinancialEntryAttachmentsField`. */
export function ContractFilesPicker({ value, onChange, defaultRole }: ContractFilesPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [sizeError, setSizeError] = useState<string | null>(null)

  function addFiles(list: FileList | null) {
    if (!list) return
    setSizeError(null)
    const accepted: PendingContractFile[] = []
    for (const file of Array.from(list)) {
      if (file.size > MAX_FILE_SIZE) {
        setSizeError(`"${file.name}" passa de ${formatFileSize(MAX_FILE_SIZE)} e ficou de fora.`)
        continue
      }
      accepted.push({ file, role: defaultRole })
    }
    onChange([...value, ...accepted])
    // Permite escolher o mesmo arquivo de novo depois de removê-lo.
    if (inputRef.current) inputRef.current.value = ''
  }

  function setRole(index: number, role: ContractFileRole) {
    onChange(value.map((item, position) => (position === index ? { ...item, role } : item)))
  }

  function remove(index: number) {
    onChange(value.filter((_, position) => position !== index))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label>Arquivos</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip className="h-3.5 w-3.5" />
          Escolher
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => addFiles(event.target.files)}
        />
      </div>

      {value.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          A minuta, a versão assinada ou documentos das partes. Também dá para anexar depois, no
          contrato.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {value.map((item, index) => (
            <li
              key={`${item.file.name}-${item.file.size}-${item.file.lastModified}`}
              className="flex items-center gap-2 rounded-md border px-2 py-1.5"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-[8px] font-bold text-muted-foreground">
                {getFileExtension(item.file.name)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{item.file.name}</span>
              <Select
                value={item.role}
                onValueChange={(role) => setRole(index, role as ContractFileRole)}
              >
                <SelectTrigger className="h-7 w-[110px] text-xs" aria-label="Papel do arquivo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_FILE_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {CONTRACT_FILE_ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => remove(index)}
                aria-label={`Tirar ${item.file.name}`}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {sizeError && <p className="text-xs text-destructive">{sizeError}</p>}
    </div>
  )
}
