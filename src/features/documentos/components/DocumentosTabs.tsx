'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DocumentosContent } from './DocumentosContent'
import { TemplatesContent } from './TemplatesContent'

/** /documentos: os arquivos do escritório e os modelos usados pelo Assistente. */
export function DocumentosTabs() {
  return (
    <Tabs defaultValue="documentos" className="space-y-4">
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
