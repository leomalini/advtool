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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { usePermissions } from '@/hooks/usePermissions'
import {
  D4SIGN_FEATURES,
  D4SIGN_FEATURE_LABELS,
  type D4SignFeatures,
  type D4SignSafe,
  type D4SignSetupStatus,
} from '@/types/d4sign.types'
import type { OfficeSettings } from '@/types/officeSettings.types'
import {
  useChooseD4SignSafe,
  useListD4SignSafes,
  useOfficeSettings,
  useRefreshD4SignBalance,
  useSaveD4SignFeatures,
} from '../hooks/useOfficeSettings'
import { StatusRow } from './StatusRow'

interface D4SignSettingsCardProps {
  /** Montado no servidor: as variáveis da D4Sign não chegam ao navegador. */
  setup: D4SignSetupStatus
}

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
 * o cofre, os avisos (webhook), o saldo de envios e os recursos do plano.
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
          com validade jurídica fica no cofre da D4Sign, numa pasta por cliente.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <ConnectionStatus setup={setup} />
          {configured && <WebhookStatus setup={setup} settings={settings} />}
        </div>

        {configured &&
          (isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <SafeSection
                settings={settings}
                canEdit={canEdit}
                webhookEndpoint={setup.webhookEndpoint}
              />
              <BalanceSection settings={settings} canEdit={canEdit} />
              {/* Montado só depois de carregar: as caixas nascem com o valor do
                  banco, sem reset em efeito. */}
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

function WebhookStatus({
  setup,
  settings,
}: {
  setup: D4SignSetupStatus
  settings: OfficeSettings | null
}) {
  const registered = settings?.d4sign_webhook_url ?? null
  const registeredAt = settings?.d4sign_webhook_registered_at ?? null

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

  if (!registered) {
    return (
      <StatusRow ok={false} title="Avisos ainda não registrados">
        Escolha o cofre abaixo: a D4Sign passa a avisar <Code>{setup.webhookEndpoint}</Code>.
      </StatusRow>
    )
  }

  if (registered !== setup.webhookEndpoint) {
    return (
      <StatusRow ok={false} title="Avisos registrados para outro endereço">
        O cofre avisa <Code>{registered}</Code>, mas este servidor recebe em{' '}
        <Code>{setup.webhookEndpoint}</Code>. Escolha o cofre de novo para trocar.
      </StatusRow>
    )
  }

  return (
    <StatusRow ok title="Avisos registrados">
      A D4Sign avisa <Code>{registered}</Code>
      {registeredAt && ` desde ${formatDateTime(registeredAt)}`}, e cada aviso tem o HMAC
      conferido.
    </StatusRow>
  )
}

function SafeSection({
  settings,
  canEdit,
  webhookEndpoint,
}: {
  settings: OfficeSettings | null
  canEdit: boolean
  webhookEndpoint: string | null
}) {
  const listSafes = useListD4SignSafes()
  const choose = useChooseD4SignSafe()
  const [selected, setSelected] = useState('')
  const [pending, setPending] = useState<D4SignSafe | null>(null)

  const currentUuid = settings?.d4sign_safe_uuid ?? null
  const currentName = settings?.d4sign_safe_name ?? null
  const safes = listSafes.data ?? null

  function close() {
    listSafes.reset()
    setSelected('')
  }

  function save(safe: D4SignSafe) {
    choose.mutate(safe, { onSuccess: close })
  }

  function handleUse() {
    const safe = safes?.find((item) => item.uuid === selected)
    if (!safe) return
    // A primeira escolha vai direto. Trocar de cofre muda para onde vão os
    // próximos envios: pede confirmação.
    if (currentUuid && currentUuid !== safe.uuid) {
      setPending(safe)
      return
    }
    save(safe)
  }

  return (
    <section className="space-y-2 border-t pt-4">
      <SectionTitle>Cofre</SectionTitle>
      <p className="text-sm">
        {currentName ? (
          <>
            Os envios caem no cofre <strong>{currentName}</strong>, numa pasta por cliente.
          </>
        ) : (
          'Nenhum cofre escolhido: sem ele, nada vai para assinatura.'
        )}
      </p>

      {canEdit &&
        (safes === null ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={listSafes.isPending}
            onClick={() => listSafes.mutate()}
          >
            {listSafes.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FolderLock className="h-3.5 w-3.5" />
            )}
            {currentName ? 'Trocar cofre' : 'Carregar cofres'}
          </Button>
        ) : safes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            A conta não tem cofre. Crie um no painel da D4Sign e carregue de novo.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={selected} onValueChange={setSelected} disabled={choose.isPending}>
                <SelectTrigger size="sm" className="min-w-56">
                  <SelectValue placeholder="Escolha o cofre" />
                </SelectTrigger>
                <SelectContent>
                  {safes.map((safe) => (
                    <SelectItem key={safe.uuid} value={safe.uuid}>
                      {safe.name}
                      {safe.uuid === currentUuid ? ' (atual)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="sm"
                disabled={!selected || choose.isPending}
                onClick={handleUse}
              >
                {choose.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Usar este cofre
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={choose.isPending}
                onClick={close}
              >
                Cancelar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {webhookEndpoint ? (
                <>
                  A D4Sign vai avisar <Code>{webhookEndpoint}</Code> sobre os documentos do cofre —
                  inclusive os enviados pelo painel.
                </>
              ) : (
                'Sem endereço público, nenhum aviso é registrado.'
              )}
            </p>
          </div>
        ))}

      {canEdit && safes === null && (
        <p className="text-[11px] text-muted-foreground">
          Listar os cofres gasta 1 das 10 consultas por hora da API.
        </p>
      )}

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title="Trocar o cofre?"
        description={
          `Os próximos envios vão para o cofre ${pending?.name ?? ''}. ` +
          `O que já foi enviado continua no cofre ${currentName ?? 'anterior'}, e os avisos ` +
          'dele continuam chegando.'
        }
        confirmLabel="Trocar cofre"
        onConfirm={() => {
          if (pending) save(pending)
          setPending(null)
        }}
      />
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
