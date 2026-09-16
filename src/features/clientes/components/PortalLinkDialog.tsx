'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  RefreshCw,
  ShieldOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePermissions } from '@/hooks/usePermissions'
import {
  useClientPortalLink,
  useIssueClientPortalLink,
  useRevokeClientPortalLink,
} from '../hooks/useClientPortalLink'
import type { ClientPortalLink } from '@/types/clientPortal.types'

/**
 * Emissão, exibição e revogação do link público do cliente.
 *
 * Mora no cabeçalho da tela do cliente, e não dentro de uma aba: reenviar o
 * link para o cliente é tarefa de rotina da secretaria, e uma seção no fim da
 * aba Cadastro obrigava a lembrar ONDE ela estava antes de poder usá-la.
 *
 * O botão é também o indicador de estado — o ponto ao lado diz, sem abrir
 * nada, se aquele cliente já tem link ativo.
 */
export function PortalLinkButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false)
  const { data: link, isLoading } = useClientPortalLink(clientId)

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Link2 className="h-3.5 w-3.5 mr-1.5" />
        Link do cliente
        {!isLoading && (
          <span
            aria-hidden
            className={cn(
              'ml-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
              link ? 'bg-success' : 'bg-muted-foreground/40'
            )}
          />
        )}
        <span className="sr-only">
          {link ? 'Link de acompanhamento ativo' : 'Sem link de acompanhamento'}
        </span>
      </Button>

      <PortalLinkDialog
        clientId={clientId}
        link={link ?? null}
        isLoading={isLoading}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

function PortalLinkDialog({
  clientId,
  link,
  isLoading,
  open,
  onOpenChange,
}: {
  clientId: string
  link: ClientPortalLink | null
  isLoading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { can } = usePermissions()
  const issue = useIssueClientPortalLink(clientId)
  const revoke = useRevokeClientPortalLink(clientId)

  const [copied, setCopied] = useState(false)
  /** Confirmação embutida em vez de um segundo modal: AlertDialog dentro de
   * Dialog briga pelo foco, e a pergunta cabe no espaço que já existe. */
  const [confirming, setConfirming] = useState<'reissue' | 'revoke' | null>(null)

  const canManage = can('clientes', 'update')
  const isBusy = issue.isPending || revoke.isPending

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('Link copiado')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard bloqueada (contexto não seguro, permissão negada): o link
      // continua na tela para seleção manual, então isto é aviso, não falha.
      toast.error('Não foi possível copiar — selecione o link manualmente.')
    }
  }

  async function handleIssue() {
    try {
      const issued = await issue.mutateAsync()
      setConfirming(null)
      await copy(issued.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar o link.')
    }
  }

  async function handleRevoke() {
    try {
      await revoke.mutateAsync()
      setConfirming(null)
      toast.success('Link revogado. Quem tiver a URL antiga não entra mais.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao revogar o link.')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link de acompanhamento</DialogTitle>
          <DialogDescription>
            Uma página pública, somente leitura, com os processos deste cliente e
            o andamento que o escritório publicou. Sem senha e sem cadastro: para
            entrar, ele confirma o próprio CPF/CNPJ.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : link ? (
          <div className="flex flex-col gap-4">
            {link.url ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                    {link.url}
                  </code>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      onClick={() => copy(link.url!)}
                      title="Copiar link"
                    >
                      {copied ? (
                        <Check className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" asChild>
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Abrir como o cliente vê"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Final <span className="font-mono">{link.token_hint}</span> ·{' '}
                  {link.last_accessed_at
                    ? `último acesso em ${format(parseISO(link.last_accessed_at), "d 'de' MMM 'de' yyyy, HH:mm", { locale: ptBR })} · ${link.access_count} ${link.access_count === 1 ? 'acesso' : 'acessos'}`
                    : 'ainda não acessado pelo cliente'}
                </p>
              </div>
            ) : (
              <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <p className="text-muted-foreground">
                  Este link continua funcionando para o cliente, mas não pode ser
                  exibido aqui — foi emitido antes desta tela existir, ou o
                  segredo do servidor mudou depois. Gere um novo para poder
                  copiá-lo.
                </p>
              </div>
            )}

            {confirming === 'reissue' && (
              <ConfirmRow
                message="Gerar um link novo invalida o atual. Quem já tiver a URL antiga para de entrar."
                confirmLabel="Gerar novo"
                pending={issue.isPending}
                onConfirm={handleIssue}
                onCancel={() => setConfirming(null)}
              />
            )}

            {confirming === 'revoke' && (
              <ConfirmRow
                message="O endereço para de funcionar imediatamente, inclusive para quem já o tinha aberto. O cliente só volta a acompanhar com um link novo."
                confirmLabel="Revogar"
                destructive
                pending={revoke.isPending}
                onConfirm={handleRevoke}
                onCancel={() => setConfirming(null)}
              />
            )}

            {canManage && confirming === null && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming('reissue')}
                  disabled={isBusy}
                >
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Gerar novo
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirming('revoke')}
                  disabled={isBusy}
                >
                  <ShieldOff className="h-3.5 w-3.5 mr-1.5" />
                  Revogar
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Este cliente ainda não tem link. O CPF/CNPJ precisa estar no
              cadastro — é o que ele digita para entrar.
            </p>
            {canManage && (
              <Button size="sm" className="self-start" onClick={handleIssue} disabled={isBusy}>
                {issue.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                Gerar link
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ConfirmRow({
  message,
  confirmLabel,
  destructive = false,
  pending,
  onConfirm,
  onCancel,
}: {
  message: string
  confirmLabel: string
  destructive?: boolean
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={destructive ? 'destructive' : 'default'}
          onClick={onConfirm}
          disabled={pending}
        >
          {pending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
