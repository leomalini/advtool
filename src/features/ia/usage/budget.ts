import { z } from 'zod'
import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'

export type BudgetCheck = { ok: true } | { ok: false; reason: 'exceeded' | 'unavailable' }

const budgetSchema = z.coerce.number().positive()

/**
 * O teto mensal de gasto com IA (`AI_MONTHLY_BUDGET_USD`, em US$).
 *
 * Sem a variável, não há teto no app — fica só o limite do Console da
 * Anthropic. Com ela, a rota soma o mês em `ai_usage` antes de chamar o
 * modelo. Falha fechada, como o limite do portal: valor inválido, sem
 * service_role ou sem a migration 81 viram "indisponível", não "liberado" — um
 * teto que some em silêncio não é teto. O motivo fica no log `[ia-teto]`.
 *
 * A soma é a do que já foi gravado: um turno em andamento pode passar um
 * pouco do teto, nunca o seguinte.
 */
export async function checkAiBudget(): Promise<BudgetCheck> {
  const raw = process.env.AI_MONTHLY_BUDGET_USD?.trim()
  if (!raw) return { ok: true }

  const budget = budgetSchema.safeParse(raw)
  if (!budget.success) {
    console.error('[ia-teto] AI_MONTHLY_BUDGET_USD inválida (use um número em US$):', raw)
    return { ok: false, reason: 'unavailable' }
  }
  if (!hasServiceRoleKey()) {
    console.error('[ia-teto] SUPABASE_SERVICE_ROLE_KEY ausente: não há como somar o mês.')
    return { ok: false, reason: 'unavailable' }
  }

  try {
    const { data, error } = await createAdminClient().rpc('ai_usage_month_cost_usd')
    if (error) {
      console.error('[ia-teto] soma do mês falhou:', error.code, error.message)
      return { ok: false, reason: 'unavailable' }
    }
    const spent = Number(data)
    if (!Number.isFinite(spent)) {
      console.error('[ia-teto] soma do mês veio inválida:', data)
      return { ok: false, reason: 'unavailable' }
    }
    return spent >= budget.data ? { ok: false, reason: 'exceeded' } : { ok: true }
  } catch (error) {
    console.error('[ia-teto] soma do mês falhou:', error)
    return { ok: false, reason: 'unavailable' }
  }
}
