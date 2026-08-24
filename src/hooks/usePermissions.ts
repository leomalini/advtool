'use client'

import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'
import { useProfiles } from './useProfiles'
import type { Action, AppRole, Resource, RolePermission } from '@/types/permission.types'

/**
 * Camada 3 do modelo de autorização (ver `docs/PLANEJAMENTO-MULTIUSUARIO.md` §4).
 *
 * ⚠️ Isto é conveniência de interface, NÃO segurança. O browser fala direto com
 * o Supabase, então esconder um botão não esconde o dado por trás dele — quem
 * barra de verdade são as policies de RLS. Nunca trate um `can()` false como
 * garantia de que a operação não vai acontecer.
 *
 * A matriz vem do banco, da mesma tabela que as policies consultam. É pequena
 * (~100 linhas) e praticamente imutável, daí o `staleTime: Infinity`.
 */

export const permissionKeys = {
  all: ['role_permissions'] as const,
}

async function getRolePermissions(): Promise<RolePermission[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('role_permissions')
    .select('role, resource, action')

  if (error) throw error
  return (data ?? []) as RolePermission[]
}

export function useRolePermissions() {
  return useQuery({
    queryKey: permissionKeys.all,
    queryFn: getRolePermissions,
    staleTime: Infinity,
  })
}

export interface Permissions {
  can: (resource: Resource, action: Action) => boolean
  role: AppRole | undefined
  isAdmin: boolean
  /** Enquanto true, `can()` responde false para tudo. Quem renderiza navegação
   * ou botões condicionais deve segurar o render em vez de mostrar o estado
   * negado — senão a tela pisca vazia e volta a preencher. */
  isLoading: boolean
}

export function usePermissions(): Permissions {
  const { user, loading: authLoading } = useAuth()
  const { data: profiles = [], isLoading: profilesLoading } = useProfiles()
  const { data: matrix = [], isLoading: matrixLoading } = useRolePermissions()

  const profile = user ? profiles.find((p) => p.id === user.id) : undefined

  const granted = useMemo(() => {
    // Conta desativada não tem permissão nenhuma, espelhando o filtro
    // `and p.is_active` de `public.can()`.
    if (!profile || profile.is_active === false) return new Set<string>()

    return new Set(
      matrix
        .filter((p) => p.role === profile.role)
        .map((p) => `${p.resource}:${p.action}`)
    )
  }, [matrix, profile])

  const can = useCallback(
    (resource: Resource, action: Action) => granted.has(`${resource}:${action}`),
    [granted]
  )

  return {
    can,
    role: profile?.role,
    isAdmin: profile?.role === 'admin',
    isLoading: authLoading || profilesLoading || matrixLoading,
  }
}
