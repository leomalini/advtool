import { createAssistantModel, type AssistantModelResult } from '@/features/ia/model'

/**
 * O modelo do assistente do portal — o mesmo provedor do Assistente interno
 * (`AI_ASSISTANT_PROVIDER`), com a mesma chave e a mesma cota.
 *
 * Liga sozinho quando o provedor está configurado, como o Assistente da
 * equipe: exigir mais uma variável para "ligar" fazia a página abrir sem o
 * chat, sem nenhum sinal do porquê. `PORTAL_ASSISTANT_ENABLED=false` desliga
 * só o do portal — é a saída para tirar a IA da frente do cliente sem tirá-la
 * da equipe.
 *
 * Funcionar de verdade depende também da migration 64: sem a tabela, a rota
 * não consegue contar o limite de uso e responde "indisponível" (o motivo fica
 * no log `[portal-ia]`).
 */
export function createPortalAssistantModel(): AssistantModelResult {
  if (process.env.PORTAL_ASSISTANT_ENABLED?.trim().toLowerCase() === 'false') {
    return { ok: false, reason: 'PORTAL_ASSISTANT_ENABLED=false.' }
  }
  return createAssistantModel()
}

export function isPortalAssistantEnabled(): boolean {
  return createPortalAssistantModel().ok
}
