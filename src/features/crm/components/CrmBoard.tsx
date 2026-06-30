'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { KanbanBoard } from './KanbanBoard'
import { LeadForm } from './LeadForm'
import { useCreateLead } from '../hooks/useLeadMutations'
import { useLeadStages } from '../hooks/useLeads'
import type { CreateLeadInput } from '@/schemas/lead.schema'

export function CrmBoard() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [defaultStageId, setDefaultStageId] = useState<string | undefined>()
  const createLead = useCreateLead()
  const { data: stages } = useLeadStages()

  function handleAddLead(stageId: string) {
    setDefaultStageId(stageId)
    setDialogOpen(true)
  }

  function handleNewLead() {
    setDefaultStageId(stages?.[0]?.id)
    setDialogOpen(true)
  }

  async function handleSubmit(data: CreateLeadInput) {
    await createLead.mutateAsync(data)
    setDialogOpen(false)
  }

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <p className="text-sm text-muted-foreground">
          Gerencie seus leads no pipeline
        </p>
        <Button size="sm" onClick={handleNewLead}>
          <Plus className="h-4 w-4 mr-1.5" />
          Novo Lead
        </Button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-hidden px-6 py-4">
        <KanbanBoard onAddLead={handleAddLead} />
      </div>

      {/* New Lead Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Lead</DialogTitle>
          </DialogHeader>
          <LeadForm
            defaultStageId={defaultStageId}
            onSubmit={handleSubmit}
            isLoading={createLead.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
