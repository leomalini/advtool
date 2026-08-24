import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const next = requestUrl.searchParams.get('next')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // O link de convite chega com `next=/definir-senha`, porque quem entra por
  // convite ainda não tem senha.
  //
  // Só caminhos relativos são aceitos: sem esta checagem, um `next=https://…`
  // transformaria o callback num open redirect — e um redirect que sai de um
  // domínio confiável é exatamente o que dá credibilidade a um phishing.
  // `//host` também é rejeitado: o browser o trata como URL protocol-relative.
  const destino =
    next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'

  return NextResponse.redirect(new URL(destino, request.url))
}
