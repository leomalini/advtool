/** The states of the status pills in the monitoring card's header — the
 * webhook deliveries and the credit balance, side by side, so they share the
 * shape and the colors. */
export type StatusTone = 'success' | 'warning' | 'danger' | 'muted'

export const STATUS_PILL =
  'inline-flex h-7 max-w-[16rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ' +
  'transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export const PILL_TONES: Record<StatusTone, string> = {
  success: 'border-success/30 bg-success/8',
  warning: 'border-warning/35 bg-warning/10',
  danger: 'border-destructive/35 bg-destructive/10 text-destructive',
  muted: 'bg-card',
}

export const DOT_TONES: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  muted: 'bg-muted-foreground/60',
}

export const TEXT_TONES: Record<StatusTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-destructive',
  muted: 'text-muted-foreground',
}
