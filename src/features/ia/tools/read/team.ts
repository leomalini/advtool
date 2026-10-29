import { tool } from 'ai'
import { z } from 'zod'
import { getRoleLabel } from '@/utils/profile'
import type { AppRole } from '@/types/permission.types'
import { toolError, type ToolClient } from '../shared'

/** `userId`: quem pergunta, marcado na lista com `voce` — é como o modelo
 * resolve "minhas tarefas" e "para mim" sem o id ir para o `system`. */
export function createTeamTools(supabase: ToolClient, userId: string) {
  return {
    membros_do_escritorio: tool({
      description:
        'Membros ativos do escritório (id, nome, perfil, OAB). Quem está perguntando vem com ' +
        '`voce: true`. Use para resolver nomes em `responsavel_id` — por exemplo, "atribui ' +
        'para a Ana" — e para "eu", "meu", "minhas".',
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
            voce: p.id === userId,
          })),
        }
      },
    }),
  }
}
