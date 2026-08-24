'use client'

import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

/** Usa o mesmo `signOut` da Sidebar — havia duas implementações, e só esta
 * navegava. Uma só evita que voltem a divergir. */
export function SignOutButton() {
  const { signOut } = useAuth()

  return (
    <Button variant="outline" className="w-full" onClick={signOut}>
      <LogOut className="mr-2 h-4 w-4" />
      Sair
    </Button>
  )
}
