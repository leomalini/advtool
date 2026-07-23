import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { ADVOGADOS, CASOS } from '@/data/mock'
import { Users } from 'lucide-react'

interface AdvogadoStat {
  id: string
  nome: string
  iniciais: string
  cor: string
  oab: string
  total: number
  ativos: number
  negociacao: number
}

export function AdvogadosCard() {
  const stats: AdvogadoStat[] = ADVOGADOS.map((adv) => {
    const casosDele = CASOS.filter((c) => c.advogadoId === adv.id)
    const ativos = casosDele.filter((c) => c.workflowId === 'wf-processos').length
    const negociacao = casosDele.filter((c) => c.workflowId === 'wf-negociacao').length
    return {
      ...adv,
      total: casosDele.length,
      ativos,
      negociacao,
    }
  })

  const maxTotal = Math.max(...stats.map((s) => s.total), 1)

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Users className="h-4 w-4 text-accent-foreground" />
          Carga por Advogado
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {stats.map((adv) => {
          const progresso = Math.round((adv.total / maxTotal) * 100)

          return (
            <div key={adv.id} className="space-y-2">
              {/* Header do advogado */}
              <div className="flex items-center gap-2.5">
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold',
                    adv.cor
                  )}
                >
                  {adv.iniciais}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-none truncate">{adv.nome}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{adv.oab}</p>
                </div>
                <span className="text-base font-bold tabular-nums">{adv.total}</span>
              </div>

              {/* Barra de progresso */}
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-foreground transition-all duration-500"
                  style={{ width: `${progresso}%` }}
                />
              </div>

              {/* Breakdown de status */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-info" />
                  <span className="text-xs text-muted-foreground">
                    {adv.ativos} em processo
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full bg-chart-2" />
                  <span className="text-xs text-muted-foreground">
                    {adv.negociacao} em negociação
                  </span>
                </div>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
