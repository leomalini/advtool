'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Paleta única do produto — workflows, colunas e tipos de evento escolhem
 * daqui, para que duas coisas de cores "iguais" sejam realmente iguais. */
export const COLOR_SWATCHES = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#0ea5e9',
  '#3b82f6',
  '#94a3b8',
  '#64748b',
] as const

export function ColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            'h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110',
            value === c && 'ring-2 ring-offset-2 ring-offset-background'
          )}
          style={{
            backgroundColor: c,
            ...(value === c ? { boxShadow: `0 0 0 2px ${c}` } : {}),
          }}
          aria-label={`Cor ${c}`}
        >
          {value === c && <Check className="h-3.5 w-3.5 text-white" />}
        </button>
      ))}
    </div>
  )
}
