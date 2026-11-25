import type {
  BillingSeries,
  BillingSeriesCategory,
  BillingSeriesItem,
} from '@/types/billingSeries.types'
import { json, request } from './billings.service'

/**
 * As mensalidades (migration 98). Tudo por rota: `billing_series` não tem
 * policy de escrita, e criar já gera o primeiro ciclo no servidor.
 */

const BASE = '/api/financeiro/mensalidades'

export interface SeriesCycleOutcome {
  dueDate: string
  entryId: string
  billingError: string | null
}

interface SeriesBody {
  items?: BillingSeriesItem[]
  series?: BillingSeries
  outcomes?: SeriesCycleOutcome[]
}

export interface SeriesSaved {
  series: BillingSeries
  outcomes: SeriesCycleOutcome[]
}

export interface NewBillingSeries {
  clientId: string
  legalProcessId: string | null
  description: string
  clientDescription: string
  category: BillingSeriesCategory
  amount: number
  startDate: string
  endDate: string | null
  remindersEnabled: boolean
  lateFeePercent: number | null
  monthlyInterestPercent: number | null
  pixDiscountPercent: number | null
}

export type BillingSeriesChanges = Partial<
  Pick<
    NewBillingSeries,
    | 'description'
    | 'clientDescription'
    | 'amount'
    | 'endDate'
    | 'remindersEnabled'
    | 'lateFeePercent'
    | 'monthlyInterestPercent'
    | 'pixDiscountPercent'
  >
>

export type BillingSeriesAction = 'pause' | 'resume' | 'end'

function saved(body: SeriesBody, fallback: string): SeriesSaved {
  if (!body.series) throw new Error(fallback)
  return { series: body.series, outcomes: body.outcomes ?? [] }
}

export async function listBillingSeries(): Promise<BillingSeriesItem[]> {
  const body = await request<SeriesBody>(
    BASE,
    { method: 'GET' },
    'Não foi possível carregar as mensalidades.',
  )
  return body.items ?? []
}

export async function createBillingSeries(input: NewBillingSeries): Promise<SeriesSaved> {
  const fallback = 'Não foi possível criar a mensalidade.'
  return saved(await request<SeriesBody>(BASE, json('POST', input), fallback), fallback)
}

export async function updateBillingSeries(
  id: string,
  changes: BillingSeriesChanges | { action: BillingSeriesAction },
): Promise<SeriesSaved> {
  const fallback = 'Não foi possível alterar a mensalidade.'
  const path = `${BASE}/${encodeURIComponent(id)}`
  return saved(await request<SeriesBody>(path, json('PATCH', changes), fallback), fallback)
}
