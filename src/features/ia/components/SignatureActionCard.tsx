'use client'

import { useQuery } from '@tanstack/react-query'
import { FileSignature, Loader2 } from 'lucide-react'
import { SIGNATURE_ACT_LABELS } from '@/types/signature.types'
import { planSignature } from '../actions/signaturePlan'
import type { ActionInput, ActionOutput } from '../tools/actions'
import { ReinforcedActionFooter } from './ReinforcedActionFooter'

interface SignatureActionCardProps {
  input: ActionInput<'enviar_para_assinatura'>
  state: 'pending' | 'running' | 'done'
  output?: ActionOutput
  onConfirm: () => void
  onCancel: () => void
}

/**
 * O envio para assinatura proposto pela IA. A lista de quem assina é a do
 * cadastro (`planSignature`), lida aqui para conferir — o modelo só escolheu
 * o arquivo. Na confirmação o executor monta de novo e envia.
 */
export function SignatureActionCard({
  input,
  state,
  output,
  onConfirm,
  onCancel,
}: SignatureActionCardProps) {
  const plan = useQuery({
    queryKey: [
      'ia',
      'signature-plan',
      input.documento_id,
      input.contrato_id ?? null,
      input.mensagem ?? null,
      input.prazo ?? null,
    ],
    queryFn: () =>
      planSignature({
        documentId: input.documento_id,
        contractId: input.contrato_id ?? null,
        message: input.mensagem ?? null,
        deadline: input.prazo ?? null,
      }),
    enabled: state !== 'done',
    staleTime: 0,
  })

  const data = plan.data
  const blockedReason = plan.error
    ? 'não foi possível ler o arquivo e quem assina'
    : data && !data.request.ok
      ? data.request.reason
      : null
  const count = data?.signers.length ?? 0

  return (
    <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold">
        <FileSignature className="h-4 w-4" />
        Enviar para assinatura (D4Sign)
      </p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Arquivo</dt>
        <dd className="break-words">{data?.documentName ?? input.documento_nome}</dd>
        {data?.safeName && (
          <>
            <dt className="text-muted-foreground">Cofre</dt>
            <dd>{data.safeName}</dd>
          </>
        )}
        {input.prazo && (
          <>
            <dt className="text-muted-foreground">Prazo</dt>
            <dd>{input.prazo.split('-').reverse().join('/')}</dd>
          </>
        )}
        {input.mensagem && (
          <>
            <dt className="text-muted-foreground">Mensagem</dt>
            <dd className="whitespace-pre-wrap break-words">{input.mensagem}</dd>
          </>
        )}
      </dl>

      {plan.isLoading ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Conferindo quem assina no cadastro…
        </p>
      ) : (
        count > 0 && (
          <div>
            <p className="text-muted-foreground">Quem assina (do cadastro)</p>
            <ul className="mt-1 space-y-1">
              {data?.signers.map((signer) => (
                <li key={signer.key} className="rounded border bg-background/60 px-2 py-1">
                  <span className="font-medium">{signer.name || '(sem nome)'}</span>
                  <span className="text-muted-foreground">
                    {' · '}
                    {signer.office ? 'e-mail do login' : signer.email || 'sem e-mail'}
                    {' · '}
                    {SIGNATURE_ACT_LABELS[signer.act]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      <ReinforcedActionFooter
        state={state}
        output={output}
        blockedReason={blockedReason}
        loading={plan.isLoading}
        warning={`A D4Sign manda agora o e-mail com o link para ${count === 1 ? 'a pessoa acima' : `as ${count} pessoas acima`}. Depois de enviado, só dá para cancelar o envio pela tela do documento. Para outra lista, envie pela tela.`}
        confirmLabel="Enviar agora"
        onConfirm={onConfirm}
        onCancel={onCancel}
        done="Enviado para assinatura. Acompanhe pela tela do documento."
      />
    </div>
  )
}
