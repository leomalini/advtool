import { formatCurrency } from '@/types/financialEntry.types'
import type { ManualFieldFormat } from '@/types/documentTemplate.types'
import type { CatalogValues } from './catalog'
import {
  SPELLED_SUFFIX,
  type ChoiceFieldDefinition,
  type ClassifiedFields,
} from './fieldSettings'
import {
  currencyToWords,
  formatLongDate,
  formatShortDate,
  numberToWords,
  parseLooseDate,
  parseLooseNumber,
  percentToWords,
} from './spellOut'
import { joinNames, PARAGRAPH_BREAK, toPlainText, toTemplateText } from './text'

/** Valor de cada `{campo}` do modelo. `undefined` sai `[FALTA: campo]`. */
export type TemplateValues = Record<string, string | undefined>

/** O valor cru de um campo manual formatado para o documento, e a versão por
 * extenso quando o formato tem uma. */
export function formatManualValue(
  format: ManualFieldFormat,
  raw: string | undefined,
): { value?: string; spelled?: string } {
  const trimmed = raw?.trim()
  if (!trimmed) return {}

  if (format === 'text') return { value: trimmed }
  if (format === 'long_text') return { value: toTemplateText(trimmed) }

  if (format === 'date') {
    const iso = parseLooseDate(trimmed)
    if (!iso) return { value: trimmed }
    return { value: formatShortDate(iso) ?? trimmed, spelled: formatLongDate(iso) ?? undefined }
  }

  const number = parseLooseNumber(trimmed)
  // Algo que não é número fica como foi digitado; só o extenso falta.
  if (number === null) return { value: trimmed }

  try {
    if (format === 'currency') {
      return { value: formatCurrency(number), spelled: currencyToWords(number) }
    }
    if (format === 'percent') {
      const shown = number.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
      return { value: `${shown}%`, spelled: percentToWords(number) }
    }
    const shown = number.toLocaleString('pt-BR', { maximumFractionDigits: 6 })
    return { value: shown, spelled: numberToWords(number) }
  } catch {
    // Número além do que o extenso cobre (trilhões): sai só o valor.
    return { value: trimmed }
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Texto das opções escolhidas, na ordem em que foram criadas no modelo — não
 * na ordem dos cliques. Uma opção sem texto vai com o próprio rótulo.
 */
export function formatChoiceValue(
  field: ChoiceFieldDefinition,
  selectedIds: readonly string[],
): string | undefined {
  const texts = field.options
    .filter((option) => selectedIds.includes(option.id))
    .map((option) => option.text.trim() || option.label.trim())
    .filter(Boolean)
  if (texts.length === 0) return undefined
  if (texts.length === 1 || field.joinWith === 'paragraphs') {
    return texts.map(toTemplateText).join(PARAGRAPH_BREAK)
  }
  return joinNames(texts)
}

/**
 * Junta tudo o que preenche um modelo, na precedência da tela: o que quem gera
 * digitou por cima do cadastro vale mais que o cadastro.
 */
export function buildTemplateValues({
  classified,
  cadastro,
  cadastroOverrides = {},
  manual,
  choices = {},
  ai,
}: {
  classified: ClassifiedFields
  /** Lidos do banco. */
  cadastro: CatalogValues
  /** Digitados por cima do cadastro, só para este documento. */
  cadastroOverrides?: Readonly<Record<string, string>>
  /** Valor cru dos campos manuais: número com ponto decimal, data em
   * 'yyyy-MM-dd' ou texto. */
  manual: Readonly<Record<string, string>>
  /** Ids das opções escolhidas em cada campo de opções. */
  choices?: Readonly<Record<string, readonly string[]>>
  /** Textos dos campos de IA. */
  ai: Readonly<Record<string, string>>
}): TemplateValues {
  const values: TemplateValues = {}

  for (const name of classified.cadastro) {
    const override = nonEmpty(cadastroOverrides[name])
    values[name] = override ? toTemplateText(override) : cadastro[name]
  }

  for (const field of classified.manual) {
    const { value, spelled } = formatManualValue(field.format, manual[field.name])
    if (field.direct) values[field.name] = value
    if (field.spelled) values[`${field.name}${SPELLED_SUFFIX}`] = spelled
  }

  for (const field of classified.choice) {
    values[field.name] = formatChoiceValue(field, choices[field.name] ?? [])
  }

  for (const field of classified.ai) {
    const text = nonEmpty(ai[field.name])
    values[field.name] = text ? toTemplateText(toPlainText(text)) : undefined
  }

  return values
}

/** Campos do modelo que vão sair `[FALTA: …]` com estes valores. */
export function missingFields(values: TemplateValues): string[] {
  return Object.entries(values)
    .filter(([, value]) => !value)
    .map(([name]) => name)
}
