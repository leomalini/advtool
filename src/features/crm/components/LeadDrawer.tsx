'use client'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Phone, Mail, Trash2 } from 'lucide-react'
import { useCrmStore } from '@/store/crm.store'
import { useDeleteLead } from '../hooks/useLeadMutations'
import { LeadComments } from './LeadComments'
import { LeadTimeline } from './LeadTimeline'
import { LEAD_ORIGIN_LABELS } from '@/types/lead.types'
import { formatDate } from '@/utils/date'

export function LeadDrawer() {
  const { selectedLead, drawerOpen, closeDrawer } = useCrmStore()
  const deleteLead = useDeleteLead()

  if (!selectedLead) return null

  async function handleDelete() {
    if (!confirm('Tem certeza que deseja remover este lead?')) return
    await deleteLead.mutateAsync(selectedLead!.id)
    closeDrawer()
  }

  return (
    <Sheet open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader className="space-y-1">
          <SheetTitle className="text-base">{selectedLead.name}</SheetTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              style={{ backgroundColor: `${selectedLead.stage?.color}20`, color: selectedLead.stage?.color }}
            >
              {selectedLead.stage?.name}
            </Badge>
            {selectedLead.origin && (
              <Badge variant="outline" className="text-xs">
                {LEAD_ORIGIN_LABELS[selectedLead.origin]}
              </Badge>
            )}
          </div>
        </SheetHeader>

        <Separator />

        {/* Contact Info */}
        <div className="space-y-2 py-1">
          {selectedLead.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <a href={`tel:${selectedLead.phone}`} className="hover:underline">
                {selectedLead.phone}
              </a>
            </div>
          )}
          {selectedLead.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <a href={`mailto:${selectedLead.email}`} className="hover:underline">
                {selectedLead.email}
              </a>
            </div>
          )}
          {selectedLead.notes && (
            <p className="text-sm text-muted-foreground bg-muted/50 rounded-md p-2 mt-1">
              {selectedLead.notes}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Criado em {formatDate(selectedLead.created_at)}
            {selectedLead.assignee && ` · ${selectedLead.assignee.full_name}`}
          </p>
        </div>

        <Separator />

        <Tabs defaultValue="comments" className="flex-1 flex flex-col min-h-0">
          <TabsList className="w-full">
            <TabsTrigger value="comments" className="flex-1">Comentários</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">Histórico</TabsTrigger>
          </TabsList>
          <TabsContent value="comments" className="flex-1 overflow-y-auto mt-3">
            <LeadComments leadId={selectedLead.id} />
          </TabsContent>
          <TabsContent value="history" className="flex-1 overflow-y-auto mt-3">
            <LeadTimeline leadId={selectedLead.id} />
          </TabsContent>
        </Tabs>

        <Separator />

        <div className="flex justify-end">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleteLead.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Remover Lead
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
