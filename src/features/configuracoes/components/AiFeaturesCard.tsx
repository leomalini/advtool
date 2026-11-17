'use client'

import { ToggleRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AI_FEATURE_INFO, AI_FEATURES, type AiFeature } from '@/features/ia/config/models'
import { cn } from '@/lib/utils'
import type { AiSettingsSummary } from '@/types/aiSettings.types'
import { useSaveAiFeature } from '../hooks/useAiSettings'

/** Liga e desliga cada função da IA, para todos do escritório. */
export function AiFeaturesCard({
  summary,
  canEdit,
}: {
  summary: AiSettingsSummary
  canEdit: boolean
}) {
  const save = useSaveAiFeature()
  const pending = save.isPending ? save.variables?.feature : undefined

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <ToggleRight className="h-4 w-4 text-muted-foreground" />
          Funções
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Desligar para de gastar com a função em até 30 segundos. O que já estava em andamento
          termina normalmente.
        </p>
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-lg border">
          {AI_FEATURES.map((feature) => (
            <FeatureRow
              key={feature}
              feature={feature}
              enabled={summary.features[feature]}
              disabled={!canEdit || save.isPending}
              pending={pending === feature}
              onToggle={() => save.mutate({ feature, enabled: !summary.features[feature] })}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function FeatureRow({
  feature,
  enabled,
  disabled,
  pending,
  onToggle,
}: {
  feature: AiFeature
  enabled: boolean
  disabled: boolean
  pending: boolean
  onToggle: () => void
}) {
  const info = AI_FEATURE_INFO[feature]
  const id = `ai-feature-${feature}`
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <p id={id} className="text-sm font-medium">
          {info.label}
        </p>
        <p className="text-xs text-muted-foreground">{info.description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby={id}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-60',
          enabled ? 'bg-success' : 'bg-muted-foreground/30',
          pending && 'animate-pulse',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
            enabled ? 'translate-x-4' : 'translate-x-1',
          )}
        />
      </button>
    </div>
  )
}
