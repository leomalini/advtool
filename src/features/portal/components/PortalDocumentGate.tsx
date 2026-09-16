'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { maskDocument } from '@/utils/format'
import { onlyDigits } from '@/lib/clientPortal/token'
import { useVerifyPortalDocument } from '../hooks/usePortal'

/**
 * O segundo fator, do lado de quem digita.
 *
 * É a primeira coisa que o cliente vê ao abrir o link, então a tela explica
 * POR QUE está pedindo o documento. Sem a frase, o pedido parece o começo de um
 * cadastro — exatamente o que o portal promete não ser — e a pessoa desiste ou
 * liga para o escritório.
 */
export function PortalDocumentGate({
  token,
  documentKind,
}: {
  token: string
  documentKind: 'cpf' | 'cnpj'
}) {
  const [value, setValue] = useState('')
  const verify = useVerifyPortalDocument(token)

  const label = documentKind === 'cnpj' ? 'CNPJ' : 'CPF'
  const expectedLength = documentKind === 'cnpj' ? 14 : 11
  const isComplete = onlyDigits(value).length === expectedLength

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!isComplete || verify.isPending) return
    verify.mutate(onlyDigits(value))
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="size-6" aria-hidden />
        </span>
        <h1 className="text-xl font-semibold">Acompanhe seu processo</h1>
        <p className="text-sm text-muted-foreground">
          Para proteger seus dados, confirme o {label} do titular. Este link é
          pessoal — não compartilhe.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="portal-document">{label}</Label>
          <Input
            id="portal-document"
            /* `inputMode` numérico abre o teclado de números no celular, que é
             * de onde quase todo acesso vem — o link chega por mensagem. */
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder={documentKind === 'cnpj' ? '00.000.000/0000-00' : '000.000.000-00'}
            value={value}
            onChange={(event) => setValue(maskDocument(event.target.value))}
            aria-invalid={verify.isError || undefined}
          />
        </div>

        {verify.isError && (
          <p role="alert" className="text-sm text-destructive">
            {verify.error instanceof Error
              ? verify.error.message
              : 'Não foi possível verificar o documento.'}
          </p>
        )}

        <Button type="submit" disabled={!isComplete || verify.isPending}>
          {verify.isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Acessar
        </Button>
      </form>
    </div>
  )
}
