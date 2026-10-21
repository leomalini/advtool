'use client'

import { useMemo } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { eventKeys } from '@/features/agenda/hooks/useEvents'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
import { taskKeys } from '@/features/tarefas/hooks/useTasks'
import type {
  ChecklistTemplateInput,
  HearingDetailsInput,
  HearingKindInput,
} from '@/schemas/hearing.schema'
import type { HearingChecklistState, HearingKind } from '@/types/hearing.types'
import {
  addChecklistItem,
  confirmHearingDate,
  countHearingsOfKind,
  createChecklistTemplate,
  createHearingKind,
  deleteChecklistTemplate,
  deleteHearingKind,
  getChecklistTemplates,
  getOpenHearings,
  removeChecklistItem,
  setChecklistItemState,
  setReadyOverride,
  updateChecklistTemplate,
  updateHearingKind,
  countHearingsNeedingAttention,
  createHearing,
  getHearing,
  getHearingAgenda,
  getHearingKinds,
  getHearingsForProcess,
  getHearingsWithoutDate,
  HearingCreatedWithoutDateError,
  scheduleHearing,
  setHearingCancelled,
  updateHearingDetails,
} from '../services/hearings.service'
import { hearingKeys, hearingKindKeys, hearingTemplateKeys } from './hearingKeys'

/** `refetchInterval`: o dashboard fica aberto o dia todo; a pauta atualiza
 * pelas mutações. */
export function useHearingAgenda(
  from: string,
  to: string,
  includeCancelled: boolean,
  options: { refetchInterval?: number } = {},
) {
  return useQuery({
    queryKey: hearingKeys.agenda(from, to, includeCancelled),
    queryFn: () => getHearingAgenda({ from, to, includeCancelled }),
    placeholderData: keepPreviousData,
    refetchInterval: options.refetchInterval,
  })
}

export function useHearingsForProcess(legalProcessId: string | null, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: hearingKeys.forProcess(legalProcessId ?? '-'),
    queryFn: () => getHearingsForProcess(legalProcessId!),
    enabled: !!legalProcessId && options.enabled !== false,
  })
}

export function useHearingsWithoutDate() {
  return useQuery({
    queryKey: hearingKeys.withoutDate(),
    queryFn: getHearingsWithoutDate,
  })
}

export function useHearing(id: string | null) {
  return useQuery({
    queryKey: hearingKeys.detail(id ?? '-'),
    queryFn: () => getHearing(id!),
    enabled: !!id,
  })
}

/** O badge do menu. `enabled` para o Sidebar chamar sem condicional. */
export function useHearingAttentionCount(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: hearingKeys.attention(),
    queryFn: countHearingsNeedingAttention,
    enabled: options.enabled,
  })
}

export function useHearingKinds() {
  return useQuery({
    queryKey: hearingKindKeys.all,
    queryFn: getHearingKinds,
    staleTime: 10 * 60 * 1000,
  })
}

export function useHearingKindMap(): Map<string, HearingKind> {
  const { data } = useHearingKinds()
  return useMemo(() => new Map((data ?? []).map((kind) => [kind.id, kind])), [data])
}

/**
 * Tudo que mostra dado de audiência. A data mora no evento, então a Agenda e o
 * dashboard (que lê pelas chaves da Agenda) vão junto; a pendência "sem data"
 * conta fichas.
 */
function useInvalidateHearingSurfaces() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: hearingKeys.all })
    queryClient.invalidateQueries({ queryKey: eventKeys.all })
    queryClient.invalidateQueries({ queryKey: legalProcessKeys.pendencies })
    // O checklist cria, move e apaga tarefas (migration 77) — inclusive por
    // gatilho, ao agendar, conferir ou cancelar.
    queryClient.invalidateQueries({ queryKey: taskKeys.all })
  }
}

export function useConfirmHearingDate() {
  const invalidate = useInvalidateHearingSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (id: string) => confirmHearingDate(id, user!.id),
    onSuccess: () => {
      invalidate()
      toast.success('Data conferida.')
    },
    onError: () => toast.error('Não foi possível marcar a data como conferida.'),
  })
}

export function useUpdateHearingDetails() {
  const invalidate = useInvalidateHearingSurfaces()

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: HearingDetailsInput }) =>
      updateHearingDetails(id, input),
    onSuccess: () => {
      invalidate()
      toast.success('Audiência atualizada.')
    },
    onError: () => toast.error('Não foi possível salvar a audiência.'),
  })
}

export function useScheduleHearing() {
  const invalidate = useInvalidateHearingSurfaces()

  return useMutation({
    mutationFn: scheduleHearing,
    onSuccess: () => {
      invalidate()
      toast.success('Data da audiência salva na Agenda.')
    },
    onError: () => toast.error('Não foi possível salvar a data da audiência.'),
  })
}

export function useCreateHearing() {
  const invalidate = useInvalidateHearingSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof createHearing>[0], 'userId'>) =>
      createHearing({ ...input, userId: user!.id }),
    onSuccess: (_id, input) => {
      invalidate()
      toast.success(input.schedule ? 'Audiência criada e posta na Agenda.' : 'Audiência criada sem data.')
    },
    onError: (error) => {
      // A ficha existe: a lista precisa mostrá-la mesmo com o erro.
      if (error instanceof HearingCreatedWithoutDateError) {
        invalidate()
        toast.error('A audiência foi criada, mas a data não foi salva. Informe a data na ficha.')
        return
      }
      toast.error('Não foi possível criar a audiência.')
    },
  })
}

