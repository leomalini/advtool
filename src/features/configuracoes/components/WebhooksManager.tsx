'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Webhook,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/hooks/usePermissions'
import { ProcessoCombobox } from '@/features/processos/components/ProcessoCombobox'
import { useLegalProcesses } from '@/features/processos/hooks/useLegalProcesses'
import {
  useWebhookEndpointStatus,
  useWebhookEvents,
  useRealtimeWebhookEvents,
  useSendTestWebhook,
  useClearTestWebhookEvents,
  type SendTestWebhookResult,
} from '../hooks/useWebhookEvents'
import { WebhookHealthPanel } from './WebhookHealthPanel'
import { WebhookCredentialCheck } from './WebhookCredentialCheck'
import {
  WEBHOOK_SCENARIOS,
  buildWebhookPayload,
  type WebhookScenario,
} from '@/lib/buscaprocessos/webhookFixtures'
import type { WebhookEvent, WebhookEventStatus } from '@/types/webhookEvent.types'

/**
 * Webhooks: o que chegou, para onde foi, e um jeito de provocar a chegada.
 *
 * A tela existe porque o endpoint é mudo por desenho — ele responde 200 para
 * quase tudo, de propósito, para a BuscaProcessos não reentregar o que nunca
 * vai dar certo. Isso deixava três perguntas sem resposta: chegou? a assinatura
 * conferiu? para onde foi o dado? As três estão aqui.
 *
 * O disparo simula por padrão. Gravar é opt-in porque um teste que grava
 * publicação de mentira suja a mesma fila em que alguém trabalha.
 */

const STATUS_LABEL: Record<WebhookEventStatus, string> = {
  received: 'Recebido',
  processed: 'Gravado',
  duplicate: 'Duplicata',
  ignored: 'Ignorado',
  unmatched: 'Sem processo',
  invalid: 'Recusado',
  error: 'Erro',
}

const STATUS_CLASS: Record<WebhookEventStatus, string> = {
  received: 'bg-muted text-muted-foreground',
  processed: 'bg-success/12 text-success',
  duplicate: 'bg-warning/12 text-warning',
  ignored: 'bg-muted text-muted-foreground',
  unmatched: 'bg-warning/12 text-warning',
  invalid: 'bg-destructive/10 text-destructive',
  error: 'bg-destructive/10 text-destructive',
}

const ACTION_LABEL: Record<string, string> = {
  inserted: 'gravada',
  duplicate: 'já existia (outra fonte)',
  existing_source: 'já existia (mesma fonte)',
  invalid: 'recusada',
}

function StatusBadge({ status }: { status: WebhookEventStatus }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        STATUS_CLASS[status] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

function formatDateTime(iso: string): string {
  try {
    return format(parseISO(iso), "dd/MM/yy HH:mm:ss", { locale: ptBR })
  } catch {
    return '—'
  }
}

// ── Painel 1: situação do endpoint ────────────────────────────────────────────

function EndpointPanel() {
  const { data, isLoading, isError, error } = useWebhookEndpointStatus(true)

  if (isLoading) return <div className="h-24 animate-pulse rounded-lg bg-muted/40" />

  if (isError) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <p className="text-sm text-destructive">
          {(error as Error)?.message ?? 'Não foi possível ler a situação do endpoint.'}
        </p>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Endereço que recebe os eventos
      </p>

      {data.registeredUrl ? (
        <p className="mt-1 break-all font-mono text-xs">{data.registeredUrl}</p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">
          <code className="rounded bg-muted px-1 py-0.5 text-xs">APP_PUBLIC_URL</code> não está
          definida com um endereço público em HTTPS. O recebimento continua funcionando se algo
          chamar a rota, mas a BuscaProcessos não tem para onde entregar — use &ldquo;Buscar
          publicações&rdquo; enquanto isso.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs">
        <span
          className={cn(
            'inline-flex items-center gap-1.5',
            data.secretConfigured ? 'text-success' : 'text-warning',
          )}
        >
          {data.secretConfigured ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5" />
          )}
          {/* "Configurada", não "funcionando": a variável pode existir com o valor
              errado. Quem diz se funciona é a última entrega, logo abaixo. */}
          {data.secretConfigured
            ? 'Chave HMAC configurada'
            : 'Sem BUSCA_PROCESSOS_WEBHOOK_SECRET: qualquer corpo é aceito'}
        </span>

        <span
          className={cn(
            'inline-flex items-center gap-1.5',
            data.tokenConfigured ? 'text-success' : 'text-muted-foreground',
          )}
        >
          {data.tokenConfigured ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5" />
          )}
          {data.tokenConfigured ? 'Token Bearer configurado' : 'Sem BUSCA_PROCESSOS_WEBHOOK_TOKEN'}
        </span>

        <span
          className={cn(
            'inline-flex items-center gap-1.5',
            data.serviceRoleConfigured ? 'text-success' : 'text-destructive',
          )}
        >
          {data.serviceRoleConfigured ? (
            <ShieldCheck className="h-3.5 w-3.5" />
          ) : (
            <ShieldOff className="h-3.5 w-3.5" />
          )}
          {data.serviceRoleConfigured
            ? 'Chave de serviço presente'
            : 'Sem SUPABASE_SERVICE_ROLE_KEY: nada é gravado'}
        </span>
      </div>

      {data.health && <WebhookHealthPanel health={data.health} />}
      <WebhookCredentialCheck />
    </div>
  )
}

