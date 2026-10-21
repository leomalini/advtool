'use client'

import { AlertTriangle, UserMinus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useConvertToPerson } from '../hooks/useClienteMutations'

interface MoveToPeopleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  onMoved?: () => void
}

/**
 * "Mover para Pessoas" (migration 78): o cadastro deixa de ser cliente.
 *
 * Não confere antes se pode. Quem decide é o trigger `guard_client_since`, e a
 * recusa dele lista o que impede — o diálogo mostra essa lista no lugar. Uma
 * checagem aqui seria uma segunda cópia da regra, e sob a RLS de quem pede ela
 * ainda erraria: um lançamento invisível ao perfil não entraria na conta.
 */
export function MoveToPeopleDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  onMoved,
}: MoveToPeopleDialogProps) {
  const move = useConvertToPerson()

  function handleOpenChange(value: boolean) {
    if (move.isPending) return
    // A recusa da tentativa anterior não vale para a próxima abertura.
    if (!value) move.reset()
    onOpenChange(value)
  }

  function handleConfirm() {
    move.mutate(clientId, {
      onSuccess: () => {
        handleOpenChange(false)
        onMoved?.()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-[460px]">
        <DialogHeader>
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted">
              <UserMinus className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 pt-1">
              <DialogTitle>Mover {clientName} para Pessoas</DialogTitle>
              <DialogDescription className="mt-1.5 leading-relaxed">
                Deixa de ser cliente: sai de Clientes, dos seletores e das Pendências, e
                continua em Pessoas com o mesmo cadastro. Serve para a parte contrária, a
                testemunha ou o terceiro cadastrado como cliente.
              </DialogDescription>
              <p className="mt-2 text-xs text-muted-foreground">
                Só é possível se o cadastro não for dono de processo, caso, contrato,
                lançamento ou link de acompanhamento ativo.
              </p>
              {move.error && (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <p className="text-xs text-foreground">{move.error.message}</p>
                </div>
              )}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={move.isPending}
          >
            {move.error ? 'Fechar' : 'Cancelar'}
          </Button>
          {!move.error && (
            <Button onClick={handleConfirm} disabled={move.isPending}>
              {move.isPending ? 'Movendo...' : 'Mover para Pessoas'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
