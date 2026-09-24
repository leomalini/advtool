'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DocumentosContent } from './DocumentosContent'
import { TemplatesContent } from './TemplatesContent'

const TABS = ['documentos', 'modelos'] as const
type TabValue = (typeof TABS)[number]

/** /documentos: os arquivos do escritório e os modelos de documento.
 * `?aba=modelos` abre direto nos modelos (link do Assistente e da tela de
 * geração). */
export function DocumentosTabs({ initialTab }: { initialTab?: string }) {
  const defaultTab: TabValue = TABS.includes(initialTab as TabValue)
    ? (initialTab as TabValue)
    : 'documentos'

  return (
    <Tabs defaultValue={defaultTab} className="space-y-4">
      <TabsList>
        <TabsTrigger value="documentos">Documentos</TabsTrigger>
        <TabsTrigger value="modelos">Modelos</TabsTrigger>
      </TabsList>
      <TabsContent value="documentos">
        <DocumentosContent />
      </TabsContent>
      <TabsContent value="modelos">
        <TemplatesContent />
      </TabsContent>
    </Tabs>
  )
}
