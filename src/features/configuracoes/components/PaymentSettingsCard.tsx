'use client'

import { useState } from 'react'
import { CheckCircle2, CircleAlert, CreditCard, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import { infinitePayHandleSchema } from '@/schemas/officeSettings.schema'
import { useOfficeSettings, useSaveInfinitePayHandle } from '../hooks/useOfficeSettings'

interface PaymentSettingsCardProps {
  /** Onde a InfinitePay entrega os pagamentos, montado no servidor a partir de
   * `APP_PUBLIC_URL`. Null quando a aplicação não tem endereço público. */
  webhookEndpoint: string | null
}

/**
 * A conta InfinitePay que recebe os links de pagamento do Financeiro, e o que
 * a integração consegue fazer com a configuração atual.
 *
 * Só quem administra Configurações troca a conta: é ela que decide para onde
 * vai o dinheiro dos clientes.
 */
export function PaymentSettingsCard({ webhookEndpoint }: PaymentSettingsCardProps) {
  const { data: settings = null, isLoading } = useOfficeSettings()
  const handle = settings?.infinitepay_handle ?? null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          InfinitePay
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Links de pagamento (Pix e cartão) gerados a partir das receitas do Financeiro. O pagamento
          confirmado dá baixa no lançamento sozinho.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          // Montado só depois de carregar: o campo nasce com o valor do banco,
          // sem reset em efeito.
          <HandleForm current={handle} />
        )}

        <div className="space-y-3 border-t pt-4">
          <StatusRow
            ok={handle !== null}
            title={handle ? `Recebendo na conta $${handle}` : 'Nenhuma conta configurada'}
          >
            {handle
              ? 'Cada link guarda a conta em que foi gerado: trocar aqui vale só para os próximos.'
              : 'Sem a InfiniteTag, o Financeiro não oferece link de pagamento.'}
          </StatusRow>

          <StatusRow
            ok={webhookEndpoint !== null}
            title={
              webhookEndpoint ? 'Confirmação automática disponível' : 'Sem confirmação automática'
            }
          >
            {webhookEndpoint ? (
              <>
                A InfinitePay avisa cada pagamento em{' '}
                <code className="break-all rounded bg-muted px-1 py-0.5">{webhookEndpoint}</code>.
                Não há nada a configurar no painel dela: o endereço vai dentro de cada link.
              </>
            ) : (
              <>
                {/* `{' '}` explícito: o SWC do Next 16.2.7 descarta o espaço inicial de
                    texto JSX em várias linhas que contém entidade HTML (&ldquo;). */}
                <code className="rounded bg-muted px-1 py-0.5">APP_PUBLIC_URL</code>{' '}
                não aponta para um endereço HTTPS público. Os links funcionam, mas a baixa só
                acontece quando o cliente volta pelo botão &ldquo;Continuar&rdquo; depois de pagar.
              </>
            )}
          </StatusRow>
        </div>

        <p className="text-xs text-muted-foreground">
          Parcelamento máximo e repasse dos juros ao cliente são definidos no app da InfinitePay,
          não por link.
        </p>
      </CardContent>
    </Card>
  )
}

function StatusRow({
  ok,
  title,
  children,
}: {
  ok: boolean
  title: string
  children: React.ReactNode
}) {
  const Icon = ok ? CheckCircle2 : CircleAlert
  return (
    <div className="flex items-start gap-2.5">
      <Icon
        className={cn('mt-0.5 h-4 w-4 shrink-0', ok ? 'text-success' : 'text-warning')}
        aria-hidden
      />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

/** A troca que espera confirmação. `null` = remover a conta. */
type PendingChange = { next: string | null }

function HandleForm({ current }: { current: string | null }) {
  const { can } = usePermissions()
  const canEdit = can('configuracoes', 'manage')
  const save = useSaveInfinitePayHandle()
  const [value, setValue] = useState(current ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingChange | null>(null)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const parsed = infinitePayHandleSchema.safeParse(value)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'InfiniteTag inválida.')
      return
    }

    setError(null)
    const next = parsed.data || null
    setValue(next ?? '')
    if (next === current) return

    // A primeira configuração vai direto. Trocar ou tirar uma conta que já
    // recebe muda para onde vai o dinheiro dos próximos links: pede confirmação.
    if (current) {
      setPending({ next })
      return
    }
    save.mutate(next)
  }

  function confirmChange() {
    if (!pending) return
    save.mutate(pending.next)
    setPending(null)
  }

  return (
    <>
      <form className="space-y-1.5" onSubmit={handleSubmit}>
        <label htmlFor="infinitepay-handle" className="block text-xs text-muted-foreground">
          InfiniteTag da conta que recebe
        </label>
        <div className="flex gap-2">
          <InputGroup className="h-9 max-w-xs">
            <InputGroupAddon>
              <InputGroupText>$</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              id="infinitepay-handle"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder="escritorio"
              autoComplete="off"
              spellCheck={false}
              disabled={!canEdit || save.isPending}
              aria-invalid={error !== null}
              className="font-mono text-sm"
            />
          </InputGroup>
          {canEdit && (
            <Button type="submit" size="sm" className="h-9" disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Salvar
            </Button>
          )}
        </div>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            O nome de usuário no app da InfinitePay. Pode colar com ou sem o $.
          </p>
        )}
      </form>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.next ? 'Trocar a conta que recebe?' : 'Remover a conta que recebe?'}
        description={
          pending?.next
            ? `Os próximos links de pagamento vão para $${pending.next}. Os links já ` +
              `enviados continuam pagáveis na conta $${current}.`
            : `Sem conta, o Financeiro deixa de gerar links de pagamento. Os links já ` +
              `enviados continuam pagáveis na conta $${current}.`
        }
        confirmLabel={pending?.next ? 'Trocar conta' : 'Remover conta'}
        onConfirm={confirmChange}
      />
    </>
  )
}
