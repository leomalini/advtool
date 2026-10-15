/**
 * Consulta de CNPJ na BrasilAPI — SÓ SERVIDOR (usa o cache de `fetch` do Next).
 *
 * Usada pela rota `/api/cnpj` (cadastro de cliente) e pelo leitor de
 * documentos de contrato, que completa a pessoa jurídica achada num documento.
 */

export interface CnpjCompany {
  company_name: string | null
  trade_name: string | null
  phone: string | null
  email: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
  address_zip: string | null
}

export type CnpjLookup =
  | { ok: true; company: CnpjCompany }
  /** `unavailable`: a API respondeu com erro; `network`: nem respondeu. */
  | { ok: false; reason: 'not_found' | 'unavailable' | 'network' }

export async function lookupCnpj(cnpj: string): Promise<CnpjLookup> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      headers: { 'User-Agent': 'advtool/1.0' },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return { ok: false, reason: res.status === 404 ? 'not_found' : 'unavailable' }

    const data = await res.json()
    return {
      ok: true,
      company: {
        company_name: data.razao_social ?? null,
        trade_name: data.nome_fantasia ?? null,
        phone: data.ddd_telefone_1
          ? `(${data.ddd_telefone_1.slice(0, 2)}) ${data.ddd_telefone_1.slice(2)}`
          : null,
        email: data.email ?? null,
        address_street: data.logradouro ?? null,
        address_number: data.numero ?? null,
        address_complement: data.complemento ?? null,
        address_neighborhood: data.bairro ?? null,
        address_city: data.municipio ?? null,
        address_state: data.uf ?? null,
        address_zip: data.cep ?? null,
      },
    }
  } catch {
    return { ok: false, reason: 'network' }
  }
}
