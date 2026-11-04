import type { SupabaseClient } from '@supabase/supabase-js'
import { feeFromBase, formatCurrency, formatPercent } from '@/types/financialEntry.types'
import { STATED_AMOUNT_KIND_LABELS, type StatedAmountKind } from '@/types/publication.types'

interface AssessableInput {
  publicationId: string
  legalProcessId: string
  amount: number
  kind: StatedAmountKind
}

interface ToAssessRow {
  id: string
  description: string
  percent: number
}

/** Where the bell opens: the process, on Financeiro, with "Apurar" open. The
 * value itself stays out of the URL: the dialog reads it from the triage. */
export function assessableLink({
  legalProcessId,
  entryId,
  publicationId,
}: {
  legalProcessId: string
  entryId: string
  publicationId: string
}): string {
  const params = new URLSearchParams({
    aba: 'financeiro',
    apurar: entryId,
    publicacao: publicationId,
  })
  return `/processos/${legalProcessId}?${params.toString()}`
}

/**
 * A publication fixed a value on a process with a success fee to assess: one
 * notice per success fee, with the sum ready. Only a notice — someone reads the
 * text and confirms in "Apurar" (docs/financeiro.md). Seen by whoever has
 * `financeiro:view`. Returns how many were sent.
 */
export async function notifyAssessableSuccessFees(
  admin: SupabaseClient,
  { publicationId, legalProcessId, amount, kind }: AssessableInput,
): Promise<number> {
  const { data, error } = await admin
    .from('financial_entries')
    .select('id, description, percent')
    .eq('legal_process_id', legalProcessId)
    .eq('category', 'exito')
    .eq('status', 'pendente')
    .not('percent', 'is', null)
    .is('base_amount', null)
  if (error) throw error

  let sent = 0
  for (const entry of (data ?? []) as ToAssessRow[]) {
    const link = assessableLink({ legalProcessId, entryId: entry.id, publicationId })

    // A collection that runs twice must not notify twice.
    const { data: existing, error: existingError } = await admin
      .from('notifications')
      .select('id')
      .eq('kind', 'exito_apuravel')
      .eq('link', link)
      .limit(1)
    if (existingError) throw existingError
    if (existing && existing.length > 0) continue

    const percent = Number(entry.percent)
    const { error: insertError } = await admin.from('notifications').insert({
      kind: 'exito_apuravel',
      resource: 'financeiro',
      title: `Êxito pode ser apurado: ${entry.description}`.slice(0, 200),
      body:
        `${STATED_AMOUNT_KIND_LABELS[kind]} de ${formatCurrency(amount)} na publicação: ` +
        `${formatPercent(percent)} dá ${formatCurrency(feeFromBase(amount, percent))}. ` +
        'Confira o texto antes de apurar.',
      link,
      entity_type: 'financial_entry',
      entity_id: entry.id,
      source: 'triagem',
    })
    if (insertError) throw insertError
    sent += 1
  }
  return sent
}
