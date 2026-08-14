'use client'

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ColorPicker, COLOR_SWATCHES } from '@/components/shared/ColorPicker'
import { useEventTypes, useCreateEventType } from '../hooks/useEventTypes'
import { resolveEventType } from '@/types/event.types'

/** Valor sentinela da opção "criar novo". Radix lança em runtime com value=""
 * (ver utils/select), e um slug improvável evita colidir com um tipo real. */
const CREATE_VALUE = '__create_event_type__'

interface EventTypeSelectProps {
  value: string
  onChange: (typeId: string) => void
  className?: string
}

/**
 * Seletor de tipo de evento com cadastro embutido.
 *
 * Cadastrar sem sair do formulário é o ponto: o tipo que falta só é percebido
 * na hora de marcar o evento, e mandar o usuário até as Configurações significa
 * perder o que já foi preenchido. O tipo criado aqui fica salvo e disponível
 * para os próximos eventos.
 */
export function EventTypeSelect({ value, onChange, className }: EventTypeSelectProps) {
  const { data: types = [] } = useEventTypes()
  const createType = useCreateEventType()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [color, setColor] = useState<string>(COLOR_SWATCHES[0])

  const selected = resolveEventType(new Map(types.map((t) => [t.id, t])), value)

  function openDialog() {
    setLabel('')
    setColor(COLOR_SWATCHES[0])
    setDialogOpen(true)
  }

  async function handleCreate() {
    const trimmed = label.trim()
    if (!trimmed || createType.isPending) return

    const created = await createType.mutateAsync({ label: trimmed, color })
    // Selecionar o tipo recém-criado é o motivo de tê-lo criado.
    onChange(created.id)
    setDialogOpen(false)
  }

  return (
    <>
      <div className="relative">
        <div
          className="absolute left-3 top-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full z-10 pointer-events-none transition-colors duration-300"
          style={{ backgroundColor: selected.color }}
        />
        <Select
          value={value}
          onValueChange={(v) => {
            if (v === CREATE_VALUE) openDialog()
            else if (v) onChange(v)
          }}
        >
          <SelectTrigger className={className ?? 'h-9 text-sm pl-8'}>
            <SelectValue placeholder="Selecionar tipo...">{selected.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {types.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                <span className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                  {t.label}
                </span>
              </SelectItem>
            ))}
            <SelectItem value={CREATE_VALUE}>
              <span className="flex items-center gap-2 text-primary">
                <Plus className="h-3.5 w-3.5 shrink-0" />
                Criar novo tipo
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && setDialogOpen(false)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Novo tipo de evento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Nome
              </label>
              <Input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleCreate()
                  }
                }}
                placeholder="Ex: Perícia, Sustentação oral"
                maxLength={40}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                Cor
              </label>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreate} disabled={!label.trim() || createType.isPending}>
              {createType.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Criar e usar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
