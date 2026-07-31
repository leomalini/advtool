export function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

/** Some seeded/test profiles have their e-mail stored in full_name — turn that into a readable name instead of showing the raw address. */
export function getDisplayName(fullName: string): string {
  if (!fullName || !fullName.includes('@')) return fullName
  const local = fullName.split('@')[0]
  return local
    .replace(/[._-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

/** Avatar tint for a profile. Derived from the id rather than stored, so every
 * surface renders the same person in the same colour without a DB column —
 * and new profiles get one automatically. */
const AVATAR_TONES = [
  'bg-chart-1',
  'bg-chart-2',
  'bg-chart-3',
  'bg-chart-4',
  'bg-chart-5',
] as const

export function getAvatarTone(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length]
}

export const PROFILE_ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  attorney: 'Advogado',
}

export function getRoleLabel(role: string): string {
  return PROFILE_ROLE_LABELS[role] ?? role
}
