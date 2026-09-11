'use client'

import { useRef, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { tagAppearance, normalizeTagInput, sameTag } from '@/utils/tags'
import type { CrmTag } from '@/schemas/crmItem.schema'

interface TagToggleProps {
  /** Etiquetas oferecidas. As já selecionadas que não estiverem aqui são
   * acrescentadas na exibição, senão uma etiqueta criada em outro item sumiria
   * da lista ao reabrir o formulário. */
  tags: readonly CrmTag[]
  value: CrmTag[]
  onChange: (tags: CrmTag[]) => void
  /** Habilita o "+" de criação rápida. Sem isto o seletor é só de escolha. */
  allowCreate?: boolean
}

/** Seletor de etiquetas — as mesmas em processo, caso e cliente, para que uma
 * etiqueta signifique a mesma coisa em qualquer lugar do sistema. */
export function TagToggle({ tags, value, onChange, allowCreate = false }: TagToggleProps) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Selecionadas que não estão na lista oferecida entram no fim — é o caso da
  // etiqueta criada num cadastro anterior.
  const options: CrmTag[] = [...tags, ...value.filter((v) => !tags.some((t) => sameTag(t, v)))]

  function toggle(tag: CrmTag) {
    onChange(
      value.some((v) => sameTag(v, tag)) ? value.filter((v) => !sameTag(v, tag)) : [...value, tag],
    )
  }

  function commitDraft() {
    const tag = normalizeTagInput(draft)
    if (!tag) {
      cancelDraft()
      return
    }

    // Já existe (ignorando caixa e acento): seleciona a que existe em vez de
    // criar uma quase igual ao lado.
    const existing = options.find((o) => sameTag(o, tag))
    const chosen = existing ?? tag

    if (!value.some((v) => sameTag(v, chosen))) onChange([...value, chosen])

    setDraft('')
    setCreating(false)
  }

  function cancelDraft() {
    setDraft('')
    setCreating(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((tag) => {
        const et = tagAppearance(tag)
        const active = value.some((v) => sameTag(v, tag))
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
              active
                ? cn(et.color, et.textColor, 'border-transparent')
                : 'bg-card border-border text-muted-foreground hover:border-border hover:bg-muted/40'
            )}
          >
            {et.label}
          </button>
        )
      })}

      {allowCreate &&
        (creating ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-ring bg-card py-0.5 pl-2.5 pr-1">
            <input
              ref={inputRef}
              autoFocus
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              // Enter confirma e Esc desiste. `preventDefault` no Enter é
              // obrigatório: o seletor vive dentro do <form> do cadastro, e sem
              // ele a tecla submeteria o processo inteiro.
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitDraft()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  cancelDraft()
                }
              }}
              onBlur={commitDraft}
              placeholder="Nova etiqueta"
              className="w-28 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="button"
              // onMouseDown: o onBlur do input dispara antes do onClick e
              // fecharia o campo antes do clique chegar.
              onMouseDown={(e) => {
                e.preventDefault()
                commitDraft()
              }}
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Confirmar etiqueta"
            >
              <Check className="h-3 w-3" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                cancelDraft()
              }}
              className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Cancelar"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            Nova
          </button>
        ))}
    </div>
  )
}
