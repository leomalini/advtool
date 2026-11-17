import { createAdminClient, hasServiceRoleKey } from '@/lib/supabase/admin'
import { getAiRuntimeConfig } from '../config/runtimeConfig'

export type BudgetCheck = { ok: true } | { ok: false; reason: 'exceeded' | 'unavailable' }

/**
 * O teto mensal de gasto com IA, em US$: o do painel de Configurações quando
 * ele assume o teto (`ai_settings.budget_source = 'panel'`), senão
 * `AI_MONTHLY_BUDGET_USD` (ver `config/runtimeConfig.ts`).
 *
 * Sem teto, não há limite no app — fica só o limite do Console da Anthropic.
 * Com ele, a rota soma o mês em `ai_usage` antes de chamar o modelo. Falha
 * fechada, como o limite do portal: valor inválido na variável, sem
 * service_role ou sem a migration 81 viram "indisponível", não "liberado" — um
 * teto que some em silêncio não é teto. O motivo fica no log `[ia-teto]`.
 *
 * A soma é a do que já foi gravado: um turno em andamento pode passar um
 * pouco do teto, nunca o seguinte.
 */
export async function checkAiBudget(): Promise<BudgetCheck> {
  const { monthlyBudget } = await getAiRuntimeConfig()
  if (monthlyBudget.kind === 'none') return { ok: true }
  if (monthlyBudget.kind === 'invalid') {
    console.error(
      '[ia-teto] AI_MONTHLY_BUDGET_USD inválida (use um número em US$):',
      monthlyBudget.raw,
    )
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
    return spent >= monthlyBudget.usd ? { ok: false, reason: 'exceeded' } : { ok: true }
  } catch (error) {
    console.error('[ia-teto] soma do mês falhou:', error)
    return { ok: false, reason: 'unavailable' }
  }
}
