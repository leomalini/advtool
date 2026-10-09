'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { SeriesScopeDialog } from '@/components/shared/SeriesScopeDialog'
import type { SeriesScope } from '@/lib/recurrence'
import { resolveEventType } from '@/types/event.types'
import { AgendaDragContext, type AgendaDragPreview } from '../hooks/useAgendaDrag'
import { useEventTypeMap } from '../hooks/useEventTypes'
import { isOptimisticMove, useMoveAgendaItem, type AgendaMove } from '../hooks/useMoveAgendaItem'
import type { AgendaItem } from '../utils/agendaItem'
import { EVENT_SCOPE_LABELS } from '../utils/eventSeries'
import { suppressNextClick } from '../utils/suppressNextClick'
import {
  blockTopInColumn,
  crossesFatalDeadline,
  isAgendaDragSource,
  isDayDropZone,
  isGridDropZone,
  isResizeDragSource,
  isUnchangedMove,
  movedDayKeys,
  movedTimeLabel,
  moveChipToGrid,
  moveInGrid,
  moveToDay,
  resizeInGrid,
  type MovedTimes,
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

/** Posição do ponteiro (mouse ou dedo) num evento do navegador. */
function pointerYOf(event: Event | null): number | null {
  if (!event) return null
  if ('touches' in event) {
    const touch = (event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0]
    return touch ? touch.clientY : null
  }
  return 'clientY' in event ? (event as MouseEvent).clientY : null
}

/**
 * O alvo sob o ponteiro, com os retângulos lidos na hora.
 *
 * Duas diferenças para o `pointerWithin` do dnd-kit: os retângulos não ficam
 * velhos quando a grade rola, e a faixa "Dia todo" ganha das colunas. Ela é
 * fixa no topo da área que rola: com a grade rolada, a faixa e o topo de uma
 * coluna ocupam o mesmo lugar na tela, e o que se vê ali é a faixa.
 */
const agendaCollision: CollisionDetection = ({ droppableContainers, pointerCoordinates }) => {
  if (!pointerCoordinates) return []
  const { x, y } = pointerCoordinates
  const hits = droppableContainers.filter((container) => {
    const rect = container.node.current?.getBoundingClientRect()
    return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  })
  const hit = hits.find((container) => isDayDropZone(container.data.current)) ?? hits[0]
  return hit ? [{ id: hit.id }] : []
}

/** Identidade da sombra: muda só quando ela muda de casa. */
function previewKey(preview: AgendaDragPreview | null): string {
  if (!preview) return ''
  if (preview.kind === 'grid') {
    return `${preview.item.id}|grid|${preview.dayKey}|${preview.topMin}|${preview.heightMin}`
  }
  return `${preview.item.id}|${preview.area}|${preview.dayKeys.join(',')}`
}

/** O chip que acompanha o ponteiro ao arrastar do mês ou da faixa "Dia todo". */
function DragChip({ item }: { item: AgendaItem }) {
  const eventTypes = useEventTypeMap()

  if (item.kind === 'task') {
    return (
      <div className="flex h-full items-center rounded border border-info/40 bg-card px-1.5 text-[10px] font-medium text-info shadow-lg cursor-grabbing">
        <span className="truncate">{item.title}</span>
      </div>
    )
  }
  return (
    <div
      className="flex h-full items-center rounded px-1.5 text-[10px] font-medium text-white shadow-lg cursor-grabbing"
      style={{ backgroundColor: resolveEventType(eventTypes, item.event.type).color }}
    >
      <span className="truncate">{item.title}</span>
    </div>
  )
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
  /** Chip arrastado — desenhado no `DragOverlay`, seguindo o ponteiro. */
  const [overlayItem, setOverlayItem] = useState<AgendaItem | null>(null)
  const [preview, setPreview] = useState<AgendaDragPreview | null>(null)
  const [pending, setPending] = useState<PendingMove | null>(null)

  // Ponteiro lido direto do navegador durante o arraste, e a distância entre o
  // topo do bloco e o ponto em que ele foi pego. Ver `blockTopInColumn`.
  const pointerYRef = useRef<number | null>(null)
  const activatorYRef = useRef<number | null>(null)
  const grabOffsetRef = useRef<number | null>(null)

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

  /** Para onde o arraste leva o item agora — `null` fora de um alvo, ou num
   * alvo que não aceita o item. */
  function resolveMove({ active, over }: DragMoveEvent | DragEndEvent): {
    item: AgendaItem
    moved: MovedTimes
    action: 'move' | 'resize'
    preview: AgendaDragPreview
  } | null {
    const source = active.data.current
    const zone = over?.data.current
    const resizing = isResizeDragSource(source)
    if (!resizing && !isAgendaDragSource(source)) return null
    const item = source.segment.item

    if (!resizing && isDayDropZone(zone)) {
      const moved = moveToDay(source.segment, zone)
      return {
        item,
        moved,
        action: 'move',
        preview: { kind: 'days', item, dayKeys: movedDayKeys(moved), area: zone.area },
      }
    }

    const pointerY = pointerYRef.current
    if (!isGridDropZone(zone) || pointerY === null) return null
    // O retângulo inicial do item só existe depois do `onDragStart` — lá ele
    // ainda vinha vazio, e a pega contava como zero: a sombra caía um passo
    // abaixo do ponteiro. No redimensionar, a pega é medida até a base.
    const initial = active.rect.current.initial
    if (grabOffsetRef.current === null && initial && activatorYRef.current !== null) {
      grabOffsetRef.current = activatorYRef.current - (resizing ? initial.bottom : initial.top)
    }
    // Todas as colunas têm o mesmo topo: a do ponteiro serve de régua mesmo
    // quando o redimensionar escorrega para a coluna ao lado.
    const rawMin = blockTopInColumn(zone, pointerY, grabOffsetRef.current ?? 0)

    let grid
    if (resizing) grid = resizeInGrid(source, rawMin)
    else if (source.origin === 'grid') grid = moveInGrid(source, zone, rawMin)
    else grid = moveChipToGrid(source.segment, zone, rawMin)
    if (!grid) return null

    return {
      item,
      moved: grid.moved,
      action: resizing ? 'resize' : 'move',
      preview: {
        kind: 'grid',
        item,
        // O redimensionar fica no dia do próprio bloco.
        dayKey: resizing ? source.segment.dayKey : format(zone.day, 'yyyy-MM-dd'),
        topMin: grid.topMin,
        heightMin: grid.heightMin,
        label: movedTimeLabel(item, grid.moved),
      },
    }
  }

  function clear() {
    setDraggingItemId(null)
    setOverlayItem(null)
    setPreview(null)
    setPending(null)
  }

  function handleDragStart({ active, activatorEvent }: DragStartEvent) {
    const source = active.data.current
    if (!isAgendaDragSource(source) && !isResizeDragSource(source)) return

    const pointerY = pointerYOf(activatorEvent)
    pointerYRef.current = pointerY
    activatorYRef.current = pointerY
    grabOffsetRef.current = null
    setDraggingItemId(source.segment.item.id)
    // Bloco da grade tem a sombra encaixada; chip segue o ponteiro.
    if (isAgendaDragSource(source) && source.origin === 'chip') setOverlayItem(source.segment.item)
  }

  function handleDragMove(event: DragMoveEvent) {
    const next = resolveMove(event)?.preview ?? null
    // Só re-renderiza quando a sombra muda de casa — o mouse anda a cada pixel.
    setPreview((current) => (previewKey(current) === previewKey(next) ? current : next))
  }

  function handleDragEnd(event: DragEndEvent) {
    suppressNextClick()
    const resolved = resolveMove(event)
    setDraggingItemId(null)
    setOverlayItem(null)

    if (!resolved || isUnchangedMove(resolved.item, resolved.moved)) {
      clear()
      return
    }
    askDeadline({ item: resolved.item, moved: resolved.moved, action: resolved.action })
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
        collisionDetection={agendaCollision}
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
        {/* Sem animação de volta: o item já aparece no destino (otimista) ou
            o diálogo assume. */}
        <DragOverlay dropAnimation={null}>
          {overlayItem ? <DragChip item={overlayItem} /> : null}
        </DragOverlay>
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
