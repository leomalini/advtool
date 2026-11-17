'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/usePermissions'
import { useAiSettings } from '../hooks/useAiSettings'
import { AiBudgetCard } from './AiBudgetCard'
import { AiFeaturesCard } from './AiFeaturesCard'
import { AiHistoryCard } from './AiHistoryCard'
import { AiKeysCard } from './AiKeysCard'
import { AiProviderCard } from './AiProviderCard'
import { StatusRow } from './StatusRow'

/**
 * Aba "Assistente IA": qual IA atende o escritório, com qual modelo, as
 * chaves, o gasto e o teto, as funções ligadas e o histórico
 * (docs/ia-configuracoes.md, fases 2 e 3). Quem vê Configurações vê a
 * situação; só quem administra muda.
 */
export function AiSettingsTab() {
  const { data: summary, isLoading, error } = useAiSettings()
  const { can } = usePermissions()
  const canEdit = Boolean(summary?.editable) && can('configuracoes', 'manage')

  return (
    <div className="max-w-2xl space-y-5">
      <div>
        <h2 className="text-base font-semibold">Assistente IA</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          O provedor e o modelo que atendem o Assistente, o portal do cliente e as tarefas em
          segundo plano, e as chaves de cada um.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      )}

      {error && (
        <StatusRow ok={false} title="Não foi possível ler as configurações da IA">
          {error instanceof Error ? error.message : 'Tente recarregar a página.'}
        </StatusRow>
      )}

      {summary && (
        <>
          {!summary.editable && (
            <StatusRow ok={false} title="Só leitura neste ambiente">
              O painel ainda não pode gravar (migration 94 não aplicada ou servidor sem
              service_role). O que aparece abaixo vem das variáveis de ambiente.
            </StatusRow>
          )}
          <AiProviderCard summary={summary} canEdit={canEdit} />
          <AiKeysCard summary={summary} canEdit={canEdit} />
          <AiBudgetCard summary={summary} canEdit={canEdit} />
          <AiFeaturesCard summary={summary} canEdit={canEdit} />
          {summary.editable && <AiHistoryCard />}
        </>
      )}
    </div>
  )
}
