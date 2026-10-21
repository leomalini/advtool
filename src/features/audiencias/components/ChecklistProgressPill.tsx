import { ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { checklistProgress, isHearingReady, type HearingWithContext } from '@/types/hearing.types'

/**
 * "3/6" do checklist, ou "Pronta". Só depois de o checklist nascer e enquanto
 * a audiência está designada: antes, ele não existe; depois, não importa mais.
 * O mesmo pílula na pauta, na aba do processo e no dashboard.
 */
export function ChecklistProgressPill({ hearing }: { hearing: HearingWithContext }) {
  if (!hearing.checklist_generated_at || hearing.status !== 'designada') return null

  const { resolved, total } = checklistProgress(hearing)
  const ready = isHearingReady(hearing)

  return (
    <span
      title={`Checklist: ${resolved} de ${total} resolvidos`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums',
        ready ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
      )}
    >
      <ClipboardList aria-hidden className="h-2.5 w-2.5" />
      {ready ? 'Pronta' : `${resolved}/${total}`}
    </span>
  )
}
