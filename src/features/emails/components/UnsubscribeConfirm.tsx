'use client'

import { useState } from 'react'
import { CircleAlert, CircleCheck, Loader2, MailX } from 'lucide-react'
import { Button } from '@/components/ui/button'

type State = 'idle' | 'sending' | 'done' | 'error'

/**
 * A confirmação do descadastro, na página pública `/descadastrar`.
 *
 * Abrir a página não desliga nada — só o botão. Antivírus de e-mail visitam os
 * links das mensagens sozinhos, e um link que desligasse ao ser aberto
 * desligaria o resumo de todo mundo que usa um.
 */
export function UnsubscribeConfirm({ clientId, token }: { clientId: string; token: string }) {
  const [state, setState] = useState<State>('idle')

  async function confirm() {
    setState('sending')
    try {
      const params = new URLSearchParams({ c: clientId, t: token })
      const response = await fetch(`/api/email/descadastrar?${params.toString()}`, { method: 'POST' })
      setState(response.ok ? 'done' : 'error')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <Frame icon={<CircleCheck className="size-6 text-success" aria-hidden />} title="Pronto">
        <p className="text-sm text-muted-foreground">
          Você não vai mais receber o resumo diário dos seus processos por e-mail. O link de
          acompanhamento continua funcionando, e o escritório segue à disposição.
        </p>
        <p className="text-xs text-muted-foreground">Pode fechar esta página.</p>
      </Frame>
    )
  }

  return (
    <Frame icon={<MailX className="size-6 text-muted-foreground" aria-hidden />} title="Parar o resumo por e-mail?">
      <p className="text-sm text-muted-foreground">
        Você deixa de receber o resumo diário com o andamento dos seus processos. Nada muda no
        acompanhamento: o link continua funcionando, e o escritório continua cuidando de tudo.
      </p>
      {state === 'error' && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <CircleAlert className="size-4" aria-hidden />
          Não foi possível concluir. Tente de novo.
        </p>
      )}
      <Button onClick={confirm} disabled={state === 'sending'}>
        {state === 'sending' && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden />}
        Não quero mais receber
      </Button>
    </Frame>
  )
}

/** O mesmo cartão centrado de `/pagamento/retorno`: a outra página pública
 * que o cliente abre sem sessão. */
function Frame({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-muted">{icon}</div>
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
    </div>
  )
}
