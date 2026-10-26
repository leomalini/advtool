'use client'

import { useState } from 'react'
import { Loader2, Mail, RefreshCw, RotateCcw, Send, Signature, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { usePermissions } from '@/hooks/usePermissions'
import { useOfficeSettings } from '@/features/configuracoes/hooks/useOfficeSettings'
import { cn } from '@/lib/utils'
import {
  SIGNATURE_ACT_LABELS,
  SIGNATURE_REQUEST_STATUS_LABELS,
  SIGNATURE_SIGNER_STATUS_LABELS,
  SIGNATURE_STEP_LABELS,
  SIGNER_AUTH_LABELS,
  UNFINISHED_SIGNATURE_STATUSES,
  type SignatureAct,
  type SignatureRequestStatus,
  type SignatureRequestWithSigners,
  type SignatureSigner,
  type SignatureSignerStatus,
} from '@/types/signature.types'
import { formatDate, formatDateTime } from '@/utils/date'
import {
  useCancelSignature,
  useChangeSignatureEmail,
  useContractSignatures,
  useRefreshSignature,
  useResendSignatureLink,
  useRetrySignature,
} from '../hooks/useContractSignatures'

const REQUEST_STATUS_CLASS: Record<SignatureRequestStatus, string> = {
  preparing: 'bg-info/12 text-info',
  sent: 'bg-warning/12 text-warning',
  signed: 'bg-success/12 text-success',
  canceled: 'bg-muted text-muted-foreground',
  failed: 'bg-destructive/10 text-destructive',
}

const SIGNER_STATUS_CLASS: Record<SignatureSignerStatus, string> = {
  pending: 'text-muted-foreground',
  signed: 'text-success',
  email_failed: 'text-destructive',
}

/** "Atualizar status" gasta chamadas das 10 por hora: um clique a cada 2 minutos. */
const REFRESH_COOLDOWN_MS = 2 * 60_000

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        className,
      )}
    >
      {children}
    </span>
  )
}

interface ContractSignatureSectionProps {
  contractId: string
  /** Abre o diálogo de envio; ausente quando não dá para enviar (sem a D4Sign
   * configurada ou com um envio que não terminou). */
  onSend?: () => void
}

/**
 * Os envios do contrato à D4Sign: em que pé está cada um, quem já assinou e o
 * que dá para fazer — atualizar, cancelar, tentar de novo, reenviar o link,
 * corrigir um e-mail que voltou.
 */
