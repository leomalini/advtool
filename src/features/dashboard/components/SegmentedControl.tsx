'use client'

import { useRef } from 'react'
import { cn } from '@/lib/utils'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Shown as a small pill after the label — the size of what the option opens. */
  count?: number
  /** Paints the pill: a count that is a problem when above zero. */
  countTone?: 'info' | 'warning'
}

interface SegmentedControlProps<T extends string> {
  /** Accessible name of the group ("De quem", "Ver"). */
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  /**
   * `tabs` switches what the card shows — each option controls the panel
   * `${id}-panel`, which the card renders with `role="tabpanel"`. `radio`
   * narrows one list (Minhas · Escritório).
   */
  kind?: 'tabs' | 'radio'
  /** Required for `tabs`: prefix of the tab and panel ids. */
  id?: string
  /**
   * In a narrow card (container under `@md`), the options split the width in
   * equal columns, the count above the label — three tabs with counts don't
   * fit in a row on a phone, and a scrolling strip hides the last one.
   */
  stackOnNarrow?: boolean
}

const COUNT_TONES = {
  info: 'bg-info/12 text-info',
  warning: 'bg-warning/12 text-warning',
} as const

/** `stackOnNarrow`: equal columns, count above label. Up here and not inline:
 * Tailwind's class scanner lost these strings when they came after the
 * `buttons.current[index]` of the ref callback below. */
const STACKED_LIST = '@max-md:grid @max-md:w-full @max-md:auto-cols-fr @max-md:grid-flow-col'
const STACKED_OPTION =
  '@max-md:h-auto @max-md:min-w-0 @max-md:flex-col @max-md:gap-0.5 @max-md:px-1 @max-md:py-1.5'
const STACKED_COUNT = '@max-md:order-first'

/**
 * The dashboard's small switch: a muted track with the chosen option raised.
 * Arrow keys move between options (roving focus), as in any tab list or radio
 * group — only the chosen option is in the Tab order.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  kind = 'radio',
  id,
  stackOnNarrow = false,
}: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const next = (index + step + options.length) % options.length
    onChange(options[next].value)
    buttons.current[next]?.focus()
  }

  return (
    <div
      role={kind === 'tabs' ? 'tablist' : 'radiogroup'}
      aria-label={label}
      className={cn(
        'flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px] no-scrollbar',
        stackOnNarrow && STACKED_LIST
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            ref={(element) => {
              buttons.current[index] = element
            }}
            type="button"
            role={kind === 'tabs' ? 'tab' : 'radio'}
            id={kind === 'tabs' && id ? `${id}-tab-${option.value}` : undefined}
            aria-controls={kind === 'tabs' && id ? `${id}-panel` : undefined}
            aria-selected={kind === 'tabs' ? selected : undefined}
            aria-checked={kind === 'radio' ? selected : undefined}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              selected
                ? 'bg-card text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground',
              stackOnNarrow && STACKED_OPTION
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] leading-4 font-bold tabular-nums',
                  option.countTone ? COUNT_TONES[option.countTone] : 'bg-foreground/8 text-muted-foreground',
                  stackOnNarrow && STACKED_COUNT
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
