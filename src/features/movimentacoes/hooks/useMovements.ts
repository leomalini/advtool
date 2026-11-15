'use client'

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { legalProcessKeys } from '@/features/processos/hooks/useLegalProcesses'
import {
  countActionRequiredMovements,
  getDailyActivity,
  getMovementCourts,
  getMovements,
  getProcessSilence,
  setMovementHandled,
  setMovementVisibility,
} from '../services/movements.service'
import type { MovementFilters } from '../utils/movementFilters'
import type { PageSize } from '@/lib/pagination'

/**
 * As chaves vivem SOB `legalProcessKeys.all` de propósito.
 *
 * Movimentação é a mesma tabela que o módulo Processos lê, e o que já
 * invalida processos passa a alcançar esta tela sem uma linha de código novo:
 * o realtime de notificações invalida `legalProcessKeys.all`
 * (useNotifications.ts:154) e as mutations de processo também. Mesma técnica do
 * `dashboardKeys`.
 */
export const movementKeys = {
  all: [...legalProcessKeys.all, 'movements'] as const,
  list: (filters: MovementFilters, pageIndex: number, pageSize: PageSize) =>
    [...legalProcessKeys.all, 'movements', 'list', filters, pageIndex, pageSize] as const,
  activity: (from: string, to: string) =>
    [...legalProcessKeys.all, 'movements', 'activity', from, to] as const,
  silence: () => [...legalProcessKeys.all, 'movements', 'silence'] as const,
  actionCount: () => [...legalProcessKeys.all, 'movements', 'action-count'] as const,
  courts: () => [...legalProcessKeys.all, 'movements', 'courts'] as const,
}

export function useInvalidateMovements() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: movementKeys.all })
}

/** `keepPreviousData` mantém a página anterior visível enquanto a próxima
 * carrega: sem isso, cada clique na paginação pisca a lista vazia e o scroll
 * salta para o topo. */
export function useMovements(filters: MovementFilters, pageIndex: number, pageSize: PageSize) {
  return useQuery({
    queryKey: movementKeys.list(filters, pageIndex, pageSize),
    queryFn: () => getMovements(filters, pageIndex, pageSize),
    placeholderData: keepPreviousData,
  })
}

/** Pré-carrega uma página quando o cursor chega no botão dela: o clique já a
 * encontra no cache. Uma página fresca não é buscada de novo. */
export function usePrefetchMovements() {
  const queryClient = useQueryClient()
  return (filters: MovementFilters, pageIndex: number, pageSize: PageSize) => {
    void queryClient.prefetchQuery({
      queryKey: movementKeys.list(filters, pageIndex, pageSize),
      queryFn: () => getMovements(filters, pageIndex, pageSize),
      staleTime: 30_000,
    })
  }
}

export function useDailyActivity(from: string, to: string) {
  return useQuery({
    queryKey: movementKeys.activity(from, to),
    queryFn: () => getDailyActivity(from, to),
  })
}

export function useProcessSilence() {
  return useQuery({
    queryKey: movementKeys.silence(),
    queryFn: getProcessSilence,
    // Dias sem movimentação não mudam de minuto a minuto, e o RPC varre todos
    // os processos ativos.
    staleTime: 5 * 60 * 1000,
  })
}

export function useMovementCourts() {
  return useQuery({
    queryKey: movementKeys.courts(),
    queryFn: getMovementCourts,
    staleTime: 10 * 60 * 1000,
  })
}

/** O badge do menu. `enabled` para o Sidebar chamar sem condicional. */
export function useActionRequiredMovementCount(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: movementKeys.actionCount(),
    queryFn: countActionRequiredMovements,
    enabled: options.enabled,
  })
}

export function useSetMovementHandled() {
  const invalidate = useInvalidateMovements()

  return useMutation({
    mutationFn: ({ id, handled }: { id: string; handled: boolean }) =>
      setMovementHandled(id, handled),
    onSuccess: (_data, { handled }) => {
      invalidate()
      toast.success(handled ? 'Movimentação tratada.' : 'Marcação removida.')
    },
    onError: () => toast.error('Não foi possível atualizar a movimentação.'),
  })
}

export function useSetMovementVisibility() {
  const invalidate = useInvalidateMovements()

  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) =>
      setMovementVisibility(id, hidden),
    onSuccess: (_data, { hidden }) => {
      invalidate()
      toast.success(hidden ? 'Oculto do cliente.' : 'Visível ao cliente.')
    },
    onError: () => toast.error('Não foi possível alterar a visibilidade.'),
  })
}
