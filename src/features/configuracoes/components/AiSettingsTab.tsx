'use client'

import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/usePermissions'
import { useAiSettings } from '../hooks/useAiSettings'
import { AiKeysCard } from './AiKeysCard'
import { AiProviderCard } from './AiProviderCard'
import { StatusRow } from './StatusRow'

/**
 * Aba "Assistente IA": qual IA atende o escritório, com qual modelo, e as
 * chaves de cada provedor (docs/ia-configuracoes.md, fase 2). Quem vê
 * Configurações vê a situação; só quem administra muda.
 */
export function AiSettingsTab() {
  const { data: summary, isLoading, error } = useAiSettings()
  const { can } = usePermissions()

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
          <AiProviderCard
            summary={summary}
            canEdit={summary.editable && can('configuracoes', 'manage')}
          />
          <AiKeysCard
            summary={summary}
            canEdit={summary.editable && can('configuracoes', 'manage')}
          />
        </>
      )}
    </div>
  )
}
