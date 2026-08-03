'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from './useAuth'
import type { Profile } from '@/types/common.types'

async function getProfiles(): Promise<Profile[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name')
  if (error) throw error
  return data as Profile[]
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: getProfiles,
    staleTime: Infinity,
  })
}

/** Profile row of the signed-in user, resolved from the already-cached
 * profiles list — auth only gives us the id/email. */
export function useCurrentProfile(): Profile | undefined {
  const { user } = useAuth()
  const { data: profiles = [] } = useProfiles()
  return user ? profiles.find((p) => p.id === user.id) : undefined
}
