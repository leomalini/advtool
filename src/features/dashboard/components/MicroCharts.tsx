'use client'

import Link from 'next/link'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * The small charts of the indicator tiles — plain HTML, so they stay crisp at
 * any size and need no chart library. Each one has an accessible name with the
 * numbers it draws; the marks themselves are decoration for the eye.
 */

interface MeterProps {
  value: number
  max: number
  /** What the bar says, in words — "11 de 18 com monitoramento". */
  label: string
}

/** A ratio against a whole: the fill on a lighter track of the same hue. */
export function Meter({ value, max, label }: MeterProps) {
  const ratio = max > 0 ? Math.min(value / max, 1) : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      className="h-1.5 w-full overflow-hidden rounded-full bg-accent-foreground/15"
    >
      <div className="h-full rounded-full bg-accent-foreground" style={{ width: `${ratio * 100}%` }} />
    </div>
  )
}

export interface MiniColumn {
  key: string
  value: number
  /** Tooltip text — "sex, 09/10: 2 publicações". */
  label: string
}

interface MiniColumnsProps {
  columns: MiniColumn[]
  /** Accessible summary of the whole series. */
  label: string
}

/**
 * A short daily series as columns (counts per day have many zeros, which a
 * line would turn into a misleading ramp). The last column — today — wears the
 * accent; the rest the de-emphasis gray. A zero still shows a 2px stub, so
 * "nothing that day" reads differently from "no day".
 */
export function MiniColumns({ columns, label }: MiniColumnsProps) {
  const max = Math.max(1, ...columns.map((column) => column.value))
  return (
    <div role="img" aria-label={label} className="flex h-8 items-end gap-[3px]">
      {columns.map((column, index) => {
        const last = index === columns.length - 1
        return (
          <Tooltip key={column.key}>
            <TooltipTrigger asChild>
              <span className="relative z-10 flex h-full min-w-0 flex-1 items-end">
                <span
                  className={cn(
                    'block w-full rounded-t-[2px]',
                    last ? 'bg-accent-foreground' : 'bg-muted-foreground/45',
                    column.value === 0 && 'opacity-50'
                  )}
                  style={{ height: column.value === 0 ? 2 : `${Math.max((column.value / max) * 100, 12)}%` }}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>{column.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export interface Segment {
  key: string
  value: number
  /** Fill class — the colour that means this part. */
  className: string
  /** Tooltip and accessible name — "Vencido: R$ 6.200". */
  label: string
  /** Each part can open its own slice of the list. */
  href?: string
}

interface SegmentBarProps {
  segments: Segment[]
  label: string
}

/**
 * Part of a whole as one bar: segments separated by a 2px gap of the surface,
 * never by a stroke. Parts with a link sit above the tile's own link.
 */
export function SegmentBar({ segments, label }: SegmentBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0)
  const visible = segments.filter((segment) => segment.value > 0)

  if (total === 0) {
    return <div role="img" aria-label={label} className="h-2 w-full rounded-full bg-muted" />
  }

  return (
    <div role="group" aria-label={label} className="flex h-2 w-full gap-0.5">
      {visible.map((segment) => {
        const shape = cn(
          'relative z-10 block h-full min-w-1 first:rounded-l-full last:rounded-r-full',
          segment.className
        )
        const width = { width: `${(segment.value / total) * 100}%` }
        return (
          <Tooltip key={segment.key}>
            <TooltipTrigger asChild>
              {segment.href ? (
                <Link
                  href={segment.href}
                  aria-label={segment.label}
                  className={cn(shape, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
                  style={width}
                />
              ) : (
                <span role="img" aria-label={segment.label} className={shape} style={width} />
              )}
            </TooltipTrigger>
            <TooltipContent>{segment.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
