/**
 * Cofre de segredos curtos: AES-GCM com chave derivada do ambiente do servidor.
 *
 * Nasceu no portal do cliente (`src/lib/clientPortal/vault.ts`, token do link)
 * e serve também às chaves de API da IA (`src/features/ia/config/keyVault.ts`).
 * Cada uso passa a SUA derivação de chave — rótulos diferentes dão chaves
 * diferentes, e um texto cifrado de um uso nunca abre no outro.
 *
 * O que a cifragem protege: um vazamento apenas do banco (dump, backup,
 * réplica) não entrega o segredo, porque a chave sai do ambiente e não está em
 * coluna nenhuma.
 *
 * AES-GCM porque é autenticado: adulterar o texto cifrado faz a decifragem
 * falhar em vez de devolver lixo.
 */

/** GCM: 96 bits é o tamanho recomendado, e o único que o WebCrypto otimiza. */
const IV_BYTES = 12

export interface SecretVault {
  /** Texto cifrado pronto para a coluna: base64 de `iv || ciphertext`. */
  seal(plaintext: string): Promise<string>
  /**
   * O texto de volta, ou `null` quando não há o que abrir, o segredo do
   * servidor mudou depois da cifragem, ou a coluna foi adulterada.
   */
  open(sealed: string | null): Promise<string | null>
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
 * Um cofre sobre os bytes de chave que `deriveKeyBytes` devolve (32 bytes →
 * AES-256). A chave importada fica em cache; se a derivação falhar (segredo
 * ausente no ambiente), o cache é descartado e a próxima chamada tenta de novo.
 */
export function createSecretVault(deriveKeyBytes: () => Promise<ArrayBuffer>): SecretVault {
  let cachedKey: Promise<CryptoKey> | null = null

  function key(): Promise<CryptoKey> {
    cachedKey ??= deriveKeyBytes()
      .then((raw) => crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']))
      .catch((error: unknown) => {
        cachedKey = null
        throw error
      })
    return cachedKey
  }

  return {
    async seal(plaintext) {
      // O IV é novo a cada chamada e viaja junto — ele não é segredo, e
      // reusá-lo com a mesma chave é o erro que quebra o GCM.
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        await key(),
        new TextEncoder().encode(plaintext),
      )

      const packed = new Uint8Array(iv.length + ciphertext.byteLength)
      packed.set(iv, 0)
      packed.set(new Uint8Array(ciphertext), iv.length)
      return toBase64(packed)
    },

    async open(sealed) {
      if (!sealed) return null
      try {
        const packed = fromBase64(sealed)
        if (packed.length <= IV_BYTES) return null

        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: packed.slice(0, IV_BYTES) },
          await key(),
          packed.slice(IV_BYTES),
        )
        return new TextDecoder().decode(plaintext)
      } catch {
        return null
      }
    },
  }
}
