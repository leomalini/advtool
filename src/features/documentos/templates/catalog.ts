/**
 * Campos de CADASTRO dos modelos de documento — preenchidos pelo sistema, a
 * partir do banco, nunca pela IA. Qualquer outro `{campo}` do modelo é MANUAL
 * (digitado ao gerar) ou de IA (texto redigido), conforme a definição do
 * modelo — ver `fieldSettings.ts`.
 *
 * Usado na tela de modelos (mostrar e copiar os campos), na tela de geração e
 * no Assistente. Só dados declarativos aqui — nada que importe cliente
 * Supabase ou biblioteca de servidor.
 */

export type CatalogGroup = 'cliente' | 'processo' | 'advogado' | 'escritorio' | 'data'

export const CATALOG_GROUP_LABELS: Record<CatalogGroup, string> = {
  cliente: 'Cliente',
  processo: 'Processo',
  advogado: 'Advogados',
  escritorio: 'Escritório',
  data: 'Datas',
}

export const CATALOG_GROUPS = [
  'cliente',
  'processo',
  'advogado',
  'escritorio',
  'data',
] as const satisfies readonly CatalogGroup[]

interface CatalogEntry {
  name: string
  group: CatalogGroup
  description: string
}

/** Mantém o nome como literal, para `CatalogFieldName` ser a união dos nomes. */
function entry<const N extends string>(name: N, group: CatalogGroup, description: string) {
  return { name, group, description }
}

export const TEMPLATE_FIELD_CATALOG = [
  entry('cliente_nome', 'cliente', 'Nome completo (pessoa física) ou razão social'),
  entry('cliente_qualificacao', 'cliente', 'Qualificação completa, pronta para a petição'),
  entry('cliente_documento', 'cliente', 'CPF ou CNPJ, formatado'),
  entry('cliente_rg', 'cliente', 'RG com o órgão emissor'),
  entry('cliente_estado_civil', 'cliente', 'Estado civil, no gênero do cliente'),
  entry('cliente_profissao', 'cliente', 'Profissão'),
  entry('cliente_nacionalidade', 'cliente', 'Nacionalidade (ex.: brasileira)'),
  entry('cliente_nascimento', 'cliente', 'Data de nascimento (dd/mm/aaaa)'),
  entry('cliente_email', 'cliente', 'E-mail principal'),
  entry('cliente_telefone', 'cliente', 'Telefone principal'),
  entry('cliente_endereco', 'cliente', 'Endereço principal, numa linha'),
  entry('cliente_cidade', 'cliente', 'Cidade do endereço principal'),
  entry('cliente_uf', 'cliente', 'UF do endereço principal'),
  entry('cliente_cep', 'cliente', 'CEP do endereço principal'),
  entry('cliente_representante', 'cliente', 'Quem representa a pessoa jurídica'),
  entry(
    'cliente_tipo_parte',
    'cliente',
    'Como o cliente figura no processo (Autor, Réu, Reclamante…)',
  ),
  entry('processo_cnj', 'processo', 'Número do processo (CNJ)'),
  entry('processo_vara', 'processo', 'Vara, câmara ou gabinete'),
  entry('processo_tribunal', 'processo', 'Tribunal'),
  entry('processo_comarca', 'processo', 'Comarca'),
  entry('processo_classe', 'processo', 'Classe processual'),
  entry('processo_assunto', 'processo', 'Assunto'),
  entry('processo_valor_causa', 'processo', 'Valor da causa, já com R$ (ex.: R$ 10.000,00)'),
  entry(
    'processo_valor_causa_extenso',
    'processo',
    'Valor da causa por extenso (ex.: dez mil reais)',
  ),
  entry('processo_distribuicao', 'processo', 'Data de distribuição (dd/mm/aaaa)'),
  entry('parte_contraria', 'processo', 'Parte(s) do polo oposto ao do cliente'),
  entry('advogado_contrario', 'processo', 'Advogado da parte contrária'),
  entry('advogado_nome', 'advogado', 'Nome do primeiro advogado escolhido ao gerar'),
  entry('advogado_oab', 'advogado', 'Número da OAB do primeiro advogado'),
  entry('advogado_oab_uf', 'advogado', 'UF da OAB do primeiro advogado'),
  entry(
    'advogados',
    'advogado',
    'Todos os advogados escolhidos, com a OAB (ex.: Ana Lima (OAB/ES 12345) e …)',
  ),
  entry('escritorio_nome', 'escritorio', 'Nome do escritório'),
  entry('escritorio_cnpj', 'escritorio', 'CNPJ do escritório'),
  entry('escritorio_oab', 'escritorio', 'Registro da sociedade na OAB'),
  entry('escritorio_endereco', 'escritorio', 'Endereço do escritório, numa linha'),
  entry('escritorio_cidade', 'escritorio', 'Cidade do escritório'),
  entry('escritorio_uf', 'escritorio', 'UF do escritório'),
  entry('escritorio_telefone', 'escritorio', 'Telefone do escritório'),
  entry('escritorio_email', 'escritorio', 'E-mail do escritório'),
  entry('data_hoje', 'data', 'Data de hoje por extenso (ex.: 24 de setembro de 2026)'),
  entry(
    'local_e_data',
    'data',
    'Cidade/UF do escritório e a data de hoje (ex.: Vitória/ES, 24 de setembro de 2026)',
  ),
] as const satisfies readonly CatalogEntry[]

