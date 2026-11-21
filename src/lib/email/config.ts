// Server-side only — lê a chave do Resend do ambiente. Nunca importar em
// componente 'use client': a tela recebe `EmailSetupStatus`, montado na página.
import { publicAppBaseUrl } from '@/lib/appUrl'
import { SIMPLE_EMAIL } from '@/utils/clientContacts'
import type { EmailSetupStatus } from '@/types/emailMessage.types'

/** O nosso endpoint de avisos do Resend. O caminho é fixo; só a base vem do
 * ambiente (ver `lib/appUrl.ts`). */
export const RESEND_WEBHOOK_PATH = '/api/webhooks/resend'

export interface EmailConfig {
  apiKey: string
  /** Só o endereço; o nome exibido vem do cadastro do escritório. */
  fromAddress: string
  /** Quando existe, TODO envio vai para cá (ver `send.ts`). */
  sandboxTo: string | null
  webhookSecret: string | null
}

function env(name: string): string | null {
  const value = process.env[name]?.trim()
  return value || null
}

/**
 * Produção é a da Vercel (`VERCEL_ENV`). Fora dela — `pnpm dev`, `next start`
 * local, deploy de preview — o envio exige `EMAIL_SANDBOX_TO`: um teste não
 * pode mandar e-mail a cliente de verdade só porque a chave estava no `.env`.
 */
function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production'
}

function inspect() {
  const apiKey = env('RESEND_API_KEY')
  const rawFrom = env('EMAIL_FROM')
  const rawSandbox = env('EMAIL_SANDBOX_TO')
  const isProduction = isProductionRuntime()

  const fromAddress = rawFrom && SIMPLE_EMAIL.test(rawFrom) ? rawFrom : null
  const sandboxTo = rawSandbox && SIMPLE_EMAIL.test(rawSandbox) ? rawSandbox : null

  const problems: string[] = []
  if (!apiKey) problems.push('RESEND_API_KEY não configurada')
  if (!rawFrom) problems.push('EMAIL_FROM não configurada')
  else if (!fromAddress) problems.push('EMAIL_FROM não é um endereço de e-mail')
  // Inválida falha FECHADO: tratada como ausente, ela deixaria o envio seguir
  // para o cliente justamente no ambiente em que alguém quis desviá-lo.
  if (rawSandbox && !sandboxTo) problems.push('EMAIL_SANDBOX_TO não é um endereço de e-mail')
  if (!isProduction && !rawSandbox) {
    problems.push('Fora da produção, EMAIL_SANDBOX_TO é obrigatória (para onde vão os testes)')
  }

  return { apiKey, fromAddress, sandboxTo, isProduction, problems }
}

/** As credenciais, ou null quando falta algo que impede o envio. */
export function getEmailConfig(): EmailConfig | null {
  const { apiKey, fromAddress, sandboxTo, problems } = inspect()
  if (problems.length > 0 || !apiKey || !fromAddress) return null
  return { apiKey, fromAddress, sandboxTo, webhookSecret: env('RESEND_WEBHOOK_SECRET') }
}

/** O segredo que assina os avisos do Resend (`whsec_…`). */
export function resendWebhookSecret(): string | null {
  return env('RESEND_WEBHOOK_SECRET')
}

export function resendWebhookEndpoint(): string | null {
  const base = publicAppBaseUrl()
  return base ? `${base}${RESEND_WEBHOOK_PATH}` : null
}

/** O que a tela de Configurações mostra — nomes de variáveis, nunca valores
 * secretos. Remetente e endereço de teste não são segredo. */
export function emailSetupStatus(): EmailSetupStatus {
  const { fromAddress, sandboxTo, isProduction, problems } = inspect()
  return {
    problems,
    fromAddress,
    sandboxTo,
    isProduction,
    hasWebhookSecret: resendWebhookSecret() !== null,
    webhookEndpoint: resendWebhookEndpoint(),
  }
}

/** Para a tela desabilitar os botões de envio sem conhecer o motivo. */
export function isEmailConfigured(): boolean {
  return getEmailConfig() !== null
}
