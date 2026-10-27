'use client'

import { Send, Signature } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePermissions } from '@/hooks/usePermissions'
import { SignatureRequestList } from '@/features/assinaturas/components/SignatureRequestList'
import { useContractSignatures } from '@/features/assinaturas/hooks/useSignatures'

interface ContractSignatureSectionProps {
  contractId: string
  /** Abre o diálogo de envio; ausente quando não dá para enviar (sem a D4Sign
   * configurada ou com um envio que não terminou). */
  onSend?: () => void
}

/** A seção "Assinatura" do contrato: os envios à D4Sign e o botão de enviar. */
export function ContractSignatureSection({ contractId, onSend }: ContractSignatureSectionProps) {
  const { data: requests = [], isLoading, error } = useContractSignatures(contractId, true)
  const { can } = usePermissions()
  const canEdit = can('contratos', 'update')

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

      <SignatureRequestList
        requests={requests}
        isLoading={isLoading}
        error={error}
        canEdit={canEdit}
        emptyText="Nada enviado pela D4Sign. Quem assina recebe o link por e-mail, e o PDF assinado volta para os arquivos."
      />
    </section>
  )
}
