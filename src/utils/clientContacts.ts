/**
 * De qual telefone e de qual e-mail do cadastro o sistema fala com o cliente.
 *
 * Puro — sem I/O —, porque serve aos dois lados: o servidor pré-preenche o
 * checkout da InfinitePay e escolhe o destinatário do e-mail; a tela mostra
 * para onde o e-mail vai antes de mandar. Uma regra só, para que a tela nunca
 * anuncie um endereço e o servidor use outro.
 */

/** O que estas funções leem do cliente. `contacts` é opcional porque nem todo
 * select embute `client_contacts`. */
export interface ContactSource {
  phone: string | null
  email: string | null
  contacts?: { type: 'phone' | 'email'; value: string; is_primary: boolean }[] | null
}

/** Validação de forma, não de existência: quem diz se o endereço existe é o
 * servidor do destinatário (e o bounce, no webhook). */
export const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** O campo do cadastro primeiro; depois os contatos, o principal à frente. */
export function contactCandidates(client: ContactSource, kind: 'phone' | 'email'): string[] {
  const contacts = [...(client.contacts ?? [])]
    .filter((contact) => contact.type === kind)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((contact) => contact.value)
  const fromRecord = kind === 'phone' ? client.phone : client.email
  return [fromRecord, ...contacts].filter((value): value is string => !!value?.trim())
}

/** O primeiro e-mail do cliente com forma de e-mail, sem espaços nas pontas. */
export function pickClientEmail(client: ContactSource | null | undefined): string | null {
  if (!client) return null
  return (
    contactCandidates(client, 'email')
      .map((value) => value.trim())
      .find((value) => SIMPLE_EMAIL.test(value)) ?? null
  )
}
