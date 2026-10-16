'use client'

import { useState } from 'react'
import { AlertTriangle, Pencil, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'

interface GenerateCadastroFieldsProps {
  fields: readonly string[]
  values: Readonly<Record<string, string | undefined>> | undefined
  isLoading: boolean
  overrides: Readonly<Record<string, string>>
  onOverride: (name: string, value: string | null) => void
  /** O que o campo é, em português — do catálogo ou do papel da parte. */
  describe: (field: string) => string
  /** Como se chama a falta: "sem dado no cadastro", "sem dado nas partes". */
  missingLabel?: string
}

/**
 * Campos que o sistema preenche — do cadastro ou das partes do contrato — com
 * o valor encontrado. O que falta aparece primeiro, com um campo para
 * completar ali mesmo; vale só para este documento, a origem continua como
 * está.
 */
export function GenerateCadastroFields({
  fields,
  values,
  isLoading,
  overrides,
  onOverride,
  describe,
  missingLabel = 'sem dado no cadastro',
}: GenerateCadastroFieldsProps) {
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set())

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-8 w-full" />
        ))}
      </div>
    )
  }

  const missing = fields.filter((field) => !values?.[field])
  const filled = fields.filter((field) => !!values?.[field])

  function startEditing(name: string) {
    setEditing((current) => new Set(current).add(name))
    onOverride(name, values?.[name] ?? '')
  }

  function stopEditing(name: string) {
    setEditing((current) => {
      const next = new Set(current)
      next.delete(name)
      return next
    })
    onOverride(name, null)
  }

  return (
    <div className="space-y-3">
      {missing.length > 0 && (
        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            {missing.length === 1 ? `1 campo ${missingLabel}` : `${missing.length} campos ${missingLabel}`}
            {' — complete aqui ou deixe sair como [FALTA]'}
          </p>
          {missing.map((field) => (
            <div key={field} className="grid gap-1 sm:grid-cols-[220px_1fr] sm:items-center">
              <label htmlFor={`cadastro-${field}`} className="text-xs">
                <span className="block">{describe(field)}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{`{${field}}`}</span>
              </label>
              <Input
                id={`cadastro-${field}`}
                value={overrides[field] ?? ''}
                onChange={(event) => onOverride(field, event.target.value)}
                placeholder="Não encontrado"
                className="h-8"
              />
            </div>
          ))}
        </div>
      )}

      {filled.length > 0 && (
        <dl className="divide-y rounded-lg border">
          {filled.map((field) => (
            <div
              key={field}
              className="grid gap-1 px-3 py-2 sm:grid-cols-[220px_1fr_auto] sm:items-center"
            >
              <dt className="text-xs">
                <span className="block text-muted-foreground">{describe(field)}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{`{${field}}`}</span>
              </dt>
              <dd className="min-w-0 text-sm">
                {editing.has(field) ? (
                  <Input
                    value={overrides[field] ?? ''}
                    onChange={(event) => onOverride(field, event.target.value)}
                    className="h-8"
                    aria-label={`Valor de {${field}} neste documento`}
                  />
                ) : (
                  <span className="whitespace-pre-wrap break-words">
                    {overrides[field] || values?.[field]}
                  </span>
                )}
              </dd>
              {editing.has(field) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => stopEditing(field)}
                  aria-label="Voltar ao valor original"
                  title="Voltar ao valor original"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => startEditing(field)}
                  aria-label="Alterar só neste documento"
                  title="Alterar só neste documento"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}
