"use client";

import { useState } from "react";
import { Plus, Kanban, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { WorkflowSelector } from "./WorkflowSelector";
import { CrmKanbanBoard } from "./CrmKanbanBoard";
import { CrmTableView } from "./CrmTableView";
import { CrmFilterBar } from "./CrmFilterBar";
import {
  filterCases,
  emptyCrmFilters,
  type CrmFilters,
} from "../utils/filterCases";
import { CasoModal } from "./CasoModal";
import { CasoForm } from "./CasoForm";
import { useCrmUiStore } from "../stores/casos.store";
import { useCrmItems, useCrmItemCounts } from "../hooks/useCrmItems";
import { useCreateCrmItem, useUpdateCrmItem } from "../hooks/useCrmItemMutations";
import { useWorkflows } from "../hooks/useWorkflows";
import type { CrmItemInput } from "@/schemas/crmItem.schema";

type ViewMode = "kanban" | "table";

export function CrmWorkboard() {
  const [selectedWorkflowId, setSelectedWorkflowId] = useState("wf-negociacao");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [filters, setFilters] = useState<CrmFilters>(emptyCrmFilters);

  const {
    modalOpen,
    selectedCaseId,
    openModal,
    closeModal,
    createModalOpen,
    createForColumnId,
    openCreateModal,
    closeCreateModal,
  } = useCrmUiStore();

  const { data: workflows = [] } = useWorkflows();
  const { data: cases = [] } = useCrmItems(selectedWorkflowId);
  const { data: caseCounts = {} } = useCrmItemCounts();
  const selectedCase = selectedCaseId
    ? (cases.find((c) => c.id === selectedCaseId) ?? null)
    : null;
  const selectedWorkflow = workflows.find((w) => w.id === selectedWorkflowId);

  const createCase = useCreateCrmItem(selectedWorkflowId);
  const updateCase = useUpdateCrmItem(selectedCaseId ?? "", selectedWorkflowId);

  async function handleCreateSubmit(data: CrmItemInput) {
    await createCase.mutateAsync(data);
    closeCreateModal();
  }

  async function handleEditSubmit(data: CrmItemInput) {
    await updateCase.mutateAsync(data);
    setEditModalOpen(false);
  }

  function handleEditOpen() {
    setEditModalOpen(true);
  }

  if (!selectedWorkflow) return null;

  // Counts for every workflow (badges on the tabs). The active workflow's count
  // uses the freshly-loaded cases so it stays in sync right after mutations.
  const workflowCounts: Record<string, number> = {
    ...caseCounts,
    [selectedWorkflowId]: cases.length,
  };

  const filteredCases = filterCases(cases, filters);

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Toolbar — 3-column grid keeps the workflow selector centered regardless
          of how long the workflow name/description on the left is. */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-3.5 border-b bg-card shrink-0 gap-4">
        {/* Left: workflow name + description stacked (description below name so it
            never runs behind the centered tabs) */}
        <div className="flex items-center gap-2.5 min-w-0 justify-self-start overflow-hidden">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: selectedWorkflow.cor }}
          />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate leading-tight">
              {selectedWorkflow.nome}
            </h1>
            {selectedWorkflow.descricao && (
              <p className="text-xs text-muted-foreground truncate leading-tight">
                {selectedWorkflow.descricao}
              </p>
            )}
          </div>
        </div>

        {/* Center: workflow selector — capped width; scrolls horizontally when
            there are more tabs than fit, instead of overlapping siblings. */}
        <div className="justify-self-center min-w-0 max-w-[50vw]">
          <WorkflowSelector
            selectedId={selectedWorkflowId}
            counts={workflowCounts}
            onChange={setSelectedWorkflowId}
          />
        </div>

        {/* Right: view switcher + new case button */}
        <div className="flex items-center gap-2 flex-shrink-0 justify-self-end">
          <div className="flex items-center gap-0.5 bg-muted border border-border rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("kanban")}
              aria-label="Visão Kanban"
              className={cn(
                "flex items-center justify-center w-[26px] h-6 rounded-md transition-colors",
                viewMode === "kanban"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Kanban className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("table")}
              aria-label="Visão em tabela"
              className={cn(
                "flex items-center justify-center w-[26px] h-6 rounded-md transition-colors",
                viewMode === "table"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <Button size="sm" onClick={() => openCreateModal()}>
            <Plus className="h-4 w-4 mr-1.5" />
            Novo Item
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-6 py-2.5 border-b bg-card flex-shrink-0">
        <CrmFilterBar
          filters={filters}
          onChange={setFilters}
          resultCount={filteredCases.length}
        />
      </div>

      {/* Board */}
      {viewMode === "kanban" ? (
        <div className="flex-1 overflow-hidden px-6 pt-5 pb-0">
          <CrmKanbanBoard workflow={selectedWorkflow} filters={filters} />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <CrmTableView
            workflow={selectedWorkflow}
            cases={filteredCases}
            onRowClick={(caso) => openModal(caso.id)}
          />
        </div>
      )}

      {/* Case Detail Modal */}
      {selectedCase && (
        <CasoModal
          caso={selectedCase}
          open={modalOpen && !editModalOpen}
          onClose={closeModal}
          onEdit={handleEditOpen}
        />
      )}

      {/* Edit Case Form */}
      {selectedCase && (
        <CasoForm
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          onSuccess={() => {}}
          editingCase={selectedCase}
          onSubmit={handleEditSubmit}
          isLoading={updateCase.isPending}
        />
      )}

      {/* Create Case Form */}
      <CasoForm
        open={createModalOpen}
        onClose={closeCreateModal}
        onSuccess={() => {}}
        defaultValues={{
          workflow_id: selectedWorkflowId,
          column_id: createForColumnId ?? selectedWorkflow.colunas[0]?.id ?? "",
          tags: [],
        }}
        onSubmit={handleCreateSubmit}
        isLoading={createCase.isPending}
      />
    </div>
  );
}
