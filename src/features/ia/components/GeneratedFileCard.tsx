'use client'

import { AlertTriangle, Download, FileText } from 'lucide-react'
import { aiFileHref } from '../files/constants'

interface GeneratedFileCardProps {
  fileId: string
  fileName: string
  /** Campos que ficaram como `[FALTA: …]` no documento. */
  missingFields?: string[]
  notes?: string[]
}

/**
 * Arquivo que a IA gerou na conversa. O link passa pela rota que confere o
 * dono e redireciona para uma URL assinada de um minuto.
 */
export function GeneratedFileCard({ fileId, fileName, missingFields = [], notes = [] }: GeneratedFileCardProps) {
  const warnings = [
    ...(missingFields.length > 0
      ? [`Campos sem valor no documento (aparecem como [FALTA: …]): ${missingFields.join(', ')}.`]
      : []),
    ...notes,
  ]

  return (
    <div className="rounded-lg border bg-background p-3 text-sm space-y-2">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium">{fileName}</span>
        <a
          href={aiFileHref(fileId)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" />
          Baixar
        </a>
      </div>
      {warnings.length > 0 && (
        <ul className="space-y-1 text-xs">
          {warnings.map((warning) => (
            <li key={warning} className="flex gap-1.5 rounded bg-warning/15 px-2 py-1 text-foreground">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
