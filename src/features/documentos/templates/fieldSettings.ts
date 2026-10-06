import {
  isSpellableFormat,
  type ChoiceJoin,
  type ManualFieldFormat,
  type SpellableFormat,
  type TemplateChoiceOption,
  type TemplateFieldSetting,
  type TemplateFieldSettings,
} from '@/types/documentTemplate.types'
import { isCatalogField, type CatalogFieldName } from './catalog'

/**
 * Os tipos de campo de um modelo:
 *
 *   cadastro → do catálogo, lido do banco (`resolveFields.ts`)
 *   manual   → digitado por quem gera
 *   opções   → escolhido por quem gera, entre opções criadas no modelo
 *   ia       → texto redigido pela IA e revisado por quem gera
 *
 * Quem não é do catálogo tem a definição gravada no modelo (`field_settings`).
 * Sem definição — modelo antigo, .docx anexado no chat —, vale um padrão
 * inferido pelo nome. O padrão é MANUAL: na dúvida, é melhor pedir o valor a
 * quem gera do que deixar a IA escrever um número de honorários. Campo de
 * opções nunca é inferido — as opções só existem se alguém as criou.
 */

/** Sufixo do campo derivado por extenso: `{valor_honorarios_extenso}`. */
export const SPELLED_SUFFIX = '_extenso'

/** Começos de nome que indicam texto corrido — "fatos", "dos_pedidos",
 * "fundamentacao". Depois de tirar "do_", "da_", "dos_", "das_". */
const PROSE_STEMS = [
  'fato',
  'pedido',
  'fundament',
  'direito',
  'merito',
  'preliminar',
  'sintese',
  'resumo',
  'argument',
  'razao',
  'razoes',
  'tese',
  'conclus',
  'requeriment',
  'narrat',
  'introdu',
  'justificat',
  'historico',
  'causa_de_pedir',
]

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/^(do|da|dos|das)_/, '')
}

function inferFormat(normalized: string): ManualFieldFormat {
  if (/percent|porcent|aliquota/.test(normalized)) return 'percent'
  const money = /valor|preco|honorario|quantia|montante|salario|remuneracao|multa|custas|mensal/
  if (money.test(normalized)) return 'currency'
  if (/^data_|_data$|_data_|vencimento|nascimento/.test(normalized)) return 'date'
  if (/^(numero|quantidade|qtd)_|parcelas|dias|meses|anos|prazo/.test(normalized)) return 'number'
  if (/objeto|descricao|observac|clausula|condicoes/.test(normalized)) return 'long_text'
  return 'text'
}

/** "valor_honorarios" → "Valor honorarios". O rótulo é editável na tela de
 * definição; isto é só um ponto de partida legível. */
