import { create } from 'zustand'
import type { LeadWithRelations } from '@/types/lead.types'

interface CrmState {
  selectedLead: LeadWithRelations | null
  drawerOpen: boolean
  searchQuery: string
  filterOrigin: string | null
  filterAssignee: string | null
  setSelectedLead: (lead: LeadWithRelations | null) => void
  openDrawer: (lead: LeadWithRelations) => void
  closeDrawer: () => void
  setSearchQuery: (q: string) => void
  setFilterOrigin: (origin: string | null) => void
  setFilterAssignee: (assigneeId: string | null) => void
  clearFilters: () => void
}

export const useCrmStore = create<CrmState>((set) => ({
  selectedLead: null,
  drawerOpen: false,
  searchQuery: '',
  filterOrigin: null,
  filterAssignee: null,
  setSelectedLead: (lead) => set({ selectedLead: lead }),
  openDrawer: (lead) => set({ selectedLead: lead, drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false, selectedLead: null }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  setFilterOrigin: (origin) => set({ filterOrigin: origin }),
  setFilterAssignee: (assigneeId) => set({ filterAssignee: assigneeId }),
  clearFilters: () => set({ searchQuery: '', filterOrigin: null, filterAssignee: null }),
}))
