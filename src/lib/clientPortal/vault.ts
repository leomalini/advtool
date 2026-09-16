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

import { derivePortalKeyBytes } from './secret'

const KEY_INFO = 'advtool:client-portal:token-vault:v1'

/** GCM: 96 bits é o tamanho recomendado, e o único que o WebCrypto otimiza. */
const IV_BYTES = 12

let cachedKey: Promise<CryptoKey> | null = null

function vaultKey(): Promise<CryptoKey> {
  cachedKey ??= derivePortalKeyBytes(KEY_INFO).then((raw) =>
    crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  )
  return cachedKey
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * Texto cifrado pronto para a coluna: base64 de `iv || ciphertext`.
 *
 * O IV é novo a cada chamada e viaja junto — ele não é segredo, e reusá-lo com
 * a mesma chave é o erro que quebra o GCM.
 */
export async function sealPortalToken(token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await vaultKey(),
    new TextEncoder().encode(token)
  )

  const packed = new Uint8Array(iv.length + ciphertext.byteLength)
  packed.set(iv, 0)
  packed.set(new Uint8Array(ciphertext), iv.length)

  return toBase64(packed)
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
  if (!sealed) return null

  try {
    const packed = fromBase64(sealed)
    if (packed.length <= IV_BYTES) return null

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.slice(0, IV_BYTES) },
      await vaultKey(),
      packed.slice(IV_BYTES)
    )

    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}
