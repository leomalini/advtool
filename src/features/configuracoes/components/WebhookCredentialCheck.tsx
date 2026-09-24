'use client'

import { useState, type FormEvent } from 'react'
import { CheckCircle2, KeyRound, Loader2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useCheckWebhookCredential } from '../hooks/useWebhookEvents'
import type { CredentialFinding, CredentialKind } from '@/lib/buscaprocessos/signature'

/**
 * Cola o valor que a conta da BuscaProcessos mostra e descobre se o servidor
 * tem o mesmo.
 *
 * A variável da Vercel não se lê de volta. Sem isto, a única forma de saber que
 * ela estava errada era esperar uma entrega e ler o log — e foi assim que um
 * caractere a menos no token deixou duas semanas de intimações do lado de fora.
 * A conferência é a mesma que o endpoint faz, então "confere" quer dizer "o
 * endpoint aceita".
 */

const KIND_LABEL: Record<CredentialKind, string> = {
  token: 'Token de Autorização Bearer',
  secret: 'Chave Secreta HMAC',
}

const ENV_NAME: Record<CredentialKind, string> = {
  token: 'BUSCA_PROCESSOS_WEBHOOK_TOKEN',
  secret: 'BUSCA_PROCESSOS_WEBHOOK_SECRET',
}

function explain(
  finding: CredentialFinding,
  kind: CredentialKind,
  lengths: { configured: number; provided: number },
): string {
  const env = ENV_NAME[kind]
  const sizes = `a variável tem ${lengths.configured} caracteres, o valor colado tem ${lengths.provided}`

  switch (finding) {
    case 'igual':
      return 'Confere. O endpoint aceita entregas com este valor.'
    case 'falta_primeiro':
      return `${env} está sem o PRIMEIRO caractere (${sizes}). A seleção deixou o início para trás ao copiar.`
    case 'falta_ultimo':
      return `${env} está sem o ÚLTIMO caractere (${sizes}).`
    case 'configurado_incompleto':
      return `${env} tem só um pedaço deste valor (${sizes}).`
    case 'configurado_com_sobra':
      return `${env} tem este valor e mais alguma coisa em volta (${sizes}).`
    case 'valor_da_outra_variavel':
      return `Este valor é o da outra credencial: ele está em ${
        ENV_NAME[kind === 'token' ? 'secret' : 'token']
      }, não em ${env}. Confira se os campos não foram trocados.`
    case 'valor_da_chave_da_api':
      return 'Este valor é a chave da API (BUSCA_PROCESSOS_API_KEY), não a credencial do webhook.'
    case 'diferente':
      return `${env} tem outro valor (${sizes}).`
  }
}

export function WebhookCredentialCheck() {
  const [kind, setKind] = useState<CredentialKind>('token')
  const [value, setValue] = useState('')
  const check = useCheckWebhookCredential()

  function submit(event: FormEvent) {
    event.preventDefault()
    if (value.trim()) check.mutate({ kind, value })
  }

  const result = check.data
  const matched = result?.configured === true && result.matches

  return (
    <form onSubmit={submit} className="mt-4 space-y-2 border-t border-border pt-4">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <KeyRound className="h-3 w-3" />
        Conferir credencial
      </p>
      <p className="text-xs text-muted-foreground">
        Cole o valor exatamente como aparece na conta da BuscaProcessos. Ele é comparado com o do
        servidor e não fica gravado em lugar nenhum.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={kind}
          onValueChange={(next) => {
            setKind(next as CredentialKind)
            check.reset()
          }}
        >
          <SelectTrigger className="h-8 w-[230px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="token">{KIND_LABEL.token}</SelectItem>
            <SelectItem value="secret">{KIND_LABEL.secret}</SelectItem>
          </SelectContent>
        </Select>

        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            check.reset()
          }}
          placeholder="Cole aqui"
          className="h-8 min-w-[220px] flex-1 font-mono text-xs"
        />

        <Button type="submit" size="sm" disabled={check.isPending || !value.trim()}>
          {check.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Conferir
        </Button>
      </div>

      {result && (
        <p
          className={cn(
            'flex items-start gap-1.5 text-xs',
            matched ? 'text-success' : 'text-destructive',
          )}
        >
          {matched ? (
            <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0" />
          ) : (
            <XCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          )}
          <span>
            {result.configured
              ? explain(result.finding, kind, {
                  configured: result.configuredLength,
                  provided: result.providedLength,
                })
              : `${ENV_NAME[kind]} não está configurada no servidor.`}
            {result.configured && !result.matches && (
              <> Corrija na Vercel e publique de novo — a variável só vale no próximo deploy.</>
            )}
          </span>
        </p>
      )}
    </form>
  )
}
