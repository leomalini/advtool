'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { SeriesScopeDialog } from '@/components/shared/SeriesScopeDialog'
import type { SeriesScope } from '@/lib/recurrence'
import { AgendaDragContext, type AgendaDragPreview } from '../hooks/useAgendaDrag'
import { isOptimisticMove, useMoveAgendaItem, type AgendaMove } from '../hooks/useMoveAgendaItem'
import { EVENT_SCOPE_LABELS } from '../utils/eventSeries'
import {
  blockTopInColumn,
  crossesFatalDeadline,
  isAgendaDragSource,
  isGridDropZone,
  isUnchangedMove,
  movedTimeLabel,
  moveInGrid,
} from '../utils/dragMove'

/** Movimento solto, esperando a resposta de um diálogo antes de gravar. */
interface PendingMove {
  move: AgendaMove
  step: 'deadline' | 'scope'
}

/** O que o leitor de tela anuncia — o padrão do dnd-kit é em inglês. */
const ANNOUNCEMENTS: Announcements = {
  onDragStart: () => 'Movendo item da agenda.',
  onDragOver: () => undefined,
  onDragEnd: ({ over }) => (over ? 'Item solto.' : 'Item solto fora da agenda. Nada mudou.'),
  onDragCancel: () => 'Movimento cancelado.',
}

const SCREEN_READER_INSTRUCTIONS = {
  draggable: 'Arraste com o mouse para mudar o dia e o horário. Pelo teclado, abra o item e edite.',
}

/**
 * Engole o clique que o navegador dispara logo depois de soltar.
 *
 * Soltar em cima do próprio bloco (um arraste curto) fecharia o ciclo
 * mousedown/mouseup nele, e o clique abriria o detalhe por cima do movimento.
 * O dnd-kit chama `onDragEnd` dentro do mouseup — o clique vem em seguida, na
 * mesma tarefa, antes do timeout que retira o ouvinte.
 */
function suppressNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

/** Posição do ponteiro (mouse ou dedo) num evento do navegador. */
function pointerYOf(event: Event | null): number | null {
  if (!event) return null
  if ('touches' in event) {
    const touch = (event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0]
    return touch ? touch.clientY : null
  }
  return 'clientY' in event ? (event as MouseEvent).clientY : null
}

function deadlineLabel(iso: string): string {
  const deadline = parseISO(iso)
  const withTime = deadline.getHours() !== 0 || deadline.getMinutes() !== 0
  return format(deadline, withTime ? "dd/MM/yyyy 'às' HH:mm" : 'dd/MM/yyyy', { locale: ptBR })
}

/**
 * Arrastar itens da Agenda para mudar dia e horário.
 *
 * Envolve a grade: mede de onde o item saiu e onde caiu, desenha a sombra (via
 * `AgendaDragContext`), faz as perguntas — prazo fatal, alcance na série — e
 * grava. As grades só marcam o que é arrastável e onde dá para soltar.
 */
