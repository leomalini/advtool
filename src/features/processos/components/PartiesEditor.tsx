'use client'

import { Plus, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { maskDocument } from '@/utils/format'
import type { LegalProcessPartyInput, PartyPolo } from '@/types/legalProcess.types'

/** Um documento só é aceito completo: 11 dígitos (CPF) ou 14 (CNPJ). Qualquer
 * contagem intermediária é digitação pela metade. */
function isCompleteDocument(value: string): boolean {
  const digits = value.replace(/\D/g, '').length
  return digits === 11 || digits === 14
}

const POLO_LABELS: Record<PartyPolo, string> = {
  ativo: 'Pólo Ativo',
  passivo: 'Pólo Passivo',
}

const POLO_HINTS: Record<PartyPolo, string> = {
  ativo: 'Requerente, autor, exequente…',
  passivo: 'Requerido, réu, executado…',
}

function CellInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full px-2.5 py-1.5 rounded-md border border-border text-sm text-foreground bg-card',
        'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring transition-colors',
        className
      )}
      {...props}
    />
  )
}

interface PartiesEditorProps {
  value: LegalProcessPartyInput[]
  onChange: (parties: LegalProcessPartyInput[]) => void
}

/**
 * Editor das partes, agrupado por polo.
 *
 * O estado vive inteiro no formulário — nada é duplicado aqui — porque o
 * `reset()` da edição precisa poder repovoar as linhas, o que um estado interno
 * inicializado uma vez só ignoraria.
 *
 * `position` é a chave de React de cada linha, e por isso nunca é reatribuída:
 * ao adicionar, a nova linha ganha `max(position) + 1` do seu polo; ao remover,
 * as demais ficam como estão. Buracos na sequência não incomodam — o banco usa
 * `position` só para ordenar.
 */
export function PartiesEditor({ value, onChange }: PartiesEditorProps) {
  function updateRow(polo: PartyPolo, position: number, patch: Partial<LegalProcessPartyInput>) {
    onChange(
      value.map((p) => (p.polo === polo && p.position === position ? { ...p, ...patch } : p))
    )
  }

  function removeRow(polo: PartyPolo, position: number) {
    onChange(value.filter((p) => !(p.polo === polo && p.position === position)))
  }

  function addRow(polo: PartyPolo) {
    const positions = value.filter((p) => p.polo === polo).map((p) => p.position)
    const nextPosition = positions.length === 0 ? 0 : Math.max(...positions) + 1
    onChange([
      ...value,
      { name: '', document: null, polo, party_type: null, position: nextPosition, client_id: null },
    ])
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {(['ativo', 'passivo'] as const).map((polo) => {
        const rows = value
          .filter((p) => p.polo === polo)
          .sort((a, b) => a.position - b.position)

        return (
          <div key={polo} className="rounded-lg border border-border p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                  polo === 'ativo'
                    ? 'border-success/30 bg-success/10 text-success'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
                )}
              >
                {POLO_LABELS[polo]}
              </span>
              <button
                type="button"
                onClick={() => addRow(polo)}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Plus className="h-3 w-3" />
                Adicionar
              </button>
            </div>

            {rows.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">{POLO_HINTS[polo]}</p>
            ) : (
              <div className="space-y-2">
                {rows.map((party) => (
                  <div key={party.position} className="flex items-start gap-1.5">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <CellInput
                        value={party.name}
                        onChange={(e) => updateRow(polo, party.position, { name: e.target.value })}
                        placeholder="Nome da parte"
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <div>
                          <CellInput
                            value={party.document ?? ''}
                            onChange={(e) =>
                              updateRow(polo, party.position, {
                                document: maskDocument(e.target.value) || null,
                              })
                            }
                            placeholder="CPF / CNPJ"
                            inputMode="numeric"
                            className={cn(
                              'font-mono',
                              party.document &&
                                !isCompleteDocument(party.document) &&
                                'border-destructive/60 focus:border-destructive focus:ring-destructive/20'
                            )}
                          />
                          {party.document && !isCompleteDocument(party.document) && (
                            <p className="mt-1 text-[11px] text-destructive">
                              CPF ou CNPJ incompleto
                            </p>
                          )}
                        </div>
                        <CellInput
                          value={party.party_type ?? ''}
                          onChange={(e) =>
                            updateRow(polo, party.position, { party_type: e.target.value || null })
                          }
                          placeholder="Qualificação"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeRow(polo, party.position)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={`Remover ${party.name || 'parte'}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
