/**
 * O token guardado de forma recuperável — cifrado, nunca em claro.
 *
 * ── Por que isto existe ──
 * O desenho original guardava só o SHA-256: o link aparecia uma vez, na
 * emissão, e nem o escritório o recuperava depois. Na prática isso quebra o
 * uso real — a secretária reabre o cadastro na semana seguinte para reenviar
 * a mensagem ao cliente, e ser obrigada a emitir outro link (invalidando o que
 * o cliente já tem) transforma uma tarefa de 5 segundos numa confusão.
 *
 * ── O que se perde, e o que não ──
 * Guardar de forma recuperável é, por definição, mais fraco que guardar só o
 * hash. O que a cifragem preserva é o caso concreto que motivou o hash: **um
 * vazamento apenas do banco** — dump, backup esquecido, réplica de leitura,
 * `select` de terceiro — continua não entregando link nenhum utilizável, porque
 * a chave sai do ambiente do servidor (`secret.ts`) e não está em nenhuma
 * coluna. Quem obtém banco E variáveis de ambiente já teria a service_role, e
 * nesse ponto o portal é o menor dos problemas.
 *
 * `token_hash` continua existindo e continua sendo o que a validação consulta:
 * o acesso do cliente nunca decifra nada.
 *
 * AES-GCM porque é autenticado: adulterar o texto cifrado faz a decifragem
 * falhar em vez de devolver lixo que pareceria um token.
 */

import { createSecretVault } from '@/lib/crypto/secretVault'
import { derivePortalKeyBytes } from './secret'

const KEY_INFO = 'advtool:client-portal:token-vault:v1'

// O AES-GCM mora em `@/lib/crypto/secretVault` (também usado pelas chaves da
// IA); aqui fica só o rótulo que separa a chave do portal das outras.
const vault = createSecretVault(() => derivePortalKeyBytes(KEY_INFO))

/**
 * Texto cifrado pronto para a coluna: base64 de `iv || ciphertext`.
 */
export async function sealPortalToken(token: string): Promise<string> {
  return vault.seal(token)
}

/**
 * O token de volta, ou `null`.
 *
 * Devolve `null` em vez de lançar porque os três motivos de falha têm o mesmo
 * desfecho na tela — "não dá para exibir este link, gere outro":
 *
 *   · link emitido antes desta coluna existir (`sealed` nulo);
 *   · segredo do servidor rotacionado depois da emissão;
 *   · coluna adulterada, que o GCM recusa.
 *
 * Nenhum deles é erro do usuário, e nenhum justifica derrubar a tela do
 * cadastro inteiro por causa de um campo.
 */
export async function openPortalToken(sealed: string | null): Promise<string | null> {
  return vault.open(sealed)
}
