/**
 * Campos de CADASTRO dos modelos de documento — preenchidos pelo sistema, a
 * partir do banco, nunca pela IA. Qualquer outro `{campo}` do modelo é um
 * campo de TEXTO, que a IA redige (o nome do campo é a instrução: `{fatos}`,
 * `{pedidos}`, `{fundamentos}`).
 *
 * Usado na tela de modelos (mostrar quais campos existem) e no servidor (saber
 * o que resolver do banco). Só dados declarativos aqui — nada que importe
 * cliente Supabase ou biblioteca de servidor.
 */
export const TEMPLATE_FIELD_CATALOG = [
  { name: 'cliente_nome', description: 'Nome completo (pessoa física) ou razão social' },
  { name: 'cliente_qualificacao', description: 'Qualificação completa, pronta para a petição' },
  { name: 'cliente_documento', description: 'CPF ou CNPJ, formatado' },
  { name: 'cliente_endereco', description: 'Endereço principal, numa linha' },
  { name: 'processo_cnj', description: 'Número do processo (CNJ)' },
  { name: 'processo_vara', description: 'Vara, câmara ou gabinete' },
  { name: 'processo_tribunal', description: 'Tribunal' },
  { name: 'processo_comarca', description: 'Comarca' },
  { name: 'processo_classe', description: 'Classe processual' },
  { name: 'processo_assunto', description: 'Assunto' },
  { name: 'processo_valor_causa', description: 'Valor da causa, em reais' },
  { name: 'parte_contraria', description: 'Parte(s) do polo oposto ao do cliente no processo' },
  { name: 'advogado_nome', description: 'Nome de quem gera o documento' },
  { name: 'advogado_oab', description: 'OAB de quem gera o documento' },
  { name: 'data_hoje', description: 'Data de hoje por extenso (ex.: 17 de setembro de 2026)' },
] as const

export type TemplateFieldName = (typeof TEMPLATE_FIELD_CATALOG)[number]['name']

const CATALOG_NAMES: ReadonlySet<string> = new Set(TEMPLATE_FIELD_CATALOG.map((field) => field.name))

export function isCatalogField(name: string): name is TemplateFieldName {
  return CATALOG_NAMES.has(name)
}

/** Separa os campos de um modelo em "do cadastro" e "redigidos pela IA". */
export function splitTemplateFields(fields: readonly string[]): {
  cadastro: TemplateFieldName[]
  redigidos: string[]
} {
  return {
    cadastro: fields.filter(isCatalogField),
    redigidos: fields.filter((field) => !isCatalogField(field)),
  }
}
