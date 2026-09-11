'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { SeriesScope } from '@/lib/recurrence'

const SCOPES: SeriesScope[] = ['this', 'following', 'all']

interface SeriesScopeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 'edit' ou 'delete' — muda título, botão e o aviso de cada opção. */
  action: 'edit' | 'delete'
  /** Rótulos no gênero certo: "Somente este evento" / "Somente esta tarefa". */
  labels: Record<SeriesScope, string>
  /** Aviso extra por opção (ex.: o que acontece com as concluídas). */
  hints?: Partial<Record<SeriesScope, string>>
  isLoading?: boolean
  onConfirm: (scope: SeriesScope) => void
}

/**
 * A pergunta do Google Agenda ao mexer numa ocorrência de série: só esta,
 * esta e as seguintes, ou todas.
 */
export function SeriesScopeDialog({
  open,
  onOpenChange,
  action,
  labels,
  hints = {},
  isLoading = false,
  onConfirm,
}: SeriesScopeDialogProps) {
  const [scope, setScope] = useState<SeriesScope>('this')

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (isLoading) return
        if (!v) setScope('this')
        onOpenChange(v)
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{action === 'edit' ? 'Editar recorrência' : 'Excluir recorrência'}</DialogTitle>
          <DialogDescription>Esta ocorrência faz parte de uma série.</DialogDescription>
        </DialogHeader>

        <div role="radiogroup" className="space-y-2 py-1">
          {SCOPES.map((option) => (
            <label key={option} className="flex items-start gap-2.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="series_scope"
                checked={scope === option}
                onChange={() => setScope(option)}
                className="mt-1 accent-primary"
              />
              <span>
                {labels[option]}
                {hints[option] && (
                  <span className="block text-[11px] text-muted-foreground">{hints[option]}</span>
                )}
              </span>
            </label>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant={action === 'delete' ? 'destructive' : 'default'}
            onClick={() => onConfirm(scope)}
            disabled={isLoading}
          >
            {action === 'delete'
              ? isLoading ? 'Excluindo...' : 'Excluir'
              : isLoading ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
