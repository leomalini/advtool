'use client'

import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { todayISO } from '@/types/financialEntry.types'
import { FilterToggleGroup, type FilterToggleOption } from './FilterToggleGroup'
import {
  ALL_DATES,
  PERIOD_PRESETS,
  PERIOD_PRESET_LABELS,
  detectPreset,
  formatPeriod,
  isAllDates,
  presetRange,
  shiftPeriod,
  type PeriodPreset,
  type PeriodRange,
} from '../utils/periods'

type PeriodOption = PeriodPreset | 'tudo'

const OPTIONS: FilterToggleOption<PeriodOption>[] = [
  ...PERIOD_PRESETS.map((preset) => ({ value: preset, label: PERIOD_PRESET_LABELS[preset] })),
  { value: 'tudo', label: 'Tudo' },
]

const NAV_BUTTON =
  'flex h-9 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors ' +
  'hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40'

const UNDATED_CHIP =
  'flex h-9 items-center gap-1 rounded-md border border-info/30 bg-info/5 px-2.5 text-xs text-info'

/** Less inner padding on a phone, where both inputs share a 300px line. */
const DATE_INPUT = 'h-9 w-[150px] px-2 text-sm sm:px-3'

const DATE_CRITERION =
  'Pagos entram pela data do pagamento; os demais, pelo vencimento — o mesmo critério do gráfico.'

interface FinancialPeriodPickerProps {
  period: PeriodRange
  /** The chart's "Sem data" column: no period, only the entries with no date. */
  undatedOnly: boolean
  /** A new period. The screen leaves "Sem data" with it. */
  onPeriodChange: (period: PeriodRange) => void
  onUndatedOnlyClear: () => void
}

/**
 * The shortcuts, the arrows that step through periods, the name of the one on
 * screen and the dates by hand. Which shortcut is pressed is read from the
 * dates (`detectPreset`), never stored: picking 1–15 by hand lights
 * "Quinzena".
 */
export function FinancialPeriodPicker({
  period,
  undatedOnly,
  onPeriodChange,
  onUndatedOnlyClear,
}: FinancialPeriodPickerProps) {
  const pressed: PeriodOption | null = undatedOnly
    ? null
    : isAllDates(period)
      ? 'tudo'
      : detectPreset(period)
  const previous = undatedOnly ? null : shiftPeriod(period, -1)
  const next = undatedOnly ? null : shiftPeriod(period, 1)

  function select(option: PeriodOption) {
    // A shortcut always goes to the CURRENT period — the way back after
    // stepping through past months.
    onPeriodChange(option === 'tudo' ? ALL_DATES : presetRange(option, todayISO()))
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <FilterToggleGroup label="Período" options={OPTIONS} value={pressed} onSelect={select} />

      {undatedOnly ? (
        <button type="button" onClick={onUndatedOnlyClear} className={UNDATED_CHIP}>
          Só os sem data definida
          <X className="h-3 w-3" />
        </button>
      ) : (
        <div className="flex items-center">
          <button
            type="button"
            disabled={!previous}
            onClick={() => previous && onPeriodChange(previous)}
            aria-label="Período anterior"
            className={NAV_BUTTON}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {/* inline-block: `first-letter` only styles a block box. */}
          <span
            aria-live="polite"
            className="inline-block min-w-[11rem] px-1 text-center text-sm font-medium first-letter:uppercase"
          >
            {formatPeriod(period)}
          </span>
          <button
            type="button"
            disabled={!next}
            onClick={() => next && onPeriodChange(next)}
            aria-label="Próximo período"
            className={NAV_BUTTON}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* "Período", and not "Vencimento": a paid entry counts by its payment
          date, the chart's criterion (getCashFlowDate). */}
      {/* min-w-0: as an item of the wrapping row it would keep the width of
          both inputs and push past a phone screen; this way they shrink. */}
      <div className="flex min-w-0 items-center gap-1.5" title={DATE_CRITERION}>
        <span className="text-xs text-muted-foreground">De</span>
        <Input
          type="date"
          value={undatedOnly ? '' : (period.from ?? '')}
          onChange={(e) => onPeriodChange({ from: e.target.value || null, to: period.to })}
          className={DATE_INPUT}
          aria-label="Período de"
        />
        <span className="text-xs text-muted-foreground">até</span>
        <Input
          type="date"
          value={undatedOnly ? '' : (period.to ?? '')}
          onChange={(e) => onPeriodChange({ from: period.from, to: e.target.value || null })}
          className={DATE_INPUT}
          aria-label="Período até"
        />
      </div>
    </div>
  )
}
