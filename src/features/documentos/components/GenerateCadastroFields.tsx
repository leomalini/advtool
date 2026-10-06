'use client'

import { useState } from 'react'
import { AlertTriangle, Pencil, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { catalogEntry, type CatalogFieldName, type CatalogValues } from '../templates/catalog'

interface GenerateCadastroFieldsProps {
  fields: readonly CatalogFieldName[]
  values: CatalogValues | undefined
  isLoading: boolean
  overrides: Readonly<Record<string, string>>
  onOverride: (name: string, value: string | null) => void
}

/**
 * Campos de cadastro do modelo com o valor que veio do banco. O que falta
 * aparece primeiro, com um campo para completar ali mesmo — vale só para este
 * documento; o cadastro continua como está.
 */
export function GenerateCadastroFields({
  fields,
  values,
  isLoading,
  overrides,
  onOverride,
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
    onOverride(name, values?.[name as CatalogFieldName] ?? '')
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
            {missing.length === 1
              ? '1 campo sem dado no cadastro'
              : `${missing.length} campos sem dado no cadastro`}
            {' — complete aqui ou deixe sair como [FALTA]'}
          </p>
          {missing.map((field) => (
            <div key={field} className="grid gap-1 sm:grid-cols-[220px_1fr] sm:items-center">
              <label htmlFor={`cadastro-${field}`} className="text-xs">
                <span className="block">{catalogEntry(field).description}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{`{${field}}`}</span>
              </label>
              <Input
                id={`cadastro-${field}`}
                value={overrides[field] ?? ''}
                onChange={(event) => onOverride(field, event.target.value)}
                placeholder="Não encontrado no cadastro"
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
                <span className="block text-muted-foreground">
                  {catalogEntry(field).description}
                </span>
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
                  aria-label="Voltar ao valor do cadastro"
                  title="Voltar ao valor do cadastro"
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
