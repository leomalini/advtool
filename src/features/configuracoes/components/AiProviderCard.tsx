'use client'

import { useState } from 'react'
import { Bot, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import {
  AI_MODEL_OPTIONS,
  AI_PROVIDER_LABELS,
  AI_PROVIDERS,
  type AssistantProvider,
} from '@/features/ia/config/models'
import { cn } from '@/lib/utils'
import type { AiSettingsSummary } from '@/types/aiSettings.types'
import { useSaveAiProvider } from '../hooks/useAiSettings'
import { StatusRow } from './StatusRow'

interface AiProviderCardProps {
  summary: AiSettingsSummary
  canEdit: boolean
}

/**
 * Provedor ativo e modelo dele. O formulário nasce com o que está em vigor e
 * renasce (pela `key`) quando a gravação devolve a configuração nova.
 */
export function AiProviderCard({ summary, canEdit }: AiProviderCardProps) {
  const formKey = `${summary.activeProvider}:${summary.models.anthropic}:${summary.models.google}`
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Bot className="h-4 w-4 text-muted-foreground" />
          Provedor e modelo
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Vale para todos do escritório em até 30 segundos. Antes de trocar, o AdvTool confere se a
          chave do provedor tem acesso ao modelo escolhido.
        </p>
      </CardHeader>
      <CardContent>
        <ProviderForm key={formKey} summary={summary} canEdit={canEdit} />
      </CardContent>
    </Card>
  )
}

function ProviderForm({ summary, canEdit }: AiProviderCardProps) {
  const save = useSaveAiProvider()
  const [provider, setProvider] = useState<AssistantProvider>(
    summary.activeProvider ?? 'anthropic',
  )
  const [models, setModels] = useState(summary.models)
  const [confirming, setConfirming] = useState(false)

  const model = models[provider]
  const changed = provider !== summary.activeProvider || model !== summary.models[provider]
  const option = AI_MODEL_OPTIONS[provider].find((candidate) => candidate.id === model)
  const hasKey = (target: AssistantProvider) =>
    summary.keys.some((key) => key.provider === target && key.source !== null)
  const failure = save.data && !save.data.ok ? save.data.message : null

  function submit() {
    save.mutate({ provider, model })
    setConfirming(false)
  }

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Provedor" className="grid gap-2 sm:grid-cols-2">
        {AI_PROVIDERS.map((candidate) => {
          const selected = candidate === provider
          return (
            <button
              key={candidate}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!canEdit || save.isPending}
              onClick={() => {
                setProvider(candidate)
                save.reset()
              }}
              className={cn(
                'flex items-start justify-between gap-2 rounded-lg border-2 p-3 text-left',
                'transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                'disabled:cursor-not-allowed',
                selected ? 'border-primary bg-accent/30' : 'border-border hover:bg-muted/30',
              )}
            >
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{AI_PROVIDER_LABELS[candidate]}</span>
                <span className="block text-xs text-muted-foreground">
                  {candidate === summary.activeProvider ? 'Em uso agora' : 'Disponível'}
                  {' · '}
                  {hasKey(candidate) ? 'com chave' : 'sem chave'}
                </span>
              </span>
              {selected && (
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                    'bg-primary',
                  )}
                >
                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                </span>
              )}
            </button>
          )
        })}
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ai-model" className="block text-xs text-muted-foreground">
          Modelo
        </label>
        <Select
          value={model}
          onValueChange={(value) => {
            setModels((current) => ({ ...current, [provider]: value }))
            save.reset()
          }}
          disabled={!canEdit || save.isPending}
        >
          <SelectTrigger id="ai-model" className="w-full sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AI_MODEL_OPTIONS[provider].map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {option && <p className="text-xs text-muted-foreground">{option.description}</p>}
      </div>

      {provider === 'google' && <GeminiNotes claudeKey={hasKey('anthropic')} />}

      {failure && (
        <StatusRow ok={false} title="Não foi possível trocar">
          {failure}
        </StatusRow>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-xs text-muted-foreground">
          {summary.providerSource === 'panel'
            ? 'Definido neste painel.'
            : 'Hoje vem do ambiente do servidor (AI_ASSISTANT_PROVIDER).'}
        </p>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            disabled={!changed || save.isPending}
            onClick={() => (provider !== summary.activeProvider ? setConfirming(true) : submit())}
          >
            {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {save.isPending ? 'Testando…' : 'Salvar'}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Trocar o Assistente para ${AI_PROVIDER_LABELS[provider]}?`}
        description={
          'O chat, o portal do cliente, a leitura de documentos e a redação passam a usar ' +
          `${option?.label ?? model}. A troca vale para todos em até 30 segundos.`
        }
        confirmLabel="Trocar"
        loadingLabel="Testando…"
        isLoading={save.isPending}
        onConfirm={submit}
      />
    </div>
  )
}

function GeminiNotes({ claudeKey }: { claudeKey: boolean }) {
  return (
    <div className="space-y-3 rounded-lg bg-muted/40 p-3">
      <StatusRow
        ok={claudeKey}
        title={
          claudeKey
            ? 'Triagem e resumo automático continuam no Claude'
            : 'Triagem e resumo automático ficam pausados'
        }
      >
        {claudeKey
          ? 'Essas tarefas usam o lote do Claude, que o Gemini não tem. ' +
            'A chave do Claude segue em uso para elas.'
          : 'Elas só rodam no lote do Claude. Cadastre uma chave do Claude para mantê-las.'}
      </StatusRow>
      <StatusRow ok={false} title="Atenção ao plano gratuito do Google">
        No plano gratuito, o Google usa o conteúdo enviado para melhorar os produtos dele. Com dados
        de clientes, use uma chave de projeto com faturamento ativo.
      </StatusRow>
    </div>
  )
}
