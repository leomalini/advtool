'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FolderLock, Loader2, RefreshCw, Save, Signature } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/usePermissions'
import { suggestSafeMap, type SuggestedSafeMap } from '@/lib/d4sign/safeRoutes'
import { cn } from '@/lib/utils'
import {
  D4SIGN_FEATURES,
  D4SIGN_FEATURE_LABELS,
  D4SIGN_SAFE_ROUTES,
  D4SIGN_SAFE_ROUTE_LABELS,
  type D4SignFeatures,
  type D4SignSafeMap,
  type D4SignSafeRoute,
  type D4SignSetupStatus,
} from '@/types/d4sign.types'
import type { OfficeSettings } from '@/types/officeSettings.types'
import {
  useListD4SignSafes,
  useOfficeSettings,
  useRefreshD4SignBalance,
  useSaveD4SignFeatures,
  useSaveD4SignSafes,
} from '../hooks/useOfficeSettings'
import { StatusRow } from './StatusRow'

interface D4SignSettingsCardProps {
  /** Montado no servidor: as variáveis da D4Sign não chegam ao navegador. */
  setup: D4SignSetupStatus
}

/** O Select do Radix não aceita item de valor vazio. */
const USE_DEFAULT = '__padrao__'

function formatDateTime(iso: string): string {
  return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="break-all rounded bg-muted px-1 py-0.5">{children}</code>
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  )
}

/**
 * A conta D4Sign que recebe os envios para assinatura: as chaves do servidor,
 * os avisos (webhook), o cofre de cada tipo de envio, o saldo de envios e os
 * recursos do plano.
 *
 * Só quem administra Configurações mexe. Listar cofres e ler o saldo gastam
 * chamadas das 10 por hora da API, por isso nada é consultado ao abrir a aba.
 */
export function D4SignSettingsCard({ setup }: D4SignSettingsCardProps) {
  const { data: settings = null, isLoading } = useOfficeSettings()
  const { can } = usePermissions()
  const canEdit = can('configuracoes', 'manage')
  const configured = setup.problems.length === 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Signature className="h-4 w-4 text-muted-foreground" />
          D4Sign
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Assinatura eletrônica de contratos e documentos. O PDF assinado volta para o app; a via
          com validade jurídica fica no cofre da D4Sign do tipo do documento, numa pasta por
          cliente.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <ConnectionStatus setup={setup} />
          {configured && <WebhookStatus setup={setup} />}
        </div>

        {configured &&
          (isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            // Montados só depois de carregar: os rascunhos nascem com o valor
            // do banco, sem reset em efeito.
            <>
              <SafesSection current={settings?.d4sign_safes ?? {}} canEdit={canEdit} />
              <BalanceSection settings={settings} canEdit={canEdit} />
              <FeaturesSection current={settings?.d4sign_features ?? {}} canEdit={canEdit} />
            </>
          ))}
      </CardContent>
    </Card>
  )
}

