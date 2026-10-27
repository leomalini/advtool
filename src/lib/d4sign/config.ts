// Server-side only — lê as chaves da D4Sign do ambiente. Nunca importar em
// componente 'use client': a tela recebe `D4SignSetupStatus`, montado na página.
import type { D4SignEnvironment, D4SignSetupStatus } from '@/types/d4sign.types'
import { d4signWebhookEndpoint } from './urls'

/**
 * Os dois hosts que a D4Sign documenta. Qualquer outro é recusado: as chaves
 * vão na query string de toda chamada, e um endereço digitado errado as
 * entregaria a outro servidor.
 */
const KNOWN_HOSTS: Record<string, D4SignEnvironment> = {
  'secure.d4sign.com.br': 'production',
  'sandbox.d4sign.com.br': 'sandbox',
}

/** Caminho da versão da API, quando a variável traz só o host. */
const API_PATH = '/api/v1'

export interface D4SignConfig {
  /** Base com `/api/v1`, sem barra no fim. */
  apiUrl: string
  environment: D4SignEnvironment
  tokenApi: string
  /** Só vai nas chamadas quando existe: "só precisa ser enviado caso esteja
   * habilitado em sua conta", diz a documentação. */
  cryptKey: string | null
}

function env(name: string): string | null {
  const value = process.env[name]?.trim()
  return value || null
}

function parseApiUrl(raw: string): { apiUrl: string; environment: D4SignEnvironment } | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const environment = KNOWN_HOSTS[url.hostname.toLowerCase()]
  if (url.protocol !== 'https:' || !environment) return null

  const path = url.pathname.replace(/\/+$/, '')
  return { apiUrl: `${url.origin}${path || API_PATH}`, environment }
}

/** As chaves da API, ou null quando falta alguma obrigatória. */
export function getD4SignConfig(): D4SignConfig | null {
  const rawUrl = env('D4SIGN_API_URL')
  const tokenApi = env('D4SIGN_TOKEN_API')
  if (!rawUrl || !tokenApi) return null

  const parsed = parseApiUrl(rawUrl)
  if (!parsed) return null

  return { ...parsed, tokenApi, cryptKey: env('D4SIGN_CRYPT_KEY') }
}

/** A "Secret Key MAC" da conta, que assina o UUID em cada aviso do webhook. */
export function d4signWebhookSecret(): string | null {
  return env('D4SIGN_WEBHOOK_SECRET')
}

/** O que a tela de Configurações mostra — nomes de variáveis, nunca valores. */
export function d4signSetupStatus(): D4SignSetupStatus {
  const rawUrl = env('D4SIGN_API_URL')
  const parsed = rawUrl ? parseApiUrl(rawUrl) : null

  const problems: string[] = []
  if (!rawUrl) problems.push('D4SIGN_API_URL não configurada')
  else if (!parsed) problems.push('D4SIGN_API_URL não é um endereço HTTPS da D4Sign')
  if (!env('D4SIGN_TOKEN_API')) problems.push('D4SIGN_TOKEN_API não configurada')

  return {
    environment: parsed?.environment ?? null,
    problems,
    hasCryptKey: env('D4SIGN_CRYPT_KEY') !== null,
    hasWebhookSecret: d4signWebhookSecret() !== null,
    webhookEndpoint: d4signWebhookEndpoint(),
  }
}
