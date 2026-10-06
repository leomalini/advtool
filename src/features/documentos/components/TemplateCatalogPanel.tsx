'use client'

import { Copy, PenLine, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  CATALOG_GROUP_LABELS,
  CATALOG_GROUPS,
  TEMPLATE_FIELD_CATALOG,
} from '../templates/catalog'

async function copyField(name: string) {
  try {
    await navigator.clipboard.writeText(`{${name}}`)
    toast.success(`{${name}} copiado — cole no Word.`)
  } catch {
    toast.error('Não foi possível copiar. Selecione e copie o nome à mão.')
  }
}

/** Referência dos campos para quem escreve o modelo no Word: os de cadastro,
 * com botão de copiar, e como funcionam os manuais e os de IA. */
export function TemplateCatalogPanel() {
  return (
    <Card className="h-fit">
      <CardContent className="space-y-4 p-4 text-sm">
        <div className="space-y-1">
          <p className="font-semibold">Como escrever o modelo</p>
          <p className="text-xs text-muted-foreground">
            No Word, escreva os campos entre chaves, exatamente como abaixo. A formatação do campo
            vale para o valor — para sair em maiúsculas, aplique Maiúsculas (Ctrl+Shift+A) no campo.
          </p>
        </div>

        <div className="space-y-1.5 text-xs">
          <p className="flex items-start gap-1.5">
            <PenLine className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-medium">Outro nome</span> ({'{valor_honorarios}'}) vira
              campo que você define: <span className="font-medium">manual</span> (digitado ao
              gerar) ou de IA. Com {'{valor_honorarios_extenso}'} ele sai também por extenso.
            </span>
          </p>
          <p className="flex items-start gap-1.5">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              <span className="font-medium">Campo de IA</span> ({'{fatos}'}, {'{pedidos}'}) é texto
              corrido: a IA redige com a instrução que você der, e você revisa antes de baixar.
            </span>
          </p>
        </div>

        {CATALOG_GROUPS.map((group) => (
          <div key={group} className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {CATALOG_GROUP_LABELS[group]}
            </p>
            <dl className="space-y-1">
              {TEMPLATE_FIELD_CATALOG.filter((field) => field.group === group).map((field) => (
                <div key={field.name} className="group flex items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <dt className="break-all font-mono text-xs">{`{${field.name}}`}</dt>
                    <dd className="text-xs text-muted-foreground">{field.description}</dd>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="opacity-60 group-hover:opacity-100"
                    aria-label={`Copiar {${field.name}}`}
                    onClick={() => void copyField(field.name)}
                  >
                    <Copy />
                  </Button>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
