import { Link, Section, Text } from '@react-email/components'
import type { OfficeIdentity } from '@/lib/email/office'
import { EMAIL_COLORS, EmailButton, EmailLayout, emailMutedText, emailText } from './EmailLayout'

/** Um ato, já em palavras: o dia e o tipo — nunca o texto do tribunal
 * (decisão 2 de docs/emails-clientes.md). */
export interface DigestAct {
  id: string
  /** 'dd/MM/yyyy'. */
  day: string
  label: string
}

export interface DigestProcess {
  id: string
  /** O nome do caso, como o portal mostra; null cai no número. */
  title: string | null
  cnj: string | null
  acts: DigestAct[]
}

export interface ProcessDigestEmailProps {
  office: OfficeIdentity
  greetingName: string | null
  processes: DigestProcess[]
  portalUrl: string
  unsubscribeUrl: string
  /** As perguntas prontas do portal ("Tirar dúvidas") estão ligadas. */
  showAnswersHint: boolean
}

export function processDigestSubject(processCount: number, office: OfficeIdentity): string {
  const head = processCount === 1 ? 'Novidade no seu processo' : `Novidades em ${processCount} processos`
  return office.name ? `${head} — ${office.name}` : head
}

/**
 * O resumo diário. Diz QUE algo aconteceu e quando; o QUÊ fica no portal,
 * atrás da confirmação do CPF/CNPJ — o e-mail pode ser encaminhado e mora na
 * caixa de terceiros, inclusive em processo sob segredo de justiça.
 */
export function ProcessDigestEmail({
  office,
  greetingName,
  processes,
  portalUrl,
  unsubscribeUrl,
  showAnswersHint,
}: ProcessDigestEmailProps) {
  const preview =
    processes.length === 1
      ? 'Houve andamento no seu processo.'
      : `Houve andamento em ${processes.length} processos seus.`

  return (
    <EmailLayout preview={preview} office={office}>
      <Text style={emailText}>{greetingName ? `Olá, ${greetingName}!` : 'Olá!'}</Text>
      <Text style={emailText}>
        {processes.length === 1
          ? 'Houve andamento no seu processo:'
          : 'Houve andamento nos seus processos:'}
      </Text>

      {processes.map((process) => (
        <Section
          key={process.id}
          style={{
            margin: '0 0 16px',
            padding: '16px',
            border: `1px solid ${EMAIL_COLORS.border}`,
            borderRadius: '8px',
          }}
        >
          <Text style={{ ...emailText, margin: 0, fontWeight: 600 }}>
            {process.title ?? (process.cnj ? `Processo ${process.cnj}` : 'Processo')}
          </Text>
          {process.title && process.cnj && (
            <Text style={{ ...emailMutedText, margin: '2px 0 0' }}>Processo {process.cnj}</Text>
          )}
          {process.acts.map((act) => (
            <Text key={act.id} style={{ ...emailText, margin: '8px 0 0', fontSize: '14px' }}>
              <span style={{ color: EMAIL_COLORS.subtle }}>{act.day}</span> · {act.label}
            </Text>
          ))}
        </Section>
      ))}

      <Text style={emailText}>O que cada ato diz está no portal, na íntegra.</Text>

      <EmailButton href={portalUrl}>Ver andamento completo</EmailButton>

      {showAnswersHint && (
        <Text style={emailText}>
          No portal, em “Tirar dúvidas”, você encontra a explicação em linguagem simples.
        </Text>
      )}

      <Text style={{ ...emailMutedText, margin: '24px 0 0' }}>
        Você recebe este resumo porque o escritório o ativou para acompanhar seus processos.{' '}
        <Link href={unsubscribeUrl} style={{ color: EMAIL_COLORS.muted, textDecoration: 'underline' }}>
          Não quero mais receber estes resumos
        </Link>
        .
      </Text>
    </EmailLayout>
  )
}
