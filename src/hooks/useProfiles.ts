'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
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
