import { toBrazilianE164 } from '@/utils/format'
import { contactCandidates, pickClientEmail, type ContactSource } from '@/utils/clientContacts'
import type { CreateLinkRequest } from './schemas'

/**
 * Do cadastro do cliente para o que a InfinitePay entende. Puro — sem I/O —,
 * porque serve aos dois lados: o servidor pré-preenche o checkout, e a tela
 * escolhe o telefone do botão de WhatsApp pela mesma regra.
 *
 * A ordem dos candidatos (cadastro, depois contatos com o principal à frente)
 * mora em `utils/clientContacts.ts`, que o e-mail ao cliente também usa.
 */

/** O que estas funções leem do cliente. `contacts` é opcional porque nem todo
 * select embute `client_contacts`. */
export interface PaymentClient extends ContactSource {
  type: 'individual' | 'company'
  name: string | null
  company_name: string | null
  trade_name: string | null
}

/** O primeiro telefone do cliente que é telefone brasileiro, em E.164. */
export function pickClientPhone(client: PaymentClient | null | undefined): string | null {
  if (!client) return null
  for (const value of contactCandidates(client, 'phone')) {
    const e164 = toBrazilianE164(value)
    if (e164) return e164
  }
  return null
}

/**
 * Os dados que pré-preenchem o checkout. Sai só o que é válido: um telefone
 * fora do formato faria a InfinitePay recusar o link inteiro, e o cliente
 * digita o que faltar.
 *
 * Empresa vai pela razão social — o checkout pede o nome de quem paga, e o nome
 * fantasia é rótulo de tela, não de pagador.
 *
 * ⚠️ Tudo isto viaja legível dentro da URL do link (ver o spike no plano).
 */
export function buildCustomer(client: PaymentClient | null): CreateLinkRequest['customer'] {
  if (!client) return undefined

  const rawName =
    client.type === 'company' ? (client.company_name ?? client.trade_name) : client.name
  const name = rawName?.trim() || undefined
  const email = pickClientEmail(client) ?? undefined
  const phone = pickClientPhone(client)

  const customer = {
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(phone ? { phone_number: phone } : {}),
  }
  return Object.keys(customer).length > 0 ? customer : undefined
}
