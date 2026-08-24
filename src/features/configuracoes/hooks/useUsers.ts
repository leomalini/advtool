'use client'

import { useQuery } from '@tanstack/react-query'
import { getUsers } from '../services/users.service'

export const userKeys = {
  all: ['admin_users'] as const,
}

/** Só o admin consegue carregar: a rota responde 403 para os demais. Os
 * componentes que a usam já vivem atrás de `usuarios:manage`. */
export function useUsers() {
  return useQuery({
    queryKey: userKeys.all,
    queryFn: getUsers,
    staleTime: 30_000,
    // 403 e 503 não melhoram com insistência.
    retry: false,
  })
}
