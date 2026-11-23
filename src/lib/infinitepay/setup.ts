// Server-side: lê o ambiente. A tela recebe só o resultado, nunca a chave.
import type { InfinitePaySetupStatus } from '@/types/paymentCharge.types'
import { infinitePayApiKey } from './client'
import { devHandleOverride } from './handle'
import { infinitePayWebhookEndpoint } from './urls'

export function infinitePaySetupStatus(): InfinitePaySetupStatus {
  return {
    webhookEndpoint: infinitePayWebhookEndpoint(),
    apiKeyConfigured: infinitePayApiKey() !== null,
    devHandle: devHandleOverride(),
  }
}
