'use client'

import { useState, type ReactNode } from 'react'
import { AlertTriangle, Check, Loader2, Send, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ActionOutput } from '../tools/actions'

interface ReinforcedActionFooterProps {
  state: 'pending' | 'running' | 'done'
  output?: ActionOutput
  /** Por que não dá para executar daqui (sem cofre, sem e-mail…). */
  blockedReason: string | null
  /** Ainda montando a prévia: os botões esperam. */
  loading: boolean
  /** O que acontece fora do escritório quando executar. */
  warning: string
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  /** O que mostrar quando deu certo (o link gerado, por exemplo). */
  done?: ReactNode
}

/**
 * A confirmação em dois passos das ações que saem do escritório (fase 4c):
 * "Confirmar" só arma; o aviso diz o que vai acontecer, e é o segundo botão
 * que executa. Bloqueada, só dá para cancelar.
 */
export function ReinforcedActionFooter({
  state,
  output,
  blockedReason,
  loading,
  warning,
  confirmLabel,
  onConfirm,
  onCancel,
  done,
}: ReinforcedActionFooterProps) {
  const [armed, setArmed] = useState(false)

  if (state === 'done' && output) {
    if (!output.ok) return <p className="text-muted-foreground">Não executado: {output.motivo}</p>
    return <div className="text-success">{done ?? 'Confirmado e executado.'}</div>
  }

  if (blockedReason) {
    return (
      <div className="space-y-2">
        <p className="text-destructive">Não dá para fazer daqui: {blockedReason}.</p>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="mr-1.5 h-4 w-4" />
          Cancelar
        </Button>
      </div>
    )
  }

  if (!armed) {
    return (
      <div className="flex gap-2 pt-1">
        <Button size="sm" onClick={() => setArmed(true)} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-1.5 h-4 w-4" />
          )}
          Confirmar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={loading}>
          <X className="mr-1.5 h-4 w-4" />
          Cancelar
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="flex gap-1.5 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs leading-relaxed">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
        {warning}
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onConfirm} disabled={state === 'running'}>
          {state === 'running' ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-1.5 h-4 w-4" />
          )}
          {confirmLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setArmed(false)} disabled={state === 'running'}>
          Voltar
        </Button>
      </div>
    </div>
  )
}
