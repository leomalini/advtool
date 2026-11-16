'use client'

import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useAiSettingsLog } from '../hooks/useAiSettings'
import { describeLogEntry } from '../utils/aiSettingsText'
import { StatusRow } from './StatusRow'

/** As últimas 50 alterações e testes do painel de IA. */
export function AiHistoryCard() {
  const log = useAiSettingsLog()

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <History className="h-4 w-4 text-muted-foreground" />
          Histórico
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Quem mudou o provedor, as chaves, o teto ou as funções, e os testes de conexão.
        </p>
      </CardHeader>
      <CardContent>
        {log.isLoading && <Skeleton className="h-24 w-full" />}
        {log.error && (
          <StatusRow ok={false} title="Histórico indisponível">
            {log.error instanceof Error ? log.error.message : 'Tente recarregar.'}
          </StatusRow>
        )}
        {log.data && log.data.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma alteração feita pelo painel ainda.
          </p>
        )}
        {log.data && log.data.length > 0 && (
          <ol className="max-h-80 divide-y overflow-y-auto rounded-lg border">
            {log.data.map((entry) => (
              <li key={entry.id} className="space-y-0.5 px-3 py-2">
                <p className="text-sm">{describeLogEntry(entry)}</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(entry.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  {' · '}
                  {entry.changedByName ?? 'Pessoa removida'}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