export function AgendaDnd({ children }: { children: React.ReactNode }) {
  // Mouse + toque em vez de Pointer: com o PointerSensor o toque precisaria de
  // `touch-action: none`, e a grade deixaria de rolar no tablet. O toque longo
  // separa "rolar" de "arrastar".
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )
  const moveItem = useMoveAgendaItem()

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [preview, setPreview] = useState<AgendaDragPreview | null>(null)
  const [pending, setPending] = useState<PendingMove | null>(null)

  // Ponteiro lido direto do navegador durante o arraste, e a distância entre o
  // topo do bloco e o ponto em que ele foi pego. Ver `blockTopInColumn`.
  const pointerYRef = useRef<number | null>(null)
  const grabOffsetRef = useRef(0)

  useEffect(() => {
    if (!draggingItemId) return
    const track = (event: Event) => {
      const y = pointerYOf(event)
      if (y !== null) pointerYRef.current = y
    }
    // Captura na janela: roda antes dos ouvintes do dnd-kit no document, então
    // o `onDragMove` que eles disparam já lê a posição nova.
    window.addEventListener('mousemove', track, { capture: true })
    window.addEventListener('touchmove', track, { capture: true, passive: true })
    return () => {
      window.removeEventListener('mousemove', track, { capture: true })
      window.removeEventListener('touchmove', track, { capture: true })
    }
  }, [draggingItemId])

  /** Para onde o arraste leva o item agora — `null` fora de uma coluna. */
  function resolveMove({ active, over }: DragMoveEvent | DragEndEvent) {
    const source = active.data.current
    const zone = over?.data.current
    const pointerY = pointerYRef.current
    if (!isAgendaDragSource(source) || !isGridDropZone(zone) || pointerY === null) return null
    const rawTopMin = blockTopInColumn(zone, pointerY, grabOffsetRef.current)
    return { item: source.segment.item, zone, grid: moveInGrid(source, zone, rawTopMin) }
  }

  function clear() {
    setDraggingItemId(null)
    setPreview(null)
    setPending(null)
  }

  function handleDragStart({ active, activatorEvent }: DragStartEvent) {
    const source = active.data.current
    if (!isAgendaDragSource(source)) return

    const pointerY = pointerYOf(activatorEvent)
    const blockTop = active.rect.current.initial?.top
    pointerYRef.current = pointerY
    grabOffsetRef.current = pointerY !== null && blockTop !== undefined ? pointerY - blockTop : 0
    setDraggingItemId(source.segment.item.id)
  }

  function handleDragMove(event: DragMoveEvent) {
    const resolved = resolveMove(event)
    if (!resolved) {
      setPreview(null)
      return
    }
    const { item, zone, grid } = resolved
    const next: AgendaDragPreview = {
      item,
      dayKey: format(zone.day, 'yyyy-MM-dd'),
      topMin: grid.topMin,
      heightMin: grid.heightMin,
      label: movedTimeLabel(item, grid.moved),
    }
    // Só re-renderiza quando a sombra muda de casa — o mouse anda a cada pixel.
    setPreview((current) =>
      current &&
      current.item.id === next.item.id &&
      current.dayKey === next.dayKey &&
      current.topMin === next.topMin
        ? current
        : next
    )
  }

  function handleDragEnd(event: DragEndEvent) {
    suppressNextClick()
    const resolved = resolveMove(event)
    setDraggingItemId(null)

    if (!resolved || isUnchangedMove(resolved.item, resolved.grid.moved)) {
      clear()
      return
    }
    askDeadline({ item: resolved.item, moved: resolved.grid.moved })
  }

  function handleDragCancel() {
    suppressNextClick()
    clear()
  }

  // ── Perguntas, na ordem: prazo fatal → alcance na série → grava ──

  function askDeadline(move: AgendaMove) {
    if (move.item.kind === 'event' && crossesFatalDeadline(move.item.event, move.moved)) {
      setPending({ move, step: 'deadline' })
      return
    }
    askScope(move)
  }

  function askScope(move: AgendaMove) {
    if (move.item.kind === 'event' && move.item.event.recurrence_series_id) {
      setPending({ move, step: 'scope' })
      return
    }
    commit(move, 'this')
  }

  function commit(move: AgendaMove, scope: SeriesScope) {
    const withScope = { ...move, scope }
    if (isOptimisticMove(withScope)) {
      // O cache já mostra o item no lugar novo: a sombra pode sair.
      moveItem.mutate(withScope)
      clear()
      return
    }
    // A série volta do servidor diferente: a sombra fica até lá. O toast de
    // erro vem da própria mutação.
    moveItem.mutate(withScope, { onSettled: clear })
  }

  const movingItemId = draggingItemId ?? pending?.move.item.id ?? null
  const dragState = useMemo(() => ({ movingItemId, preview }), [movingItemId, preview])

  const pendingEvent =
    pending && pending.move.item.kind === 'event' ? pending.move.item.event : null

  return (
    // Um elemento só para a grade: o DndContext põe as regiões do leitor de
    // tela ao lado dos filhos, e elas não podem virar células do grid da página.
    <div className="min-w-0">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        accessibility={{
          announcements: ANNOUNCEMENTS,
          screenReaderInstructions: SCREEN_READER_INSTRUCTIONS,
        }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <AgendaDragContext value={dragState}>{children}</AgendaDragContext>
      </DndContext>

      <ConfirmDialog
        open={pending?.step === 'deadline'}
        onOpenChange={(open) => !open && clear()}
        title="Depois do prazo fatal"
        description={
          pendingEvent?.fatal_deadline && pending
            ? `"${pendingEvent.title}" vai para ${format(pending.move.moved.start, "dd/MM/yyyy 'às' HH:mm")}, depois do prazo fatal de ${deadlineLabel(pendingEvent.fatal_deadline)}. Mover mesmo assim?`
            : ''
        }
        confirmLabel="Mover mesmo assim"
        onConfirm={() => pending && askScope(pending.move)}
      />

      <SeriesScopeDialog
        open={pending?.step === 'scope'}
        onOpenChange={(open) => !open && !moveItem.isPending && clear()}
        action="edit"
        labels={EVENT_SCOPE_LABELS}
        hints={{
          this: 'Só este evento muda de dia ou horário.',
          following: 'Este e os seguintes andam o mesmo tanto; os anteriores ficam.',
          all: 'Todas as ocorrências andam o mesmo tanto.',
        }}
        isLoading={moveItem.isPending}
        onConfirm={(scope) => pending && commit(pending.move, scope)}
      />
    </div>
  )
}
