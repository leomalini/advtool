import type { Metadata } from 'next'
import { Geist_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

/** Interface. Plano em docs/redesign-visual.md. */
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
})

/** Números de processo, horários e teclas de atalho. */
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'AdvTool — Gestão do Escritório',
  description: 'Plataforma de gestão jurídica',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${plusJakartaSans.variable} ${geistMono.variable} font-sans h-full antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
