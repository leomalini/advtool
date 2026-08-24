'use client'

import { usePermissions } from '@/hooks/usePermissions'
import type { Action, Resource } from '@/types/permission.types'

interface CanProps {
  resource: Resource
  action: Action
  children: React.ReactNode
  /** O que mostrar no lugar quando a permissão falta. Por padrão nada — a
   * ausência silenciosa costuma ser melhor que um aviso de "você não pode". */
  fallback?: React.ReactNode
}

/**
 * Renderiza `children` só se o perfil atual tiver a permissão.
 *
 * ⚠️ Cosmético. Esconder o botão não impede a chamada — quem impede é a RLS.
 * Ver `docs/PLANEJAMENTO-MULTIUSUARIO.md` §4.
 */
export function Can({ resource, action, children, fallback = null }: CanProps) {
  const { can, isLoading } = usePermissions()

  // Enquanto carrega, nada. Mostrar o fallback aqui faria a tela piscar o
  // estado negado antes de resolver o correto.
  if (isLoading) return null

  return <>{can(resource, action) ? children : fallback}</>
}
