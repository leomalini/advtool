import { cn } from '@/lib/utils'
import { getDisplayName, getInitials, getRoleLabel } from '@/utils/profile'
import type { Profile } from '@/types/common.types'

interface ProfileOptionProps {
  profile: Profile
  className?: string
}

/** Avatar + name + role — used in assignee dropdowns/selects across CRM and Processos. */
export function ProfileOption({ profile, className }: ProfileOptionProps) {
  const displayName = getDisplayName(profile.full_name)
  return (
    <div className={cn('flex items-center gap-2.5 min-w-0', className)}>
      <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9.5px] font-bold bg-accent text-accent-foreground shrink-0">
        {getInitials(displayName)}
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[13px] font-medium leading-tight truncate">{displayName}</span>
        <span className="text-[10.5px] text-muted-foreground leading-tight">{getRoleLabel(profile.role)}</span>
      </div>
    </div>
  )
}

/** Compact one-line variant for trigger/value slots where vertical space is tight (e.g. a Select trigger). */
export function ProfileOptionCompact({ profile, className }: ProfileOptionProps) {
  const displayName = getDisplayName(profile.full_name)
  return (
    <span className={cn('flex items-center gap-2 min-w-0', className)}>
      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[8.5px] font-bold bg-accent text-accent-foreground shrink-0">
        {getInitials(displayName)}
      </span>
      <span className="truncate">{displayName}</span>
    </span>
  )
}
