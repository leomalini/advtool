/**
 * O que a tela precisa saber da D4Sign. Sem nada de servidor: as chaves ficam
 * em `lib/d4sign/config.ts`, e a página monta `D4SignSetupStatus` antes de
 * renderizar. Plano em `docs/integracao-d4sign.md`.
 */

export type D4SignEnvironment = 'sandbox' | 'production'

/**
 * Como a configuração do ambiente está, sem nenhum valor: só nomes de
 * variáveis e o que dá para deduzir deles.
 */
export interface D4SignSetupStatus {
  /** Pelo host de `D4SIGN_API_URL`. Null quando falta ou não é da D4Sign. */
  environment: D4SignEnvironment | null
  /** Variáveis que faltam ou estão erradas — os nomes, nunca os valores. */
  problems: string[]
  /** `D4SIGN_CRYPT_KEY` só é obrigatória quando a conta a exige. */
  hasCryptKey: boolean
  /** Sem ela, todo aviso que chega é recusado: não há como conferir o HMAC. */
  hasWebhookSecret: boolean
  /** Para onde a D4Sign manda os avisos. Null sem endereço HTTPS público. */
  webhookEndpoint: string | null
}

/** Um cofre da conta — `GET /safes`. */
export interface D4SignSafe {
  uuid: string
  name: string
}

/**
 * Para que cofre vai cada envio. O escritório organiza a D4Sign com um cofre
 * por tipo de documento (spike, 2026-10-22): o app sugere o cofre pelo tipo do
 * envio, e quem envia pode trocar — um aditivo vai para "Aditivos", por
 * exemplo. O que não tem cofre próprio vai para o `padrao`.
 */
export const D4SIGN_SAFE_ROUTES = [
  'contrato_honorarios',
  'contrato_cliente_terceiros',
  'contrato_escritorio',
  'documento_procuracao',
  'documento_peticao',
  'documento_contrato',
  'documento_outros',
  'padrao',
] as const

export type D4SignSafeRoute = (typeof D4SIGN_SAFE_ROUTES)[number]

/** `office_settings.d4sign_safes`: o cofre de cada tipo. Tipo ausente usa o
 * `padrao`. */
export type D4SignSafeMap = Partial<Record<D4SignSafeRoute, D4SignSafe>>

export const D4SIGN_SAFE_ROUTE_LABELS: Record<D4SignSafeRoute, string> = {
  contrato_honorarios: 'Contrato de honorários',
  contrato_cliente_terceiros: 'Contrato do cliente com terceiros',
  contrato_escritorio: 'Contrato do escritório',
  documento_procuracao: 'Procuração',
  documento_peticao: 'Petição',
  documento_contrato: 'Contrato avulso, fora de Contratos',
  documento_outros: 'Outros documentos',
  padrao: 'Padrão — o que não tiver cofre próprio',
}

/**
 * Recursos que dependem do plano. A API não informa o plano, então quem
 * administra liga à mão o que a conta tem (`office_settings.d4sign_features`).
 * Chave ausente é recurso desligado.
 */
export const D4SIGN_FEATURES = [
  'whatsapp',
  'pix',
  'selfie',
  'video_selfie',
  'score',
  'icp',
  'embed',
] as const

export type D4SignFeature = (typeof D4SIGN_FEATURES)[number]

export type D4SignFeatures = Partial<Record<D4SignFeature, boolean>>

export const D4SIGN_FEATURE_LABELS: Record<D4SignFeature, { label: string; description: string }> =
  {
    whatsapp: {
      label: 'WhatsApp',
      description: 'O link de assinatura também vai pelo WhatsApp do signatário.',
    },
    pix: {
      label: 'Pix',
      description: 'O signatário confirma a identidade com um Pix da conta dele.',
    },
    selfie: {
      label: 'Documento com foto e selfie',
      description: 'Foto do documento, com ou sem selfie, no momento de assinar.',
    },
    video_selfie: {
      label: 'Vídeo-selfie',
      description: 'Um vídeo curto do signatário no momento de assinar.',
    },
    score: {
      label: 'Biometria (D4Sign Score)',
      description: 'Compara o rosto com a CNH. Pede nome, CPF e selfie ou vídeo.',
    },
    icp: {
      label: 'Certificado ICP-Brasil',
      description: 'Assinatura com certificado digital (e-CPF ou e-CNPJ, como o da OAB).',
    },
    embed: {
      label: 'Assinatura no portal (Embed)',
      description: 'O cliente assina dentro do portal. A D4Sign ativa pelo suporte.',
    },
  }

/** `type_post` do webhook, como a coluna `webhook_events.event` guarda. */
export const D4SIGN_WEBHOOK_EVENTS = {
  '1': 'finalizado',
  '2': 'email_nao_entregue',
  '3': 'cancelado',
  '4': 'assinado',
} as const

export type D4SignWebhookEvent = (typeof D4SIGN_WEBHOOK_EVENTS)[keyof typeof D4SIGN_WEBHOOK_EVENTS]

export const D4SIGN_WEBHOOK_EVENT_LABELS: Record<D4SignWebhookEvent, string> = {
  finalizado: 'Todos assinaram',
  email_nao_entregue: 'E-mail não entregue',
  cancelado: 'Cancelado',
  assinado: 'Uma assinatura',
}
