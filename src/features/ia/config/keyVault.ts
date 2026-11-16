// Só no servidor: a chave de cifra deriva de `SUPABASE_SERVICE_ROLE_KEY` (ou
// `CLIENT_PORTAL_SECRET`), que nunca chega ao navegador.
import { derivePortalKeyBytes } from '@/lib/clientPortal/secret'
import { createSecretVault } from '@/lib/crypto/secretVault'

/**
 * Rótulo da derivação: separa a chave que cifra as API keys da IA da que
 * cifra o link do portal, embora as duas venham do mesmo segredo-raiz.
 * Trocar o rótulo (ou o segredo-raiz) torna ilegíveis as chaves já guardadas —
 * o resolvedor cai para o `.env` e o painel pede a chave de novo.
 */
const KEY_INFO = 'advtool:ai-settings:provider-key:v1'

/** Cofre das colunas `ai_provider_keys.key_sealed` (migration 94). */
export const aiKeyVault = createSecretVault(() => derivePortalKeyBytes(KEY_INFO))
