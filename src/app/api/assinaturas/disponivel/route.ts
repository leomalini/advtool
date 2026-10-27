import { NextResponse } from 'next/server'
import { requireApiPermission } from '@/lib/auth/requireApiPermission'
import { d4signSetupStatus } from '@/lib/d4sign/config'
import { hasServiceRoleKey } from '@/lib/supabase/admin'

/**
 * GET /api/assinaturas/disponivel — se a D4Sign está pronta para envios. As
 * variáveis `D4SIGN_*` só existem no servidor; as abas de Documentos (no
 * cliente, no caso, no processo, no evento) perguntam aqui antes de oferecer
 * "Enviar para assinatura". Só o sim ou o não: o que falta fica em
 * Configurações, para quem administra.
 */
export async function GET() {
  const guard = await requireApiPermission('documentos', 'view')
  if (!guard.ok) return guard.response

  const ready = hasServiceRoleKey() && d4signSetupStatus().problems.length === 0
  return NextResponse.json({ ready })
}