export function humanizeFieldName(name: string): string {
  const spaced = name.replace(/_/g, ' ').trim()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/** Padrão de um campo sem definição gravada. */
export function inferFieldSetting(name: string): TemplateFieldSetting {
  const normalized = normalizeName(name)
  const label = humanizeFieldName(name)
  if (PROSE_STEMS.some((stem) => normalized.startsWith(stem))) {
    return { kind: 'ai', label, instruction: '' }
  }
  return { kind: 'manual', label, format: inferFormat(normalized) }
}

export interface ManualFieldDefinition {
  name: string
  label: string
  format: ManualFieldFormat
  /** O modelo usa `{name}`. */
  direct: boolean
  /** O modelo usa `{name_extenso}`. */
  spelled: boolean
}

export interface ChoiceFieldDefinition {
  name: string
  label: string
  options: TemplateChoiceOption[]
  multiple: boolean
  joinWith: ChoiceJoin
}

export interface AiFieldDefinition {
  name: string
  label: string
  instruction: string
}

export interface ClassifiedFields {
  cadastro: CatalogFieldName[]
  manual: ManualFieldDefinition[]
  choice: ChoiceFieldDefinition[]
  ai: AiFieldDefinition[]
}

/**
 * Separa os campos de um modelo pelos tipos.
 *
 * `{x_extenso}` não é um campo próprio: é o `{x}` manual escrito por extenso.
 * O `x` entra na lista mesmo que o modelo só use a versão por extenso — é nele
 * que quem gera digita o valor —, e um campo com versão por extenso é sempre
 * manual e num formato que tenha extenso.
 */
export function classifyTemplateFields(
  fields: readonly string[],
  settings: TemplateFieldSettings,
): ClassifiedFields {
  const cadastro: CatalogFieldName[] = []
  const usage = new Map<string, { direct: boolean; spelled: boolean }>()
  const usageOf = (name: string) => {
    const current = usage.get(name) ?? { direct: false, spelled: false }
    usage.set(name, current)
    return current
  }

  for (const field of fields) {
    if (isCatalogField(field)) {
      if (!cadastro.includes(field)) cadastro.push(field)
      continue
    }
    const base = field.endsWith(SPELLED_SUFFIX) ? field.slice(0, -SPELLED_SUFFIX.length) : null
    // `{data_hoje_extenso}`: a base é do catálogo, que não tem versão por
    // extenso gerada — fica como um campo comum.
    if (base && !isCatalogField(base)) usageOf(base).spelled = true
    else usageOf(field).direct = true
  }

  const manual: ManualFieldDefinition[] = []
  const choice: ChoiceFieldDefinition[] = []
  const ai: AiFieldDefinition[] = []
  for (const [name, { direct, spelled }] of usage) {
    const setting = settings[name] ?? inferFieldSetting(name)
    const label = setting.label || humanizeFieldName(name)
    if (setting.kind === 'ai' && !spelled) {
      ai.push({ name, label, instruction: setting.instruction })
      continue
    }
    if (setting.kind === 'choice' && !spelled) {
      const { options, multiple, joinWith } = setting
      choice.push({ name, label, options, multiple, joinWith })
      continue
    }
    manual.push({
      name,
      label,
      format: spelled ? spellableFormatFor(name, setting) : manualFormatOf(name, setting),
      direct,
      spelled,
    })
  }

  return { cadastro, manual, choice, ai }
}

/** Campos definíveis na ordem do documento. `{x_extenso}` aparece como `x`. */
export function definableFieldNames(fields: readonly string[]): string[] {
  const names: string[] = []
  for (const field of fields) {
    if (isCatalogField(field)) continue
    const base = field.endsWith(SPELLED_SUFFIX) ? field.slice(0, -SPELLED_SUFFIX.length) : null
    const name = base && !isCatalogField(base) ? base : field
    if (!names.includes(name)) names.push(name)
  }
  return names
}

/** Um campo que quem gera preenche na tela: digitado ou escolhido. */
export type FillField =
  | { kind: 'manual'; field: ManualFieldDefinition }
  | { kind: 'choice'; field: ChoiceFieldDefinition }

/** Campos manuais e de opções juntos, na ordem em que aparecem no documento —
 * é a ordem em que a tela os pede. */
export function fillFieldsInOrder(
  fields: readonly string[],
  classified: ClassifiedFields,
): FillField[] {
  const byName = new Map<string, FillField>()
  for (const field of classified.manual) byName.set(field.name, { kind: 'manual', field })
  for (const field of classified.choice) byName.set(field.name, { kind: 'choice', field })
  return definableFieldNames(fields).flatMap((name) => byName.get(name) ?? [])
}

function manualFormatOf(name: string, setting: TemplateFieldSetting): ManualFieldFormat {
  return setting.kind === 'manual' ? setting.format : inferFormat(normalizeName(name))
}

function spellableFormatFor(name: string, setting: TemplateFieldSetting): SpellableFormat {
  const format = manualFormatOf(name, setting)
  if (isSpellableFormat(format)) return format
  const inferred = inferFormat(normalizeName(name))
  return isSpellableFormat(inferred) ? inferred : 'currency'
}

/**
 * Definições a gravar para um conjunto de campos: uma por campo definível, e
 * só para campos que ainda existem no arquivo — trocar o .docx não deixa
 * definição órfã para trás.
 */
export function settingsForFields(
  fields: readonly string[],
  draft: TemplateFieldSettings,
): TemplateFieldSettings {
  const { manual, choice, ai } = classifyTemplateFields(fields, draft)
  const settings: TemplateFieldSettings = {}
  for (const field of manual) {
    settings[field.name] = { kind: 'manual', label: field.label, format: field.format }
  }
  for (const field of choice) {
    settings[field.name] = {
      kind: 'choice',
      label: field.label,
      // Opção sem rótulo é linha que ficou em branco na edição — não vai.
      options: field.options
        .map((option) => ({ ...option, label: option.label.trim() }))
        .filter((option) => option.label),
      multiple: field.multiple,
      joinWith: field.joinWith,
    }
  }
  for (const field of ai) {
    settings[field.name] = { kind: 'ai', label: field.label, instruction: field.instruction }
  }
  return settings
}

/** Campos de opções sem nenhuma opção preenchida — o modelo não pode ser
 * salvo assim: na geração não haveria o que escolher. */
export function choiceFieldsWithoutOptions(
  fields: readonly string[],
  draft: TemplateFieldSettings,
): string[] {
  return classifyTemplateFields(fields, draft)
    .choice.filter((field) => !field.options.some((option) => option.label.trim()))
    .map((field) => field.name)
}
