'use client'

import { Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { DOCUMENT_CATEGORY_LABELS, type DocumentWithRelations } from '@/types/document.types'
import { DRAFT_MAX_DOCUMENTS, DRAFT_MAX_NOTES } from '../templates/drafting'
import type { AiFieldDefinition } from '../templates/fieldSettings'

interface GenerateAiFieldsProps {
  fields: readonly AiFieldDefinition[]
  texts: Readonly<Record<string, string>>
  onTextChange: (name: string, text: string) => void
  /** Sem permissão do Assistente, os campos continuam — digitados à mão. */
  canUseAi: boolean
  notes: string
  onNotesChange: (notes: string) => void
  /** Documentos do cliente/processo que a IA pode ler. */
  documents: readonly DocumentWithRelations[]
  selectedDocumentIds: readonly string[]
  onToggleDocument: (id: string) => void
  onDraft: (fields: string[]) => void
  /** Campos sendo redigidos agora; null quando nada está em andamento. */
  draftingFields: readonly string[] | null
}

/**
 * Campos de texto corrido. A IA redige a partir das anotações, dos documentos
 * escolhidos e dos dados do processo; o texto volta para cá e quem gera
 * revisa — nada sai para o documento sem passar por esta tela.
 */
export function GenerateAiFields({
  fields,
  texts,
  onTextChange,
  canUseAi,
  notes,
  onNotesChange,
  documents,
  selectedDocumentIds,
  onToggleDocument,
  onDraft,
  draftingFields,
}: GenerateAiFieldsProps) {
  const drafting = draftingFields !== null
  const emptyFields = fields
    .filter((field) => !texts[field.name]?.trim())
    .map((field) => field.name)

  return (
    <div className="space-y-4">
      {canUseAi && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="space-y-1.5">
            <label htmlFor="ai-notes" className="text-sm font-medium">
              O que a IA precisa saber do caso
            </label>
            <Textarea
              id="ai-notes"
              value={notes}
              maxLength={DRAFT_MAX_NOTES}
              rows={4}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder={
                'Fatos, datas, valores, o que o cliente relatou. A IA só usa o que estiver ' +
                'aqui, nos documentos marcados e nos dados do processo.'
              }
            />
          </div>

          {documents.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                Documentos para a IA ler{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  (até {DRAFT_MAX_DOCUMENTS}; vão inteiros)
                </span>
              </p>
              <div className="max-h-40 space-y-0.5 overflow-y-auto">
                {documents.map((document) => {
                  const checked = selectedDocumentIds.includes(document.id)
                  const full = !checked && selectedDocumentIds.length >= DRAFT_MAX_DOCUMENTS
                  return (
                    <label
                      key={document.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm',
                        'hover:bg-accent/50',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={full}
                        onCheckedChange={() => onToggleDocument(document.id)}
                      />
                      <span className="min-w-0 flex-1 truncate">{document.file_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {DOCUMENT_CATEGORY_LABELS[document.category]}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              size="sm"
              disabled={drafting || emptyFields.length === 0}
              onClick={() => onDraft(emptyFields)}
              title={
                emptyFields.length === 0 ? 'Todos os campos já têm texto — use Refazer.' : undefined
              }
            >
              {drafting && draftingFields.length > 1 ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Redigir com IA
            </Button>
            <p className="text-xs text-muted-foreground">
              Vão para o provedor de IA: nomes, dados do processo, suas anotações e os documentos
              marcados. CPF, RG e endereço não vão — o sistema preenche depois.
            </p>
          </div>
        </div>
      )}

      {fields.map((field) => {
        const busy = draftingFields?.includes(field.name) ?? false
        return (
          <div key={field.name} className="space-y-1">
            <div className="flex items-center gap-2">
              <label htmlFor={`ai-${field.name}`} className="flex items-baseline gap-2 text-sm">
                {field.label}
                <span className="font-mono text-[11px] text-muted-foreground">
                  {`{${field.name}}`}
                </span>
              </label>
              {canUseAi && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="ml-auto"
                  disabled={drafting}
                  onClick={() => onDraft([field.name])}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {texts[field.name]?.trim() ? 'Refazer' : 'Redigir'}
                </Button>
              )}
            </div>
            {field.instruction && (
              <p className="text-xs text-muted-foreground">{field.instruction}</p>
            )}
            <Textarea
              id={`ai-${field.name}`}
              value={texts[field.name] ?? ''}
              rows={6}
              onChange={(event) => onTextChange(field.name, event.target.value)}
              placeholder={busy ? 'A IA está redigindo…' : 'Linha em branco separa parágrafos.'}
              disabled={busy}
            />
          </div>
        )
      })}
    </div>
  )
}
