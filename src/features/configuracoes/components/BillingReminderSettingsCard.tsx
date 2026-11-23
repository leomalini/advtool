'use client'

import { useState } from 'react'
import { BellRing, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissions } from '@/hooks/usePermissions'
import { cn } from '@/lib/utils'
import {
  DEFAULT_REMINDER_OFFSETS,
  MAX_REMINDER_STEPS,
  describeOffsets,
  normalizeOffsets,
} from '@/lib/billing/schedule'
import { useOfficeSettings, useSaveBillingReminderOffsets } from '../hooks/useOfficeSettings'

/** Os dias que dá para escolher: o bastante para qualquer régua sensata, sem
 * campo livre para errar o sinal. */
const BEFORE = [-15, -10, -7, -5, -3, -2, -1]
const AFTER = [1, 2, 3, 5, 7, 10, 15, 20, 30]

function sameDays(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * Os dias da régua de cobrança (migration 96), em Configurações →
 * Pagamentos. Valem para todas as cobranças com lembretes, inclusive as já
 * ligadas: a régua é recalculada a cada dia.
 */
export function BillingReminderSettingsCard() {
  const { data: settings, isLoading } = useOfficeSettings()
  const { can } = usePermissions()
  const canEdit = can('configuracoes', 'manage')

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BellRing className="h-4 w-4 text-muted-foreground" />
          Lembretes de cobrança
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Os dias em que a cobrança com lembretes ligados entra na fila, em relação ao vencimento.
          Além deles, há sempre o aviso ao ligar. Domingo e feriado nacional passam para o dia
          seguinte.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          // Montado só depois de carregar: começa com o valor do banco.
          <OffsetsForm
            current={normalizeOffsets(settings?.billing_reminder_offsets ?? DEFAULT_REMINDER_OFFSETS)}
            canEdit={canEdit}
          />
        )}
      </CardContent>
    </Card>
  )
}

function OffsetsForm({ current, canEdit }: { current: number[]; canEdit: boolean }) {
  const save = useSaveBillingReminderOffsets()
  const [days, setDays] = useState<number[]>(current)
  const changed = !sameDays(days, current)
  const full = days.length >= MAX_REMINDER_STEPS

  function toggle(offset: number) {
    setDays((value) =>
      value.includes(offset)
        ? value.filter((day) => day !== offset)
        : normalizeOffsets([...value, offset]),
    )
  }

  function chip(offset: number, label: string) {
    const on = days.includes(offset)
    return (
      <Button
        key={offset}
        type="button"
        size="xs"
        variant={on ? 'default' : 'outline'}
        aria-pressed={on}
        disabled={!canEdit || (!on && full)}
        onClick={() => toggle(offset)}
        className={cn('tabular-nums')}
      >
        {label}
      </Button>
    )
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Antes do vencimento</p>
        <div className="flex flex-wrap gap-1.5">
          {BEFORE.map((offset) => chip(offset, `${-offset} ${offset === -1 ? 'dia' : 'dias'}`))}
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">No dia</p>
        <div className="flex flex-wrap gap-1.5">{chip(0, 'No vencimento')}</div>
      </div>
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">Depois do vencimento</p>
        <div className="flex flex-wrap gap-1.5">
          {AFTER.map((offset) => chip(offset, `${offset} ${offset === 1 ? 'dia' : 'dias'}`))}
        </div>
      </div>

      <p className="text-xs">
        {days.length > 0 ? (
          <>Hoje: {describeOffsets(days)}.</>
        ) : (
          <span className="text-destructive">Escolha pelo menos um dia.</span>
        )}
        {full && (
          <span className="text-muted-foreground"> Máximo de {MAX_REMINDER_STEPS} dias.</span>
        )}
      </p>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!changed || days.length === 0 || save.isPending}
            onClick={() => save.mutate(days)}
          >
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            Salvar os dias
          </Button>
          {!sameDays(days, DEFAULT_REMINDER_OFFSETS) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => setDays([...DEFAULT_REMINDER_OFFSETS])}
            >
              Voltar ao padrão
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