export function ContractSignatureSection({ contractId, onSend }: ContractSignatureSectionProps) {
  const { data: requests = [], isLoading, error } = useContractSignatures(contractId, true)
  const { data: settings = null } = useOfficeSettings()
  const { can } = usePermissions()
  const canEdit = can('contratos', 'update')

  const safeNames = new Map(
    Object.values(settings?.d4sign_safes ?? {}).flatMap((safe) => (safe ? [[safe.uuid, safe.name]] : [])),
  )

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Signature className="h-4 w-4 text-muted-foreground" />
          Assinatura
        </h2>
        {canEdit && onSend && (
          <Button size="sm" variant="outline" onClick={onSend}>
            <Send className="h-3.5 w-3.5" />
            Enviar para assinatura
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Carregando os envios…
        </p>
      ) : error ? (
        <p className="text-xs text-destructive">
          Não foi possível ler os envios (a migration 79 foi aplicada?).
        </p>
      ) : requests.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nada enviado pela D4Sign. Quem assina recebe o link por e-mail, e o PDF assinado volta para
          os arquivos.
        </p>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => (
            <SignatureRequestCard
              key={request.id}
              request={request}
              safeName={request.safe_uuid ? (safeNames.get(request.safe_uuid) ?? null) : null}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function SignatureRequestCard({
  request,
  safeName,
  canEdit,
}: {
  request: SignatureRequestWithSigners
  safeName: string | null
  canEdit: boolean
}) {
  const refresh = useRefreshSignature()
  const retry = useRetrySignature()
  const [coolingDown, setCoolingDown] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const signedCount = request.signers.filter((signer) => signer.status === 'signed').length

  function refreshNow() {
    refresh.mutate(request.id, {
      onSettled: () => {
        setCoolingDown(true)
        setTimeout(() => setCoolingDown(false), REFRESH_COOLDOWN_MS)
      },
    })
  }

  return (
    <li className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{request.title}</span>
            <Pill className={REQUEST_STATUS_CLASS[request.status]}>
              {SIGNATURE_REQUEST_STATUS_LABELS[request.status]}
            </Pill>
          </div>
          <p className="text-xs text-muted-foreground">
            {request.sent_at ? `Enviado em ${formatDateTime(request.sent_at)}` : `Criado em ${formatDateTime(request.created_at)}`}
            {safeName && ` · cofre ${safeName}`}
            {request.deadline && ` · prazo ${formatDate(request.deadline)}`}
            {request.status === 'sent' && ` · ${signedCount} de ${request.signers.length} assinaram`}
          </p>
          {request.status === 'failed' && (
            <p className="text-xs text-destructive">
              Parou no {request.failed_step ? SIGNATURE_STEP_LABELS[request.failed_step] : 'envio'}
              {request.error ? `: ${request.error}` : '.'}
            </p>
          )}
          {request.status === 'canceled' && request.cancel_reason && (
            <p className="text-xs text-muted-foreground">Motivo: {request.cancel_reason}</p>
          )}
          {request.status === 'signed' && (
            <p className="text-xs text-success">
              Assinado em {request.finished_at ? formatDateTime(request.finished_at) : '—'}. O PDF
              assinado está em Arquivos.
            </p>
          )}
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-1">
            {request.status === 'sent' && (
              <Button
                size="xs"
                variant="outline"
                disabled={refresh.isPending || coolingDown}
                title={coolingDown ? 'Espere 2 minutos entre consultas.' : undefined}
                onClick={refreshNow}
              >
                {refresh.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Atualizar status
              </Button>
            )}
            {request.status === 'failed' && (
              <Button size="xs" variant="outline" disabled={retry.isPending} onClick={() => retry.mutate(request.id)}>
                {retry.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Tentar de novo
              </Button>
            )}
            {UNFINISHED_SIGNATURE_STATUSES.includes(request.status) && (
              <Button size="xs" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setCancelOpen(true)}>
                <X className="h-3 w-3" />
                Cancelar envio
              </Button>
            )}
          </div>
        )}
      </div>

      <ul className="divide-y rounded-md border">
        {request.signers.map((signer) => (
          <SignerRow
            key={signer.id}
            request={request}
            signer={signer}
            canEdit={canEdit && request.status === 'sent' && signer.status !== 'signed'}
          />
        ))}
      </ul>

      <CancelSignatureDialog request={request} open={cancelOpen} onOpenChange={setCancelOpen} />
    </li>
  )
}

function SignerRow({
  request,
  signer,
  canEdit,
}: {
  request: SignatureRequestWithSigners
  signer: SignatureSigner
  canEdit: boolean
}) {
  const resend = useResendSignatureLink()
  const [emailOpen, setEmailOpen] = useState(false)
  const act = SIGNATURE_ACT_LABELS[signer.act as SignatureAct] ?? `Papel ${signer.act}`
  const auth = signer.auth_requested.method ? SIGNER_AUTH_LABELS[signer.auth_requested.method] : null

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {signer.name}
          <span className="text-muted-foreground"> · {signer.email}</span>
        </p>
        <p className="text-[11px] text-muted-foreground">
          {act}
          {auth && ` · ${auth}`}
          {signer.whatsapp_number && ' · WhatsApp'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('text-xs font-medium', SIGNER_STATUS_CLASS[signer.status])}>
          {/* Envio cancelado: quem não assinou não está mais "pendente". */}
          {request.status === 'canceled' && signer.status !== 'signed'
            ? 'Não assinou'
            : SIGNATURE_SIGNER_STATUS_LABELS[signer.status]}
          {signer.status === 'signed' && signer.signed_at && ` em ${formatDate(signer.signed_at)}`}
        </span>
        {canEdit && (
          <>
            <Button
              size="xs"
              variant="ghost"
              disabled={resend.isPending}
              onClick={() => resend.mutate({ id: request.id, signerId: signer.id })}
            >
              {resend.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Reenviar
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setEmailOpen(true)}>
              <Mail className="h-3 w-3" />
              Corrigir e-mail
            </Button>
          </>
        )}
      </div>
      <ChangeEmailDialog request={request} signer={signer} open={emailOpen} onOpenChange={setEmailOpen} />
    </li>
  )
}

function CancelSignatureDialog({
  request,
  open,
  onOpenChange,
}: {
  request: SignatureRequestWithSigners
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const cancel = useCancelSignature()
  const [reason, setReason] = useState('')

  return (
    <Dialog open={open} onOpenChange={(value) => !cancel.isPending && onOpenChange(value)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar o envio?</DialogTitle>
          <DialogDescription>
            {request.external_id
              ? 'O documento é cancelado também na D4Sign: o link deixa de valer para quem ainda não assinou.'
              : 'O documento ainda não chegou à D4Sign.'}{' '}
            O contrato volta a rascunho se não houver outro envio aberto.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="cancel-signature-reason">Motivo</Label>
          <Textarea
            id="cancel-signature-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Opcional — fica registrado no envio e na D4Sign"
            rows={2}
            maxLength={500}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={cancel.isPending}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(
                { id: request.id, reason: reason.trim() || null },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {cancel.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Cancelar envio
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ChangeEmailDialog({
  request,
  signer,
  open,
  onOpenChange,
}: {
  request: SignatureRequestWithSigners
  signer: SignatureSigner
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const change = useChangeSignatureEmail()
  const [email, setEmail] = useState(signer.email)

  return (
    <Dialog open={open} onOpenChange={(value) => !change.isPending && onOpenChange(value)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Corrigir o e-mail</DialogTitle>
          <DialogDescription>
            De {signer.name}. Troca na D4Sign e na parte do contrato; depois, reenvie o link.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor={`signer-email-${signer.id}`}>E-mail</Label>
          <Input
            id={`signer-email-${signer.id}`}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={change.isPending}>
            Cancelar
          </Button>
          <Button
            disabled={change.isPending || !email.trim()}
            onClick={() =>
              change.mutate(
                { id: request.id, signerId: signer.id, email: email.trim() },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {change.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Trocar e-mail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