export type CatalogFieldName = (typeof TEMPLATE_FIELD_CATALOG)[number]['name']

/** Valores dos campos de cadastro. Ausente = sem dado — sai `[FALTA: campo]`. */
export type CatalogValues = Partial<Record<CatalogFieldName, string>>

const CATALOG_BY_NAME: ReadonlyMap<string, CatalogEntry> = new Map(
  TEMPLATE_FIELD_CATALOG.map((field) => [field.name, field]),
)

export function isCatalogField(name: string): name is CatalogFieldName {
  return CATALOG_BY_NAME.has(name)
}

export function catalogEntry(name: CatalogFieldName): CatalogEntry {
  // O tipo garante a presença; o fallback só satisfaz o compilador.
  return CATALOG_BY_NAME.get(name) ?? { name, group: 'data', description: name }
}

/** Distância de edição entre dois nomes — para apontar erro de digitação. */
function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]
    previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j]
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  return previous[b.length]
}

/** Nomes que alguém escreveria esperando um campo do catálogo. Conferidos antes
 * da distância de edição, que erraria alguns: `cliente_cpf` fica a duas letras
 * de `cliente_cep`. */
const CATALOG_ALIASES: Readonly<Record<string, CatalogFieldName>> = {
  cpf: 'cliente_documento',
  cnpj: 'cliente_documento',
  cliente_cpf: 'cliente_documento',
  cliente_cnpj: 'cliente_documento',
  cliente_cpf_cnpj: 'cliente_documento',
  nome_cliente: 'cliente_nome',
  numero_processo: 'processo_cnj',
  processo_numero: 'processo_cnj',
  vara: 'processo_vara',
  comarca: 'processo_comarca',
  tribunal: 'processo_tribunal',
  valor_causa: 'processo_valor_causa',
  // A data de hoje já sai por extenso.
  data_hoje_extenso: 'data_hoje',
  data_extenso: 'data_hoje',
  oab: 'advogado_oab',
  advogado: 'advogado_nome',
}

/**
 * Campo do catálogo que `name` provavelmente queria ser: `{cliente_nme}`,
 * `{Cliente_Nome}`, `{cliente nome}`, `{cliente_cpf}`. Um erro desses não
 * quebra o modelo — o campo vira manual e passa despercebido até o documento
 * sair com um buraco.
 */
export function suggestCatalogField(name: string): CatalogFieldName | null {
  if (isCatalogField(name)) return null

  const normalized = name.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (isCatalogField(normalized)) return normalized
  const alias = CATALOG_ALIASES[normalized]
  if (alias) return alias
  if (normalized.length < 5) return null

  let best: { field: CatalogFieldName; distance: number } | null = null
  for (const { name: field } of TEMPLATE_FIELD_CATALOG) {
    const distance = editDistance(normalized, field)
    if (distance <= 2 && (!best || distance < best.distance)) best = { field, distance }
  }
  return best?.field ?? null
}
