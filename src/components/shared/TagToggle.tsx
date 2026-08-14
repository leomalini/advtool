'use client'

import { cn } from '@/lib/utils'
import { ETIQUETAS } from '@/data/mock'
import type { CrmTag } from '@/schemas/crmItem.schema'

interface TagToggleProps {
  tags: readonly CrmTag[]
  value: CrmTag[]
  onChange: (tags: CrmTag[]) => void
}

/** Seletor de etiquetas — as mesmas em processo, caso e cliente, para que uma
 * etiqueta signifique a mesma coisa em qualquer lugar do sistema. */
export function TagToggle({ tags, value, onChange }: TagToggleProps) {
  function toggle(tag: CrmTag) {
    onChange(value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag])
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const et = ETIQUETAS[tag]
        const active = value.includes(tag)
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
    </div>
  )
}
