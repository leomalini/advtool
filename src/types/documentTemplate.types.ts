import type { DocumentCategory } from './document.types'

/** Categorias de modelo — subconjunto das de Documentos (migration 66), para o
 * documento gerado ser salvo no cliente/processo já classificado. */
export type TemplateCategory = Extract<
  DocumentCategory,
  'peticao' | 'contrato' | 'procuracao' | 'outros'
>

/** A ordem é a dos seletores — 'outros' fica por último. */
export const TEMPLATE_CATEGORIES = [
  'peticao',
  'contrato',
  'procuracao',
  'outros',
] as const satisfies readonly TemplateCategory[]

/**
 * Formato de um campo MANUAL. Decide o controle da tela de geração e como o
 * valor sai no documento ("R$ 5.000,00", "30%", "24/09/2026").
 */
export type ManualFieldFormat = 'text' | 'long_text' | 'currency' | 'date' | 'number' | 'percent'

export const MANUAL_FIELD_FORMATS = [
  'text',
  'long_text',
  'currency',
  'date',
  'number',
  'percent',
] as const satisfies readonly ManualFieldFormat[]

export const MANUAL_FIELD_FORMAT_LABELS: Record<ManualFieldFormat, string> = {
  text: 'Texto curto',
  long_text: 'Texto longo',
  currency: 'Valor em R$',
  date: 'Data',
  number: 'Número',
  percent: 'Percentual',
}

/** Formatos que têm versão por extenso: `{campo_extenso}` no modelo. */
export const SPELLABLE_FORMATS = [
  'currency',
  'date',
  'number',
  'percent',
] as const satisfies readonly ManualFieldFormat[]

export type SpellableFormat = (typeof SPELLABLE_FORMATS)[number]

export function isSpellableFormat(format: ManualFieldFormat): format is SpellableFormat {
  return (SPELLABLE_FORMATS as readonly ManualFieldFormat[]).includes(format)
}

/** Uma opção de um campo de opções. O rótulo aparece na hora de escolher; o
 * texto é o que vai para o documento — vazio, vai o próprio rótulo. */
export interface TemplateChoiceOption {
  /** Estável entre edições: é o que a tela de geração guarda como escolhido. */
  id: string
  label: string
  text: string
}

/** Como juntar várias opções escolhidas no mesmo campo. */
export type ChoiceJoin = 'list' | 'paragraphs'

export const CHOICE_JOIN_LABELS: Record<ChoiceJoin, string> = {
  list: 'Em lista (A, B e C)',
  paragraphs: 'Um parágrafo cada',
}

/**
 * Definição de um campo que não é do catálogo de cadastro.
 *
 * - `manual`: quem gera digita o valor (honorários, percentual, prazo).
 * - `choice`: quem gera escolhe entre opções criadas no modelo (forma de
 *   pagamento, tipo de ação, cláusula opcional).
 * - `ai`: texto corrido que a IA redige a partir de `instruction` — e que quem
 *   gera revisa antes de baixar.
 */
export type TemplateFieldSetting =
  | { kind: 'manual'; label: string; format: ManualFieldFormat }
  | {
      kind: 'choice'
      label: string
      options: TemplateChoiceOption[]
      /** Mais de uma opção por vez (checkboxes); senão, uma só. */
      multiple: boolean
      joinWith: ChoiceJoin
    }
  | { kind: 'ai'; label: string; instruction: string }

export type TemplateFieldKind = TemplateFieldSetting['kind']

/** Chave = nome do campo no .docx, sem chaves. */
export type TemplateFieldSettings = Record<string, TemplateFieldSetting>

/** Espelha `public.document_templates` (migrations 62 e 66). */
export interface DocumentTemplate {
  id: string
  name: string
  description: string | null
  category: TemplateCategory
  /** Caminho no bucket `attachments`, em `modelos/<id>/…`. */
  file_path: string
  file_name: string
  /** Todos os campos `{...}` do arquivo, na ordem em que aparecem, detectados
   * no upload. Quais são de cadastro decide o catálogo
   * (`documentos/templates/catalog.ts`); os demais, `field_settings`. */
  fields: string[]
  field_settings: TemplateFieldSettings
  created_by: string
  created_at: string
  updated_at: string
}
