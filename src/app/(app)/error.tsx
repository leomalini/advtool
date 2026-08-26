'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Fronteira de erro do app. Não existia nenhuma — qualquer falha de render no
 * servidor caía na tela genérica do Next, sem caminho de volta.
 *
 * O caso que a motivou: `requirePermission()` agora lança quando não consegue
 * AVALIAR a permissão, em vez de tratar o erro como negação e mandar a pessoa
 * para `/sem-acesso` dizendo que a conta foi desativada. A causa mais comum é
 * transitória (desvio de relógio entre os nós do Supabase, PGRST303), então
 * "tentar de novo" costuma bastar.
 *
 * `unstable_retry` e não `reset`: o primeiro re-busca e re-renderiza o segmento,
 * que é o que resolve uma falha transitória; o segundo só limpa o estado do
 * boundary e reapresentaria o mesmo erro.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('[app] erro não tratado:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/12 text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </div>

      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Algo deu errado</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Não foi possível carregar esta tela. Costuma ser passageiro — tente de novo. Se
          insistir, avise quem administra o AdvTool.
        </p>
      </div>

      <Button onClick={() => unstable_retry()}>
        <RotateCw className="mr-2 h-4 w-4" />
        Tentar de novo
      </Button>

      {/* O digest é o que liga esta tela à linha correspondente no log do
          servidor — em produção a mensagem do erro não chega ao browser. */}
      {error.digest && (
        <p className="text-xs text-muted-foreground/70">Código: {error.digest}</p>
      )}
    </div>
  )
}
