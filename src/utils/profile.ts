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

export const PROFILE_ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  attorney: 'Advogado',
}

export function getRoleLabel(role: string): string {
  return PROFILE_ROLE_LABELS[role] ?? role
}
