'use client'

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AssemblyStep {
  key: string
  label: string
  /** O que está feito ou o que falta, numa linha. */
  detail: string
  done: boolean
  onClick: () => void
}

/**
 * Os passos de montar um contrato, no topo da página enquanto ele é rascunho:
 * modelo → partes → valores → minuta. Cada passo leva ao lugar onde se faz
 * — a página é a mesma que serve para corrigir depois.
 */
export function ContractAssemblySteps({ steps }: { steps: AssemblyStep[] }) {
  const next = steps.find((step) => !step.done)
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li key={step.key}>
          <button
            type="button"
            onClick={step.onClick}
            className={cn(
              'flex w-full items-start gap-2.5 rounded-lg border bg-card p-3 text-left transition-colors',
              'hover:border-foreground/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              step === next && 'border-primary/50 bg-primary/5',
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                step.done ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground',
              )}
            >
              {step.done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{step.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{step.detail}</span>
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