// ── Painel 2: disparo ─────────────────────────────────────────────────────────

function ResultPanel({ result }: { result: SendTestWebhookResult }) {
  const destinations = result.destinations ?? []

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {result.status && <StatusBadge status={result.status as WebhookEventStatus} />}
        {result.dryRun && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Simulação — nada foi gravado
          </span>
        )}
        {result.httpStatus != null && (
          <span className="text-xs text-muted-foreground">
            HTTP {result.httpStatus}
            {result.signed ? ' · assinado' : ' · sem assinatura'}
          </span>
        )}
        {result.durationMs != null && (
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {result.durationMs} ms
          </span>
        )}
      </div>

      {result.reason && <p className="mt-2 text-xs text-muted-foreground">{result.reason}</p>}

      {destinations.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Para onde a informação {result.dryRun ? 'iria' : 'foi'}
          </p>
          {destinations.map((destination, index) => (
            <div
              key={`${destination.table}-${destination.id ?? index}`}
              className="flex flex-wrap items-center gap-2 text-xs"
            >
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{destination.table}</code>
              <span className="text-muted-foreground">
                {ACTION_LABEL[destination.action] ?? destination.action}
              </span>
              {destination.id && (
                <code className="font-mono text-[10.5px] text-muted-foreground">
                  {destination.id}
                </code>
              )}
              {destination.link && destination.id && (
                <Link
                  href={destination.link}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  abrir
                </Link>
              )}
              {destination.detail && (
                <span className="text-muted-foreground/80">· {destination.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {result.response != null && (
        <pre className="mt-3 max-h-40 overflow-auto rounded bg-muted/60 p-2 text-[10.5px] leading-relaxed">
          {JSON.stringify(result.response, null, 2)}
        </pre>
      )}
    </div>
  )
}

function SendPanel() {
  const [scenario, setScenario] = useState<WebhookScenario>('diario_movimentacao_nova')
  const [legalProcessId, setLegalProcessId] = useState<string | null>(null)
  const [conteudo, setConteudo] = useState('')
  const [dryRun, setDryRun] = useState(true)
  const [mode, setMode] = useState<'inline' | 'http'>('inline')
  const [showBody, setShowBody] = useState(false)
  const [customBody, setCustomBody] = useState<string | null>(null)

  const { data: processos = [] } = useLegalProcesses()
  const { data: status } = useWebhookEndpointStatus(true)
  const send = useSendTestWebhook()

  const definition = WEBHOOK_SCENARIOS.find((item) => item.value === scenario)
  const cnj = processos.find((processo) => processo.id === legalProcessId)?.cnj_number ?? null

  // Prévia do corpo. Regerada a cada mudança dos campos; a edição manual
  // congela `customBody` e passa a ter precedência.
  const preview = useMemo(
    () =>
      JSON.stringify(
        buildWebhookPayload(scenario, { cnj, conteudo: conteudo || null }),
        null,
        2,
      ),
    [scenario, cnj, conteudo],
  )

  const needsCnj = definition?.requiresCnj ?? false
  const missingCnj = needsCnj && !cnj
  const httpUnavailable = mode === 'http' && !status?.canSendHttp

  function fire() {
    let payload: Record<string, unknown> | undefined

    if (customBody !== null) {
      try {
        payload = JSON.parse(customBody) as Record<string, unknown>
      } catch {
        window.alert('O corpo editado não é JSON válido.')
        return
      }
    }

    send.mutate({
      scenario,
      payload,
      cnj: cnj ?? undefined,
      conteudo: conteudo || undefined,
      dryRun: mode === 'http' ? false : dryRun,
      mode,
    })
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Disparar um evento de teste
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Cenário</Label>
          <Select
            value={scenario}
            onValueChange={(value) => {
              setScenario(value as WebhookScenario)
              setCustomBody(null)
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEBHOOK_SCENARIOS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">
            Processo {needsCnj ? '(obrigatório neste cenário)' : '(ignorado neste cenário)'}
          </Label>
          <ProcessoCombobox
            value={legalProcessId}
            onChange={(id) => {
              setLegalProcessId(id)
              setCustomBody(null)
            }}
          />
        </div>
      </div>

      {definition && (
        <p className="mt-2 text-xs text-muted-foreground">{definition.description}</p>
      )}

      <div className="mt-3 space-y-1.5">
        <Label className="text-xs">
          Texto da publicação/movimentação (opcional — repetir o mesmo texto é o que prova a
          deduplicação)
        </Label>
        <Textarea
          value={conteudo}
          onChange={(event) => {
            setConteudo(event.target.value)
            setCustomBody(null)
          }}
          rows={2}
          placeholder="Deixe vazio para usar o texto padrão do cenário."
          className="text-xs"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={mode === 'inline' ? dryRun : false}
            disabled={mode === 'http'}
            onCheckedChange={(checked) => setDryRun(checked === true)}
          />
          <span className={cn(mode === 'http' && 'text-muted-foreground')}>
            Simular (não grava nada)
          </span>
        </label>

        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Modo</Label>
          <Select value={mode} onValueChange={(value) => setMode(value as 'inline' | 'http')}>
            <SelectTrigger className="h-8 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inline">Direto (aceita simulação)</SelectItem>
              <SelectItem value="http">HTTP assinado (grava)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          size="sm"
          className="ml-auto"
          onClick={fire}
          disabled={send.isPending || missingCnj || httpUnavailable}
        >
          {send.isPending ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          Disparar
        </Button>
      </div>

      {missingCnj && (
        <p className="mt-2 text-xs text-warning">
          Este cenário precisa de um processo cadastrado para casar pelo CNJ.
        </p>
      )}
      {httpUnavailable && (
        <p className="mt-2 text-xs text-warning">
          O modo HTTP precisa de <code className="rounded bg-muted px-1">APP_PUBLIC_URL</code>. Use
          o modo direto enquanto isso — ele executa o mesmo tratamento, só não passa pela
          conferência de assinatura.
        </p>
      )}
      {mode === 'http' && status?.canSendHttp && (
        <p className="mt-2 text-xs text-muted-foreground">
          Dispara contra <code className="rounded bg-muted px-1">{status.localUrl}</code> com a
          assinatura HMAC — é o caminho que testa a conferência de ponta a ponta. Grava de verdade.
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowBody((open) => !open)}
        className="mt-3 flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {showBody ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {showBody ? 'Ocultar corpo' : 'Ver e editar o corpo enviado'}
      </button>

      {showBody && (
        <Textarea
          value={customBody ?? preview}
          onChange={(event) => setCustomBody(event.target.value)}
          rows={12}
          spellCheck={false}
          className="mt-2 font-mono text-[10.5px]"
        />
      )}

      {send.data && <ResultPanel result={send.data} />}
    </div>
  )
}

// ── Painel 3: recebimentos ────────────────────────────────────────────────────

function EventRow({ event }: { event: WebhookEvent }) {
  const [open, setOpen] = useState(false)
  const destinations = event.destinations ?? []

  return (
    <div className="px-4 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}

        <span className="w-[130px] shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {formatDateTime(event.received_at)}
        </span>

        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {event.event ?? 'sem evento'}
        </span>

        {event.is_test && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {event.dry_run ? 'Simulação' : 'Teste'}
          </span>
        )}

        {event.replay_of && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <RotateCcw className="h-2.5 w-2.5" />
            Reprocessamento
          </span>
        )}

        {event.status === 'invalid' && event.replayed_at && (
          <span className="rounded-full bg-success/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">
            Recuperada
          </span>
        )}

        {event.signature_valid === false && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive">
            <ShieldOff className="h-3 w-3" />
            Assinatura
          </span>
        )}

        <StatusBadge status={event.status} />
      </button>

      {open && (
        <div className="mt-2 space-y-2 pl-7">
          {(event.reason || event.error) && (
            <p className={cn('text-xs', event.error ? 'text-destructive' : 'text-muted-foreground')}>
              {event.error ?? event.reason}
            </p>
          )}

          {destinations.length > 0 && (
            <div className="space-y-1">
              {destinations.map((destination, index) => (
                <div
                  key={`${destination.table}-${destination.id ?? index}`}
                  className="flex flex-wrap items-center gap-2 text-xs"
                >
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                    {destination.table}
                  </code>
                  <span className="text-muted-foreground">
                    {ACTION_LABEL[destination.action] ?? destination.action}
                  </span>
                  {destination.link && destination.id && (
                    <Link
                      href={destination.link}
                      className="text-primary underline-offset-2 hover:underline"
                    >
                      abrir
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

          {event.payload && (
            <pre className="max-h-56 overflow-auto rounded bg-muted/50 p-2 text-[10.5px] leading-relaxed">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function EventsPanel({ isAdmin }: { isAdmin: boolean }) {
  const [onlyTests, setOnlyTests] = useState<boolean | undefined>(undefined)
  const { data: events = [], isLoading } = useWebhookEvents({ isTest: onlyTests, limit: 50 })
  const clearTests = useClearTestWebhookEvents()

  useRealtimeWebhookEvents()

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Recebimentos
        </p>

        <div className="ml-auto flex items-center gap-1">
          {(
            [
              { label: 'Tudo', value: undefined },
              { label: 'Reais', value: false },
              { label: 'Testes', value: true },
            ] as const
          ).map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => setOnlyTests(option.value)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                onlyTests === option.value
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/60',
              )}
            >
              {option.label}
            </button>
          ))}

          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
              onClick={() => clearTests.mutate()}
              disabled={clearTests.isPending}
            >
              <Trash2 className="h-3 w-3" />
              Limpar testes
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-8 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma entrega registrada ainda.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {events.map((event) => (
            <EventRow key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

export function WebhooksManager() {
  const { can } = usePermissions()
  const isAdmin = can('usuarios', 'manage')

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5">
        <Webhook className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Tudo que a BuscaProcessos entrega neste sistema passa por um endereço só, e cada entrega
          vira uma linha aqui — com o corpo recebido e o destino de cada informação. Publicação que
          já tiver chegado por outra fonte aparece como duplicata em vez de entrar de novo na fila.
        </p>
      </div>

      {isAdmin ? (
        <>
          <EndpointPanel />
          <SendPanel />
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-xs text-muted-foreground">
          Disparar eventos de teste é restrito ao administrador. O histórico abaixo continua
          visível.
        </p>
      )}

      <EventsPanel isAdmin={isAdmin} />
    </div>
  )
}
