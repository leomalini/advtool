'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TemplatesContent } from '@/features/documentos/components/TemplatesContent'
import { ContractsContent } from './ContractsContent'

const TABS = ['contratos', 'modelos'] as const
type TabValue = (typeof TABS)[number]

/** /contratos: os contratos e os modelos de contrato. `?aba=modelos` abre
 * direto nos modelos (link da tela de geração e do Assistente). */
export function ContratosTabs({ initialTab }: { initialTab?: string }) {
  const defaultTab: TabValue = TABS.includes(initialTab as TabValue)
    ? (initialTab as TabValue)
    : 'contratos'

  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="contratos">Contratos</TabsTrigger>
        <TabsTrigger value="modelos">Modelos</TabsTrigger>
      </TabsList>
      <TabsContent value="contratos">
        <ContractsContent />
      </TabsContent>
      <TabsContent value="modelos">
        <TemplatesContent scope="contratos" />
      </TabsContent>
    </Tabs>
  )
}
