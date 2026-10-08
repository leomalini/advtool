'use client'

import { Users } from 'lucide-react'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WorkloadList } from './WorkloadList'
import { CasesByAreaChart } from './CasesByAreaChart'

interface TeamCardProps {
  className?: string
}

/**
 * Who carries what — cases and tasks per person — and, in the second tab, the
 * cases per legal area. Two cards that were side by side became one: both
 * answer "how is the work spread", one by person and one by area.
 */
export function TeamCard({ className }: TeamCardProps) {
  return (
    <Card className={className}>
      {/* gap-6: o mesmo espaço que o Card dá entre cabeçalho e conteúdo, que o
          Tabs (gap-2) encolheria. */}
      <Tabs defaultValue="pessoas" className="gap-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-accent-foreground" />
            Equipe
          </CardTitle>
          <CardAction>
            <TabsList className="h-7">
              <TabsTrigger value="pessoas" className="px-2 text-xs">
                Pessoas
              </TabsTrigger>
              <TabsTrigger value="areas" className="px-2 text-xs">
                Áreas
              </TabsTrigger>
            </TabsList>
          </CardAction>
        </CardHeader>
        <CardContent>
          <TabsContent value="pessoas">
            <WorkloadList />
          </TabsContent>
          <TabsContent value="areas">
            <CasesByAreaChart />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  )
}
