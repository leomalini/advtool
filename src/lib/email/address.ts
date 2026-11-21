import { SIMPLE_EMAIL } from '@/utils/clientContacts'

/** A forma em que `email_suppressions.address` guarda o endereço (CHECK da
 * migration 95): sem espaços nas pontas e em minúsculas. */
export function normalizeEmailAddress(address: string): string {
  return address.trim().toLowerCase()
}

export function isEmailAddress(value: string): boolean {
  return SIMPLE_EMAIL.test(value.trim())
}
