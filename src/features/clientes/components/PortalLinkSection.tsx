'use client'

import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Check, Copy, Link2, Loader2, RefreshCw, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DataSection } from '@/components/shared/DataSection'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { usePermissions } from '@/hooks/usePermissions'
import {
  useClientPortalLink,
  useIssueClientPortalLink,
  useRevokeClientPortalLink,
} from '../hooks/useClientPortalLink'

/**
 * Emissão e revogação do link público do cliente.
 *
 * A tela gira em torno de um fato do desenho: **a URL completa existe uma vez
 * só**, na resposta da emissão. O banco guarda o SHA-256, então nem o
 * escritório a recupera depois — perder a mensagem significa emitir outra, o
 * que invalida a anterior. Por isso o link recém-gerado ocupa o bloco inteiro,
 * com o aviso junto, em vez de virar um `toast` que some em quatro segundos.
 */
export function PortalLinkSection({ clientId }: { clientId: string }) {
  const { can } = usePermissions()
  const { data: link, isLoading } = useClientPortalLink(clientId)
  const issue = useIssueClientPortalLink(clientId)
  const revoke = useRevokeClientPortalLink(clientId)

  const [issuedUrl, setIssuedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmRevoke, setConfirmRevoke] = useState(false)

  const canManage = can('clientes', 'update')
  const isBusy = issue.isPending || revoke.isPending

  async function handleIssue() {
    try {
      const issued = await issue.mutateAsync()
      setIssuedUrl(issued.url)
      setCopied(false)
      await copy(issued.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar o link.')
    }
  }

  async function handleRevoke() {
    try {
      await revoke.mutateAsync()
      setIssuedUrl(null)
      setConfirmRevoke(false)
      toast.success('Link revogado. Quem tiver a URL antiga não entra mais.')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao revogar o link.')
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('Link copiado')
    } catch {
      // Clipboard bloqueada (contexto não seguro, permissão negada): o link
      // continua visível na tela para seleção manual, então isto é um aviso,
      // não uma falha da operação.
      toast.error('Não foi possível copiar — selecione o link manualmente.')
    }
  }

  return (
    <DataSection
      icon={<Link2 className="h-3.5 w-3.5" />}
      title="Link de acompanhamento"
      action={
        canManage && !isLoading ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={handleIssue}
            disabled={isBusy}
          >
            {issue.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            {link ? 'Gerar novo' : 'Gerar link'}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3 p-4">
        {isLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <>
            {issuedUrl && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex items-start gap-2">
                  <code className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                    {issuedUrl}
                  </code>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 shrink-0 text-xs"
                    onClick={() => copy(issuedUrl)}
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Copie agora: por segurança, o endereço completo não fica
                  guardado e não há como exibi-lo de novo. Gerar outro invalida
                  este.
                </p>
              </div>
            )}

            {link ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="text-foreground">
                    Link ativo{' '}
                    <span className="font-mono text-xs text-muted-foreground">
                      (final {link.token_hint})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {link.last_accessed_at
                      ? `Último acesso em ${format(parseISO(link.last_accessed_at), "d 'de' MMM 'de' yyyy, HH:mm", { locale: ptBR })} · ${link.access_count} ${link.access_count === 1 ? 'acesso' : 'acessos'}`
                      : 'Ainda não acessado pelo cliente.'}
                  </p>
                </div>

                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive hover:text-destructive"
                    onClick={() => setConfirmRevoke(true)}
                    disabled={isBusy}
                  >
                    <ShieldOff className="h-3 w-3 mr-1" />
                    Revogar
                  </Button>
                )}
              </div>
            ) : (
              !issuedUrl && (
                <p className="text-sm text-muted-foreground">
                  Nenhum link emitido. O link dá ao cliente uma página pública,
                  somente leitura, com os processos dele e o andamento que o
                  escritório publicou — sem senha e sem cadastro. Para entrar,
                  ele confirma o próprio CPF/CNPJ.
                </p>
              )
            )}
          </>
        )}
      </div>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar o link de acompanhamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O endereço para de funcionar imediatamente, inclusive para quem já
              o tinha aberto. O cliente só volta a acompanhar com um link novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                // O AlertDialog fecha no clique por padrão; sem isto o estado
                // de "revogando" não chega a aparecer e um erro voltaria para
                // uma tela já fechada.
                event.preventDefault()
                handleRevoke()
              }}
              disabled={revoke.isPending}
            >
              {revoke.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DataSection>
  )
}
