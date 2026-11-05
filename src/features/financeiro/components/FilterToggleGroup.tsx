'use client'

import { cn } from '@/lib/utils'

export interface FilterToggleOption<T extends string> {
  value: T
  label: string
}

interface FilterToggleGroupProps<T extends string> {
  /** Accessible name of the group ("Período", "Tipo"). */
  label: string
  options: readonly FilterToggleOption<T>[]
  /** `null`: none pressed — dates picked by hand match no shortcut. */
  value: T | null
  onSelect: (value: T) => void
  className?: string
}

/**
 * Buttons on a muted track, the pressed one raised — the height of the bar's
 * selects and inputs (h-9). Pressing the pressed one again still calls
 * `onSelect`: for a period that is "back to the current one".
 */
export function FilterToggleGroup<T extends string>({
  label,
  options,
  value,
  onSelect,
  className,
}: FilterToggleGroupProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex h-9 max-w-full items-center gap-0.5 overflow-x-auto rounded-md bg-muted',
        'p-[3px] no-scrollbar',
        className
      )}
    >
      {options.map((option) => {
        const pressed = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(option.value)}
            className={cn(
              // Tighter on a phone: the five period shortcuts fit in one row.
              'inline-flex h-full shrink-0 items-center rounded-[5px] px-2 text-[13px] font-medium',
              'whitespace-nowrap transition-colors sm:px-3 sm:text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              pressed
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
