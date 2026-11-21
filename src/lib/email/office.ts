// Server-side. Quem assina o e-mail: o cadastro de Configurações → Escritório.
import type { SupabaseClient } from '@supabase/supabase-js'
import { SIMPLE_EMAIL } from '@/utils/clientContacts'

/**
 * O escritório como o cliente o vê no e-mail. Os mesmos campos que o portal
 * mostra em "Falar com o escritório" (`/api/portal/[token]`), para o cliente
 * encontrar o mesmo contato nos dois lugares.
 */
export interface OfficeIdentity {
  name: string | null
  /** Vira o Reply-To: a resposta do cliente cai na caixa real do escritório. */
  email: string | null
  phone: string | null
  oabRegistration: string | null
  /** Uma linha só, para o rodapé. */
  addressLine: string | null
}

const EMPTY_IDENTITY: OfficeIdentity = {
  name: null,
  email: null,
  phone: null,
  oabRegistration: null,
  addressLine: null,
}

interface OfficeRow {
  name: string | null
  email: string | null
  phone: string | null
  oab_registration: string | null
  street: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
}

function clean(value: string | null | undefined): string | null {
  return value?.trim() || null
}

function addressLine(row: OfficeRow): string | null {
  const street = [clean(row.street), clean(row.number)].filter(Boolean).join(', ')
  const withComplement = [street, clean(row.complement)].filter(Boolean).join(' – ')
  const cityState = [clean(row.city), clean(row.state)].filter(Boolean).join('/')
  const line = [withComplement, clean(row.neighborhood), cityState].filter(Boolean).join(' · ')
  return line || null
}

/**
 * Falha vira identidade vazia: o rodapé é complemento, e um e-mail que o
 * escritório pediu para mandar não deixa de sair porque o cadastro não leu.
 * Sem nome, o remetente aparece só com o endereço de `EMAIL_FROM`.
 */
export async function loadOfficeIdentity(admin: SupabaseClient): Promise<OfficeIdentity> {
  const { data, error } = await admin
    .from('office_settings')
    .select(
      'name, email, phone, oab_registration, street, number, complement, neighborhood, city, state'
    )
    .maybeSingle()

  if (error) {
    console.error('[email] cadastro do escritório não lido:', error.message)
    return EMPTY_IDENTITY
  }
  if (!data) return EMPTY_IDENTITY

  const row = data as OfficeRow
  const email = clean(row.email)
  return {
    name: clean(row.name),
    email: email && SIMPLE_EMAIL.test(email) ? email : null,
    phone: clean(row.phone),
    oabRegistration: clean(row.oab_registration),
    addressLine: addressLine(row),
  }
}
