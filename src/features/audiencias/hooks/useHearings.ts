'use client'

import { useMemo } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '@/hooks/useAuth'
import { eventKeys } from '@/features/agenda/hooks/useEvents'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
import type { HearingDetailsInput } from '@/schemas/hearing.schema'
import type { HearingKind } from '@/types/hearing.types'
import {
  confirmHearingDate,
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
import { hearingKeys, hearingKindKeys } from './hearingKeys'

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