export function useSetHearingCancelled() {
  const invalidate = useInvalidateHearingSurfaces()

  return useMutation({
    mutationFn: ({ id, cancelled }: { id: string; cancelled: boolean; withoutDate: boolean }) =>
      setHearingCancelled(id, cancelled),
    onSuccess: (_data, { cancelled, withoutDate }) => {
      invalidate()
      if (!cancelled) toast.success('Audiência reativada.')
      else toast.success(withoutDate ? 'Audiência descartada.' : 'Audiência cancelada e retirada da Agenda.')
    },
    onError: () => toast.error('Não foi possível alterar a audiência.'),
  })
}

// ── Quadro ──────────────────────────────────────────────────────────────────

export function useOpenHearings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: hearingKeys.open(),
    queryFn: getOpenHearings,
    enabled: options.enabled,
  })
}

// ── Checklist ───────────────────────────────────────────────────────────────

const CHECKLIST_ERROR = 'Não foi possível atualizar o checklist.'

export function useSetChecklistItemState() {
  const invalidate = useInvalidateHearingSurfaces()

  return useMutation({
    mutationFn: ({ itemId, state }: { itemId: string; state: HearingChecklistState }) =>
      setChecklistItemState(itemId, state),
    onSuccess: invalidate,
    onError: () => toast.error(CHECKLIST_ERROR),
  })
}

export function useAddChecklistItem() {
  const invalidate = useInvalidateHearingSurfaces()

  return useMutation({
    mutationFn: addChecklistItem,
    onSuccess: (_data, { offsetDays }) => {
      invalidate()
      toast.success(offsetDays === null ? 'Item acrescentado.' : 'Item acrescentado, com tarefa.')
    },
    onError: () => toast.error(CHECKLIST_ERROR),
  })
}

export function useRemoveChecklistItem() {
  const invalidate = useInvalidateHearingSurfaces()

  return useMutation({
    mutationFn: removeChecklistItem,
    onSuccess: invalidate,
    onError: () => toast.error(CHECKLIST_ERROR),
  })
}

export function useSetReadyOverride() {
  const invalidate = useInvalidateHearingSurfaces()
  const { user } = useAuth()

  return useMutation({
    mutationFn: ({ id, ready }: { id: string; ready: boolean }) => setReadyOverride(id, ready, user!.id),
    onSuccess: (_data, { ready }) => {
      invalidate()
      toast.success(ready ? 'Audiência marcada como pronta.' : 'Marcação de pronta desfeita.')
    },
    onError: () => toast.error('Não foi possível alterar a audiência.'),
  })
}

// ── Configurações ───────────────────────────────────────────────────────────

export function useChecklistTemplates() {
  return useQuery({
    queryKey: hearingTemplateKeys.all,
    queryFn: getChecklistTemplates,
    staleTime: 10 * 60 * 1000,
  })
}

function useInvalidateSettings() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: hearingTemplateKeys.all })
    queryClient.invalidateQueries({ queryKey: hearingKindKeys.all })
  }
}

export function useSaveChecklistTemplate() {
  const invalidate = useInvalidateSettings()

  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ChecklistTemplateInput }) =>
      id ? updateChecklistTemplate(id, input) : createChecklistTemplate(input),
    onSuccess: (_data, { id }) => {
      invalidate()
      toast.success(id ? 'Item do modelo atualizado.' : 'Item acrescentado ao modelo.')
    },
    onError: () => toast.error('Não foi possível salvar o item do modelo.'),
  })
}

export function useDeleteChecklistTemplate() {
  const invalidate = useInvalidateSettings()

  return useMutation({
    mutationFn: deleteChecklistTemplate,
    onSuccess: () => {
      invalidate()
      toast.success('Item removido do modelo.')
    },
    onError: () => toast.error('Não foi possível remover o item.'),
  })
}

export function useSaveHearingKind() {
  const invalidate = useInvalidateSettings()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: HearingKindInput }) =>
      id ? updateHearingKind(id, input) : createHearingKind(input),
    onSuccess: (_data, { id }) => {
      invalidate()
      // O rótulo do tipo aparece na pauta e na ficha.
      queryClient.invalidateQueries({ queryKey: hearingKeys.all })
      toast.success(id ? 'Tipo atualizado.' : 'Tipo criado.')
    },
    onError: () => toast.error('Não foi possível salvar o tipo.'),
  })
}

export function useHearingKindUsage(kindId: string | null) {
  return useQuery({
    queryKey: [...hearingKindKeys.all, 'usage', kindId ?? '-'] as const,
    queryFn: () => countHearingsOfKind(kindId!),
    enabled: !!kindId,
  })
}

export function useDeleteHearingKind() {
  const invalidate = useInvalidateSettings()

  return useMutation({
    mutationFn: deleteHearingKind,
    onSuccess: () => {
      invalidate()
      toast.success('Tipo removido.')
    },
    onError: () => toast.error('Não foi possível remover o tipo.'),
  })
}
