'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <Button variant="outline" className="w-full" onClick={handleSignOut}>
      <LogOut className="mr-2 h-4 w-4" />
      Sair
    </Button>
  )
}
