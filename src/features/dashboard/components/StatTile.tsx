'use client'

import Link from 'next/link'
import { ArrowUpRight, type LucideIcon } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useCountUp } from '../hooks/useCountUp'
import { formatCount } from '../utils/format'
import { ENTER_ANIMATION } from '../utils/motion'
import { type DashboardTone } from './DashboardCard'

/** The supporting line: muted at rest, coloured when it flags a problem. */
export type StatFootTone = 'muted' | 'warning' | 'danger' | 'success'

/** Fundo do indicador: a cor do assunto misturada ao card (docs/redesign-visual.md,
 * "Com tons"). Strings completas no topo para o extrator do Tailwind. */
const TONE_TINT_CLASSES: Record<DashboardTone, string> = {
  accent: 'bg-[color-mix(in_srgb,var(--primary)_9%,var(--card))] dark:bg-[color-mix(in_srgb,var(--primary)_13%,var(--card))]',
  info: 'bg-[color-mix(in_srgb,var(--info)_9%,var(--card))] dark:bg-[color-mix(in_srgb,var(--info)_13%,var(--card))]',
  warning: 'bg-[color-mix(in_srgb,var(--warning)_9%,var(--card))] dark:bg-[color-mix(in_srgb,var(--warning)_13%,var(--card))]',
  success: 'bg-[color-mix(in_srgb,var(--success)_9%,var(--card))] dark:bg-[color-mix(in_srgb,var(--success)_13%,var(--card))]',
  danger: 'bg-[color-mix(in_srgb,var(--destructive)_9%,var(--card))] dark:bg-[color-mix(in_srgb,var(--destructive)_13%,var(--card))]',
  violet: 'bg-[color-mix(in_srgb,var(--chart-2)_9%,var(--card))] dark:bg-[color-mix(in_srgb,var(--chart-2)_13%,var(--card))]',
  muted: 'bg-card',
}

/** Ícone sólido na cor do assunto, com o texto de contraste de cada token. */
const TONE_SOLID_CHIP_CLASSES: Record<DashboardTone, string> = {
  accent: 'bg-primary text-primary-foreground',
  info: 'bg-info text-info-foreground',
  warning: 'bg-warning text-warning-foreground',
  success: 'bg-success text-success-foreground',
  danger: 'bg-destructive text-destructive-foreground',
  violet: 'bg-chart-2 text-white dark:text-background',
  muted: 'bg-muted text-muted-foreground',
}

const FOOT_TONES: Record<StatFootTone, string> = {
  muted: 'text-muted-foreground',
  warning: 'text-warning',
  danger: 'text-destructive',
  success: 'text-success',
}

interface StatTileProps {
  label: string
  icon: LucideIcon
  tone: DashboardTone
  /** The screen that lists what the number counts. */
  href: string
  /** `null` while it loads. */
  value: number | null
  /** The query failed: a dash, never a made-up zero. */
  isError?: boolean
  /** "R$" for an amount — smaller and muted, so the figure leads. */
  prefix?: string
  /** Paints the number itself — for counts that are a problem above zero. */
  danger?: boolean
  /** The micro-chart, beside the number (below it on a narrow tile). */
  chart?: React.ReactNode
  foot?: React.ReactNode
  footTone?: StatFootTone
  className?: string
}

/**
 * An indicator: label, the number counting up as it arrives, a small chart of
 * what the number is made of, and a supporting line. The whole tile opens the
 * list behind the number (stretched link); a chart whose parts are links of
 * their own sits above it.
 *
 * The value keeps proportional figures: `tabular-nums` makes a big "121" look
 * loose, and nothing here lines up in a column.
 */
export function StatTile({
  label,
  icon: Icon,
  tone,
  href,
  value,
  isError = false,
  prefix,
  danger = false,
  chart,
  foot,
  footTone = 'muted',
  className,
}: StatTileProps) {
  const shown = useCountUp(value)
  const finalText = value === null ? null : `${prefix ? `${prefix} ` : ''}${formatCount(value)}`

  return (
    <div
      className={cn(
        '@container group relative flex min-w-0 flex-col gap-2.5 rounded-2xl p-4 text-card-foreground card-shadow',
        'transition-[translate] motion-safe:hover:-translate-y-px',
        TONE_TINT_CLASSES[tone],
        'has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring',
        ENTER_ANIMATION,
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            TONE_SOLID_CHIP_CLASSES[tone]
          )}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <Link
          href={href}
          className="min-w-0 truncate after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none @max-[13rem]:whitespace-normal"
        >
          {label}
        </Link>
        <ArrowUpRight
          aria-hidden
          className="ml-auto size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-has-[a:focus-visible]:opacity-100"
        />
      </div>

      <div className="flex min-h-9 items-end justify-between gap-3 @max-[14rem]:flex-col @max-[14rem]:items-stretch">
        {shown === null && !isError ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p
            className={cn(
              'text-3xl leading-none font-bold tracking-tight whitespace-nowrap',
              danger && 'text-destructive'
            )}
          >
            {/* Assistive tech reads the final number, never a frame of the count. */}
            <span className="sr-only">{finalText ?? 'indisponível'}</span>
            <span aria-hidden>
              {prefix && (
                <span className="mr-0.5 text-base font-semibold tracking-normal text-muted-foreground">
                  {prefix}
                </span>
              )}
              {shown === null ? '—' : formatCount(Math.round(shown))}
            </span>
          </p>
        )}
        {chart && <div className="w-[min(7.5rem,50%)] shrink-0 pb-0.5 @max-[14rem]:w-full">{chart}</div>}
      </div>

      {foot && (
        <p className={cn('flex min-h-4 items-center gap-1.5 text-xs', FOOT_TONES[footTone])}>{foot}</p>
      )}
    </div>
  )
}
