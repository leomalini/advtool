'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { KeyRound, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { AI_PROVIDER_LABELS } from '@/features/ia/config/models'
import type { AiProviderKeySummary, AiSettingsSummary } from '@/types/aiSettings.types'
import { useRemoveAiKey, useTestAiKey } from '../hooks/useAiSettings'
import { AiKeyDialog } from './AiKeyDialog'
import { StatusRow } from './StatusRow'

const SOURCE_LABEL: Record<NonNullable<AiProviderKeySummary['source']>, string> = {
  panel: 'Painel',
  env: 'Ambiente (.env)',
}

/** Uma linha por provedor: de onde vem a chave, o último teste e as ações. */
export function AiKeysCard({ summary, canEdit }: { summary: AiSettingsSummary; canEdit: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          Chaves de API
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Ficam cifradas no banco e nunca voltam a aparecer inteiras. Sem chave no painel, vale a do
          ambiente do servidor.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y rounded-lg border">
          {summary.keys.map((key) => (
            <KeyRow
              key={key.provider}
              entry={key}
              active={summary.activeProvider === key.provider}
              canEdit={canEdit}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          O teste consulta o modelo escolhido na API do provedor e não gasta créditos — por isso não
          percebe saldo zerado, que só aparece na primeira pergunta ao Assistente.
        </p>
      </CardContent>
    </Card>
  )
}

function KeyRow({
  entry,
  active,
  canEdit,
}: {
  entry: AiProviderKeySummary
  active: boolean
  canEdit: boolean
}) {
  const test = useTestAiKey()
  const remove = useRemoveAiKey()
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState(false)
  const label = AI_PROVIDER_LABELS[entry.provider]
  const removeFailure = remove.data && !remove.data.ok ? remove.data.message : null

  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{label}</p>
            {active && <Badge variant="secondary">Em uso</Badge>}
            <Badge variant="outline">
              {entry.source ? SOURCE_LABEL[entry.source] : 'Sem chave'}
            </Badge>
          </div>
          {entry.hint && (
            <p className="font-mono text-xs text-muted-foreground">
              ••••{entry.hint}
              {entry.workspaceId && <span className="ml-2">workspace {entry.workspaceId}</span>}
            </p>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-1.5">
            {entry.source && (
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={test.isPending}
                onClick={() => test.mutate(entry.provider)}
              >
                {test.isPending && <Loader2 className="animate-spin" aria-hidden />}
                Testar
              </Button>
            )}
            <Button type="button" size="xs" variant="outline" onClick={() => setEditing(true)}>
              {entry.source === 'panel' ? 'Trocar chave' : 'Cadastrar chave'}
            </Button>
            {entry.source === 'panel' && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => {
                  remove.reset()
                  setRemoving(true)
                }}
              >
                Remover
              </Button>
            )}
          </div>
        )}
      </div>

      {entry.unreadable && (
        <StatusRow ok={false} title="A chave guardada no painel não abre">
          O segredo do servidor mudou depois que ela foi salva. Cadastre a chave de novo
          {entry.source === 'env' ? '; enquanto isso, vale a do ambiente.' : '.'}
        </StatusRow>
      )}

      <TestStatus entry={entry} result={test.data?.result ?? null} />

      {removeFailure && (
        <StatusRow ok={false} title="A chave não foi removida">
          {removeFailure}
        </StatusRow>
      )}

      <AiKeyDialog
        open={editing}
        onOpenChange={setEditing}
        provider={entry.provider}
        currentWorkspaceId={entry.source === 'panel' ? entry.workspaceId : null}
      />

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remover a chave de ${label} do painel?`}
        description={
          active
            ? 'O provedor em uso passa a usar a chave do ambiente do servidor.'
            : 'O provedor fica sem a chave do painel; vale a do ambiente, se houver.'
        }
        confirmLabel="Remover"
        loadingLabel="Removendo…"
        isLoading={remove.isPending}
        onConfirm={() =>
          remove.mutate(entry.provider, { onSettled: () => setRemoving(false) })
        }
      />
    </div>
  )
}

function formatWhen(iso: string): string {
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

/** O teste que acabou de rodar vale mais que o guardado. */
function TestStatus({
  entry,
  result,
}: {
  entry: AiProviderKeySummary
  result: { ok: true } | { ok: false; message: string } | null
}) {
  if (result) {
    return result.ok ? (
      <StatusRow ok title="Conexão funcionando">
        A chave tem acesso ao modelo escolhido.
      </StatusRow>
    ) : (
      <StatusRow ok={false} title="O teste falhou">
        {result.message}
      </StatusRow>
    )
  }
  if (!entry.lastTest) return null
  return entry.lastTest.ok ? (
    <p className="text-xs text-muted-foreground">
      Último teste ok em {formatWhen(entry.lastTest.at)}.
    </p>
  ) : (
    <StatusRow ok={false} title={`Último teste falhou (${formatWhen(entry.lastTest.at)})`}>
      {entry.lastTest.error}
    </StatusRow>
  )
}
