'use client'

import { UserCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useConvertToClient } from '../hooks/useClienteMutations'

interface ConvertToClientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  personId: string
  personName: string
  /** Quem chama decide o que vem depois: a ficha e o aviso de documento
   * navegam para a ficha do cliente; a lista fica onde está. */
  onConverted?: () => void
}

/**
 * "Tornar cliente" (migration 78). Confirma antes porque a pessoa muda de
 * lugar no sistema — e diz o que muda, e o que não muda.
 */
export function ConvertToClientDialog({
  open,
  onOpenChange,
  personId,
  personName,
  onConverted,
}: ConvertToClientDialogProps) {
  const convert = useConvertToClient()

  function handleConfirm() {
    convert.mutate(personId, {
      onSuccess: () => {
        onOpenChange(false)
        onConverted?.()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(value) => !convert.isPending && onOpenChange(value)}>
      <DialogContent showCloseButton={false} className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <UserCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 pt-1">
              <DialogTitle>Tornar {personName} cliente</DialogTitle>
              <DialogDescription className="mt-1.5 leading-relaxed">
                Passa a aparecer em Clientes, nos seletores de processo, contrato e lançamento,
                e nas Pendências. Nada do cadastro muda: contatos, endereços, notas, arquivos e
                vínculos continuam os mesmos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={convert.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleConfirm} disabled={convert.isPending}>
            {convert.isPending ? 'Convertendo...' : 'Tornar cliente'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
