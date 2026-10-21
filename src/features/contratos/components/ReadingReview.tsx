'use client'

import { AlertTriangle, FileText, UserCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { SOURCE_KIND_LABELS } from '@/types/contract.types'
import type { TemplatePartyRole } from '@/types/documentTemplate.types'
import { RECEITA_SOURCE, type ReaderResult, type ReadPerson } from '../reading/readerTypes'
import {
  conflictingFields,
  formatPersonField,
  PERSON_FIELD_LABELS,
  PERSON_FIELD_ORDER,
  type PersonDecision,
  type ReviewState,
} from '../reading/reviewState'
import { PartyRolePicker } from './PartyRolePicker'

interface ReadingReviewProps {
  result: ReaderResult
  review: ReviewState
  onChange: (review: ReviewState) => void
  templateRoles: readonly TemplatePartyRole[]
  /** Documentos que ficam de qualquer jeito — o próprio contrato, na importação. */
  requiredDocumentIds?: readonly string[]
  /** CPF/CNPJ de quem já é parte do contrato — começa desmarcado, e diz por quê. */
  existingPartyDocuments?: readonly string[]
}

/** "Estado civil" → "estado civil", mas "RG" fica "RG". */
function inSentence(label: string): string {
  return label === label.toUpperCase() ? label : label.toLowerCase()
}

/**
 * O que o leitor achou, para conferir antes de gravar: os documentos, as
 * pessoas — com cada dado e de onde veio, e os conflitos para escolher — e os
 * valores sugeridos para os campos do modelo. Nada aqui grava.
 */
export function ReadingReview({
  result,
  review,
  onChange,
  templateRoles,
  requiredDocumentIds = [],
  existingPartyDocuments = [],
}: ReadingReviewProps) {
  const sourceName = (id: string) => {
    if (id === RECEITA_SOURCE) return 'Receita (CNPJ)'
    const document = result.documents.find((item) => item.id === id)
    return document ? (SOURCE_KIND_LABELS[document.kind] ?? document.name) : 'documento'
  }

  function setPerson(key: string, patch: Partial<PersonDecision>) {
    onChange({
      ...review,
      persons: { ...review.persons, [key]: { ...review.persons[key], ...patch } },
    })
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Documentos lidos
        </h3>
        <ul className="space-y-1.5">
          {result.documents.map((document) => (
            <li key={document.id} className="flex items-start gap-2.5 rounded-md border px-3 py-2">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <Badge variant="secondary" className="mr-1.5 text-[11px]">
                    {SOURCE_KIND_LABELS[document.kind]}
                  </Badge>
                  {document.summary}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{document.name}</p>
                {document.illegible.length > 0 && (
                  <p className="mt-0.5 flex items-start gap-1 text-[11px] text-warning">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    Ilegível: {document.illegible.join('; ')}
                  </p>
                )}
              </div>
              {!requiredDocumentIds.includes(document.id) && (
                <div className="flex shrink-0 items-center gap-1.5">
                  <Checkbox
                    id={`keep-${document.id}`}
                    checked={review.keepDocuments[document.id] ?? true}
                    onCheckedChange={(checked) =>
                      onChange({
                        ...review,
                        keepDocuments: { ...review.keepDocuments, [document.id]: checked === true },
                      })
                    }
                  />
                  <Label htmlFor={`keep-${document.id}`} className="text-xs font-normal">
                    Guardar
                  </Label>
                </div>
              )}
            </li>
          ))}
        </ul>
        {result.skipped.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
            A IA não leu: {result.skipped.join('; ')}.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Pessoas
        </h3>
        {result.persons.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma pessoa identificada nos documentos.
          </p>
        ) : (
          result.persons.map((person) => (
            <PersonReviewCard
              key={person.key}
              person={person}
              decision={review.persons[person.key]}
              onChange={(patch) => setPerson(person.key, patch)}
              templateRoles={templateRoles}
              sourceName={sourceName}
              alreadyParty={existingPartyDocuments.includes(
                person.fields.document?.[0]?.value ?? '',
              )}
            />
          ))
        )}
      </section>

      {result.fieldSuggestions.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Campos do modelo
          </h3>
          <p className="text-xs text-muted-foreground">
            Entram como valores da minuta, marcados com a origem — dá para mudar na geração.
          </p>
          <ul className="space-y-1.5">
            {result.fieldSuggestions.map((suggestion) => {
              const state = review.suggestions[suggestion.field] ?? { use: true, option: 0 }
              const setState = (patch: Partial<typeof state>) =>
                onChange({
                  ...review,
                  suggestions: {
                    ...review.suggestions,
                    [suggestion.field]: { ...state, ...patch },
                  },
                })
              return (
                <li key={suggestion.field} className="space-y-1 rounded-md border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`suggestion-${suggestion.field}`}
                      checked={state.use}
                      onCheckedChange={(checked) => setState({ use: checked === true })}
                    />
                    <Label htmlFor={`suggestion-${suggestion.field}`} className="text-sm">
                      {suggestion.label}
                    </Label>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {`{${suggestion.field}}`}
                    </span>
                  </div>
                  <OptionList
                    name={`suggestion-${suggestion.field}`}
                    options={suggestion.options.map((option) => ({
                      label: option.value,
                      hint:
                        option.sources.map(sourceName).join(', ') +
                        (option.page ? `, p. ${option.page}` : ''),
                    }))}
                    selected={state.option}
                    onSelect={(option) => setState({ option })}
                    disabled={!state.use}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}

function OptionList({
  name,
  options,
  selected,
  onSelect,
  disabled,
}: {
  name: string
  options: { label: string; hint: string }[]
  selected: number
  onSelect: (index: number) => void
  disabled?: boolean
}) {
  if (options.length === 1) {
    return (
      <p className={cn('pl-6 text-sm', disabled && 'opacity-50')}>
        {options[0].label}
        <span className="ml-1.5 text-[11px] text-muted-foreground">({options[0].hint})</span>
      </p>
    )
  }
  return (
    <div className={cn('space-y-1 pl-6', disabled && 'opacity-50')} role="radiogroup">
      {options.map((option, index) => (
        <label key={`${name}-${index}`} className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="radio"
            name={name}
            checked={selected === index}
            onChange={() => onSelect(index)}
            disabled={disabled}
            className="mt-1 accent-primary"
          />
          <span className="min-w-0">
            {option.label}
            <span className="ml-1.5 text-[11px] text-muted-foreground">({option.hint})</span>
          </span>
        </label>
      ))}
    </div>
  )
}

function PersonReviewCard({
  person,
  decision,
  onChange,
  templateRoles,
  sourceName,
  alreadyParty,
}: {
  person: ReadPerson
  decision: PersonDecision
  onChange: (patch: Partial<PersonDecision>) => void
  templateRoles: readonly TemplatePartyRole[]
  sourceName: (id: string) => string
  alreadyParty: boolean
}) {
  const name = person.fields.name?.[0]?.value ?? 'Sem nome'
  const conflicts = conflictingFields(person)
  const absent = PERSON_FIELD_ORDER.filter(
    (field) =>
      !person.fields[field]?.length &&
      (person.personType === 'company'
        ? ['document', 'address', 'representative'].includes(field)
        : ['document', 'rg', 'marital_status', 'profession', 'nationality', 'address'].includes(
            field,
          )),
  )
  const sources = [...new Set(person.documentIds.map(sourceName))]

  return (
    <div
      className={cn(
        'space-y-3 rounded-lg border p-3 transition-opacity',
        !decision.include && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-start gap-2.5">
        <Checkbox
          id={`person-${person.key}`}
          checked={decision.include}
          onCheckedChange={(checked) => onChange({ include: checked === true })}
          className="mt-1"
        />
        <div className="min-w-0 flex-1">
          <Label htmlFor={`person-${person.key}`} className="text-sm font-medium">
            {name}
          </Label>
          <p className="text-[11px] text-muted-foreground">
            {person.personType === 'company' ? 'Pessoa jurídica' : 'Pessoa física'} · lido de{' '}
            {sources.join(', ')}
          </p>
          {alreadyParty && (
            <p className="text-[11px] text-info">
              Já é parte deste contrato com o mesmo CPF/CNPJ — marque só para incluir de novo.
            </p>
          )}
        </div>
        <div className="w-full sm:w-[220px]">
          <PartyRolePicker
            value={decision.role}
            onChange={(role) => onChange({ role })}
            templateRoles={templateRoles}
          />
        </div>
      </div>

      {person.clientMatch && (
        <div className="space-y-1 rounded-md bg-info/8 px-3 py-2 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <UserCheck className="h-4 w-4 text-info" />
            {person.clientMatch.isClient ? 'Já é cliente' : 'Já cadastrado'}:{' '}
            {person.clientMatch.name}
          </p>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="radio"
              name={`client-${person.key}`}
              checked={decision.useClient}
              onChange={() => onChange({ useClient: true })}
              className="accent-primary"
            />
            Usar o cadastro e completar só o que faltar com o que foi lido
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="radio"
              name={`client-${person.key}`}
              checked={!decision.useClient}
              onChange={() => onChange({ useClient: false })}
              className="accent-primary"
            />
            Usar só o que foi lido (o cadastro não muda em nenhum dos casos)
          </label>
        </div>
      )}

      {conflicts.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          Os documentos discordam em{' '}
          {conflicts.map((field) => inSentence(PERSON_FIELD_LABELS[field])).join(', ')}
          {' — escolha abaixo.'}
        </p>
      )}

      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-[130px_1fr]">
        {PERSON_FIELD_ORDER.filter((field) => person.fields[field]?.length).map((field) => {
          const options = person.fields[field] ?? []
          return (
            <div key={field} className="contents">
              <dt
                className={cn(
                  'text-xs text-muted-foreground sm:pt-0.5',
                  options.length > 1 && 'font-medium text-warning',
                )}
              >
                {PERSON_FIELD_LABELS[field]}
              </dt>
              <dd className="min-w-0 [&>*]:pl-0">
                <OptionList
                  name={`${person.key}-${field}`}
                  options={options.map((option) => ({
                    label: formatPersonField(field, option.value),
                    hint: option.sources.map(sourceName).join(', '),
                  }))}
                  selected={decision.choices[field] ?? 0}
                  onSelect={(index) =>
                    onChange({ choices: { ...decision.choices, [field]: index } })
                  }
                />
              </dd>
            </div>
          )
        })}
      </dl>

      {absent.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Não encontrado nos documentos:{' '}
          {absent.map((field) => inSentence(PERSON_FIELD_LABELS[field])).join(', ')}. Complete
          depois, em Editar a parte.
        </p>
      )}
    </div>
  )
}
