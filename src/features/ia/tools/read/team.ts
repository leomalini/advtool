import { tool } from 'ai'
import { z } from 'zod'
import { getRoleLabel } from '@/utils/profile'
import type { AppRole } from '@/types/permission.types'
import { toolError, type ToolClient } from '../shared'

export function createTeamTools(supabase: ToolClient) {
  return {
    membros_do_escritorio: tool({
      description:
        'Membros ativos do escritório (id, nome, perfil, OAB). Use para resolver nomes em ' +
        '`responsavel_id` — por exemplo, "atribui para a Ana".',
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, role, oab_number')
          .eq('is_active', true)
          .order('full_name')
        if (error) return toolError('a equipe', error)
        return {
          membros: (data ?? []).map((p) => ({
            id: p.id,
            nome: p.full_name,
            perfil: getRoleLabel(p.role as AppRole),
            oab: p.oab_number,
          })),
        }
      },
    }),
  }
}