function ConnectionStatus({ setup }: { setup: D4SignSetupStatus }) {
  if (setup.problems.length > 0) {
    return (
      <StatusRow ok={false} title="D4Sign não configurada">
        <ul className="list-disc space-y-0.5 pl-4">
          {setup.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
        <p className="mt-1">
          As chaves ficam em Dev API, no painel da D4Sign, e vão para as variáveis de ambiente do
          servidor. O <Code>.env.example</Code> explica cada uma.
        </p>
      </StatusRow>
    )
  }

  const sandbox = setup.environment === 'sandbox'
  return (
    <StatusRow ok title={sandbox ? 'Chaves do sandbox configuradas' : 'Chaves de produção configuradas'}>
      {sandbox
        ? 'Ambiente de testes: o que for assinado aqui não tem validade jurídica.'
        : 'Envios com validade jurídica, descontados da cota do plano.'}{' '}
      “Testar conexão”, abaixo, confere se a D4Sign aceita as chaves.
      {!setup.hasCryptKey && (
        <>
          {' '}
          Sem <Code>D4SIGN_CRYPT_KEY</Code>: só funciona se a conta não a exigir.
        </>
      )}
    </StatusRow>
  )
}

/** O webhook é registrado em cada documento, no envio: aqui só se confere se
 * há endereço e segredo para isso. */
function WebhookStatus({ setup }: { setup: D4SignSetupStatus }) {
  if (!setup.hasWebhookSecret) {
    return (
      <StatusRow ok={false} title="Os avisos seriam recusados">
        Falta <Code>D4SIGN_WEBHOOK_SECRET</Code>, a “Secret Key MAC” gerada em Dev API. Sem ela
        não há como conferir que o aviso veio da D4Sign.
      </StatusRow>
    )
  }

  if (!setup.webhookEndpoint) {
    return (
      <StatusRow ok={false} title="Sem endereço para os avisos">
        Nem <Code>APP_PUBLIC_URL</Code> nem <Code>D4SIGN_WEBHOOK_URL</Code> apontam para um
        endereço HTTPS público. Sem avisos, o status dos envios só se atualiza à mão.
      </StatusRow>
    )
  }

  return (
    <StatusRow ok title="Avisos prontos">
      Cada envio registra <Code>{setup.webhookEndpoint}</Code> no próprio documento, e cada aviso
      tem o HMAC conferido.
    </StatusRow>
  )
}

function SafesSection({ current, canEdit }: { current: D4SignSafeMap; canEdit: boolean }) {
  const listSafes = useListD4SignSafes()
  const save = useSaveD4SignSafes()
  const [draft, setDraft] = useState<SuggestedSafeMap | null>(null)
  const safes = listSafes.data ?? null
  const editing = draft !== null && safes !== null

  function startEditing() {
    listSafes.mutate(undefined, {
      onSuccess: (loaded) => setDraft(suggestSafeMap(loaded, current)),
    })
  }

  function close() {
    setDraft(null)
    listSafes.reset()
  }

  function choose(route: D4SignSafeRoute, uuid: string) {
    if (!draft || !safes) return
    const map = { ...draft.map }
    const safe = safes.find((item) => item.uuid === uuid)
    if (safe) map[route] = safe
    else delete map[route]
    setDraft({ map, suggested: draft.suggested.filter((item) => item !== route) })
  }

  const missingDefault = editing ? !draft.map.padrao : !current.padrao

  return (
    <section className="space-y-2 border-t pt-4">
      <SectionTitle>Cofres por tipo</SectionTitle>
      <p className="text-xs text-muted-foreground">
        Cada envio vai para o cofre do seu tipo, numa pasta do cliente. Quem envia pode trocar — um
        aditivo vai para “Aditivos”, por exemplo.
      </p>

      <ul className="divide-y rounded-lg border">
        {D4SIGN_SAFE_ROUTES.map((route) => (
          <li
            key={route}
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
          >
            <span className="text-sm">
              {D4SIGN_SAFE_ROUTE_LABELS[route]}
              {editing && draft.suggested.includes(route) && (
                <span className="ml-2 rounded-full bg-info/12 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-info">
                  Sugerido
                </span>
              )}
            </span>
            {editing ? (
              <Select
                value={draft.map[route]?.uuid ?? (route === 'padrao' ? '' : USE_DEFAULT)}
                onValueChange={(value) => choose(route, value)}
                disabled={save.isPending}
              >
                <SelectTrigger size="sm" className="w-full sm:w-64">
                  <SelectValue placeholder="Escolha o cofre" />
                </SelectTrigger>
                <SelectContent>
                  {route !== 'padrao' && <SelectItem value={USE_DEFAULT}>Usar o padrão</SelectItem>}
                  {safes.map((safe) => (
                    <SelectItem key={safe.uuid} value={safe.uuid}>
                      {safe.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className={cn('text-sm', current[route] ? 'font-medium' : 'text-muted-foreground')}>
                {current[route]?.name ?? (route === 'padrao' ? 'Nenhum' : 'Usa o padrão')}
              </span>
            )}
          </li>
        ))}
      </ul>

      {missingDefault && (
        <p className="text-xs text-warning">
          Sem o cofre padrão, um envio sem cofre próprio não tem para onde ir.
        </p>
      )}

      {canEdit &&
        (editing ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={save.isPending || !draft.map.padrao}
              onClick={() => save.mutate(draft.map, { onSuccess: close })}
            >
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Salvar cofres
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={save.isPending} onClick={close}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={listSafes.isPending}
              onClick={startEditing}
            >
              {listSafes.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderLock className="h-3.5 w-3.5" />
              )}
              {Object.keys(current).length > 0 ? 'Editar cofres' : 'Carregar cofres'}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Carrega os cofres da conta (1 das 10 consultas por hora) e sugere um para cada tipo,
              pelo nome. Nada muda até salvar.
            </p>
          </div>
        ))}
    </section>
  )
}

function BalanceSection({
  settings,
  canEdit,
}: {
  settings: OfficeSettings | null
  canEdit: boolean
}) {
  const refresh = useRefreshD4SignBalance()
  const credit = settings?.d4sign_balance_credit ?? null
  const sent = settings?.d4sign_balance_sent ?? null
  const checkedAt = settings?.d4sign_balance_checked_at ?? null

  return (
    <section className="space-y-2 border-t pt-4">
      <SectionTitle>Envios do plano</SectionTitle>
      {credit !== null && sent !== null && checkedAt ? (
        <p className="text-sm">
          <span className="font-semibold tabular-nums">{Math.max(credit - sent, 0)}</span> de{' '}
          <span className="tabular-nums">{credit}</span> disponíveis
          <span className="text-xs text-muted-foreground">
            {' '}
            · {sent} usados, lido em {formatDateTime(checkedAt)}
          </span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Saldo ainda não consultado.</p>
      )}

      {canEdit && (
        <div className="space-y-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            {refresh.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Testar conexão e ler o saldo
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Gasta 1 das 10 consultas por hora. Contratos, documentos e o painel da D4Sign dividem a
            mesma cota de envios.
          </p>
        </div>
      )}
    </section>
  )
}

function FeaturesSection({ current, canEdit }: { current: D4SignFeatures; canEdit: boolean }) {
  const save = useSaveD4SignFeatures()
  const [features, setFeatures] = useState<D4SignFeatures>(current)
  const changed = D4SIGN_FEATURES.some((key) => Boolean(features[key]) !== Boolean(current[key]))

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="space-y-0.5">
        <SectionTitle>Recursos do plano</SectionTitle>
        <p className="text-xs text-muted-foreground">
          A API não informa o plano: ligue só o que a conta inclui. O que estiver desligado não
          aparece no envio.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2">
        {D4SIGN_FEATURES.map((key) => {
          const id = `d4sign-feature-${key}`
          return (
            <li key={key} className="flex items-start gap-2.5">
              <Checkbox
                id={id}
                className="mt-0.5"
                checked={Boolean(features[key])}
                disabled={!canEdit || save.isPending}
                onCheckedChange={(checked) =>
                  setFeatures((previous) => ({ ...previous, [key]: checked === true }))
                }
              />
              <label htmlFor={id} className="space-y-0.5">
                <span className="block text-sm font-medium">{D4SIGN_FEATURE_LABELS[key].label}</span>
                <span className="block text-xs text-muted-foreground">
                  {D4SIGN_FEATURE_LABELS[key].description}
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      {canEdit && (
        <Button
          type="button"
          size="sm"
          disabled={!changed || save.isPending}
          onClick={() => save.mutate(features)}
        >
          {save.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Salvar recursos
        </Button>
      )}
    </section>
  )
}
