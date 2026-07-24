"use client";

import { useState } from "react";
import {
  GitBranch,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkflows } from "@/features/crm/hooks/useWorkflows";
import {
  useCreateWorkflow,
  useUpdateWorkflow,
  useDeleteWorkflow,
  useCreateColumn,
  useUpdateColumn,
  useDeleteColumn,
  useReorderColumns,
} from "@/features/crm/hooks/useWorkflowMutations";
import {
  countCasesInWorkflow,
  countCasesInColumn,
} from "@/features/crm/services/workflows.service";
import type { Workflow, WorkflowColumn } from "@/types/workflow.types";

const DESC_MAX_LENGTH = 60;

const COLOR_SWATCHES = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
  "#0ea5e9",
  "#3b82f6",
  "#94a3b8",
  "#64748b",
];

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {COLOR_SWATCHES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "h-7 w-7 rounded-full flex items-center justify-center transition-transform hover:scale-110",
            value === c && "ring-2 ring-offset-2 ring-offset-background",
          )}
          style={{
            backgroundColor: c,
            ...(value === c ? { boxShadow: `0 0 0 2px ${c}` } : {}),
          }}
          aria-label={`Cor ${c}`}
        >
          {value === c && <Check className="h-3.5 w-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

// ── Workflow create/edit dialog ──────────────────────────────────────────────

function WorkflowFormDialog({
  open,
  onClose,
  workflow,
}: {
  open: boolean;
  onClose: () => void;
  workflow?: Workflow | null;
}) {
  const isEditing = !!workflow;
  const [nome, setNome] = useState(workflow?.nome ?? "");
  const [descricao, setDescricao] = useState(workflow?.descricao ?? "");
  const [cor, setCor] = useState(workflow?.cor ?? COLOR_SWATCHES[0]);

  const createWf = useCreateWorkflow();
  const updateWf = useUpdateWorkflow();
  const isLoading = createWf.isPending || updateWf.isPending;

  // Re-seed local state whenever the dialog opens for a different workflow.
  const key = `${open}-${workflow?.id ?? "new"}`;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setNome(workflow?.nome ?? "");
    setDescricao(workflow?.descricao ?? "");
    setCor(workflow?.cor ?? COLOR_SWATCHES[0]);
  }

  async function handleSubmit() {
    if (!nome.trim()) {
      toast.error("Informe o nome do workflow.");
      return;
    }
    const input = { nome: nome.trim(), descricao: descricao.trim(), cor };
    if (isEditing && workflow) {
      await updateWf.mutateAsync({ id: workflow.id, input });
    } else {
      await createWf.mutateAsync(input);
    }
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Workflow" : "Novo Workflow"}
          </DialogTitle>
          <DialogDescription>
            Defina o nome, descrição e cor do fluxo de trabalho.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="wf-nome">Nome</Label>
            <Input
              id="wf-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Negociação"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="wf-desc">Descrição</Label>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {descricao.length}/{DESC_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              id="wf-desc"
              value={descricao}
              onChange={(e) =>
                setDescricao(e.target.value.slice(0, DESC_MAX_LENGTH))
              }
              maxLength={DESC_MAX_LENGTH}
              placeholder="Breve descrição do fluxo"
              rows={2}
              className="min-h-0! h-16 max-h-24 resize-none overflow-y-auto wrap-break-word field-sizing-fixed"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <ColorPicker value={cor} onChange={setCor} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isEditing ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Column row (inline edit) ─────────────────────────────────────────────────

function ColumnRow({
  column,
  index,
  total,
  onMove,
}: {
  column: WorkflowColumn;
  index: number;
  total: number;
  onMove: (dir: -1 | 1) => void;
}) {
  const [nome, setNome] = useState(column.nome);
  const [cor, setCor] = useState(column.cor);
  const [limite, setLimite] = useState<string>(
    column.limite != null ? String(column.limite) : "",
  );
  const [editing, setEditing] = useState(false);

  const updateCol = useUpdateColumn();
  const deleteCol = useDeleteColumn();

  async function handleSave() {
    if (!nome.trim()) {
      toast.error("Informe o nome da etapa.");
      return;
    }
    await updateCol.mutateAsync({
      id: column.id,
      input: {
        nome: nome.trim(),
        cor,
        limite: limite.trim() === "" ? null : Number(limite),
      },
    });
    setEditing(false);
  }

  async function handleDelete() {
    const count = await countCasesInColumn(column.id);
    if (count > 0) {
      toast.error(`Não é possível excluir: ${count} caso(s) nesta etapa.`);
      return;
    }
    await deleteCol.mutateAsync(column.id);
  }

  if (editing) {
    return (
      <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
        <div className="flex gap-2">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome da etapa"
            className="flex-1"
          />
          <Input
            type="number"
            min={0}
            value={limite}
            onChange={(e) => setLimite(e.target.value)}
            placeholder="Limite"
            className="w-24"
          />
        </div>
        <ColorPicker value={cor} onChange={setCor} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={updateCol.isPending}>
            Salvar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2 bg-background">
      <div className="flex flex-col">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={index === 0}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          aria-label="Mover para cima"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          className="text-muted-foreground hover:text-foreground disabled:opacity-30"
          aria-label="Mover para baixo"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <div
        className="h-2.5 w-2.5 rounded-full shrink-0"
        style={{ backgroundColor: column.cor }}
      />
      <span className="text-sm font-medium flex-1 truncate">{column.nome}</span>
      {column.limite != null && (
        <span className="text-[11px] text-muted-foreground shrink-0">
          limite {column.limite}
        </span>
      )}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
        aria-label="Editar etapa"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleteCol.isPending}
        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
        aria-label="Excluir etapa"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ── Column editor dialog ──────────────────────────────────────────────────────

function ColumnEditorDialog({
  open,
  onClose,
  workflow,
}: {
  open: boolean;
  onClose: () => void;
  workflow: Workflow | null;
}) {
  const [newName, setNewName] = useState("");
  const createCol = useCreateColumn();
  const reorderCols = useReorderColumns();

  if (!workflow) return null;
  const columns = workflow.colunas;

  async function handleAdd() {
    if (!newName.trim()) {
      toast.error("Informe o nome da etapa.");
      return;
    }
    await createCol.mutateAsync({
      workflowId: workflow!.id,
      input: { nome: newName.trim(), cor: "#94a3b8" },
      posicao: columns.length,
    });
    setNewName("");
  }

  function handleMove(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= columns.length) return;
    const reordered = columns.slice();
    [reordered[index], reordered[target]] = [
      reordered[target],
      reordered[index],
    ];
    reorderCols.mutate(reordered.map((c, i) => ({ id: c.id, posicao: i })));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Etapas · {workflow.nome}</DialogTitle>
          <DialogDescription>
            Adicione, edite, reordene ou remova as etapas deste workflow.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[50vh] overflow-y-auto py-1">
          {columns.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma etapa ainda. Adicione a primeira abaixo.
            </p>
          )}
          {columns.map((col, i) => (
            <ColumnRow
              key={col.id}
              column={col}
              index={i}
              total={columns.length}
              onMove={(dir) => handleMove(i, dir)}
            />
          ))}
        </div>

        <div className="flex gap-2 border-t pt-4">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome da nova etapa"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <Button onClick={handleAdd} disabled={createCol.isPending}>
            <Plus className="h-4 w-4 mr-1.5" />
            Adicionar
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete confirmation ───────────────────────────────────────────────────────

function DeleteWorkflowDialog({
  workflow,
  onClose,
}: {
  workflow: Workflow | null;
  onClose: () => void;
}) {
  const deleteWf = useDeleteWorkflow();
  const [checking, setChecking] = useState(false);

  async function handleConfirm() {
    if (!workflow) return;
    setChecking(true);
    try {
      const count = await countCasesInWorkflow(workflow.id);
      if (count > 0) {
        toast.error(`Não é possível excluir: ${count} caso(s) neste workflow.`);
        return;
      }
      await deleteWf.mutateAsync(workflow.id);
      onClose();
    } finally {
      setChecking(false);
    }
  }

  return (
    <Dialog open={!!workflow} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir workflow</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir <strong>{workflow?.nome}</strong> e
            todas as suas etapas? Esta ação não pode ser desfeita. Workflows com
            casos vinculados não podem ser excluídos.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={checking || deleteWf.isPending}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={checking || deleteWf.isPending}
          >
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function WorkflowsManager() {
  const { data: workflows = [], isLoading } = useWorkflows();

  const [formOpen, setFormOpen] = useState(false);
  const [editingWf, setEditingWf] = useState<Workflow | null>(null);
  const [columnsWf, setColumnsWf] = useState<Workflow | null>(null);
  const [deletingWf, setDeletingWf] = useState<Workflow | null>(null);

  // Keep dialogs bound to the freshest workflow data after mutations.
  const columnsWorkflow = columnsWf
    ? (workflows.find((w) => w.id === columnsWf.id) ?? null)
    : null;

  function openCreate() {
    setEditingWf(null);
    setFormOpen(true);
  }

  function openEdit(wf: Workflow) {
    setEditingWf(wf);
    setFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Workflows</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure os fluxos de trabalho do escritório
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Novo Workflow
        </Button>
      </div>

      <div className="space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-xl border p-5 animate-pulse h-24 bg-muted/10"
              />
            ))}
          </div>
        )}
        {!isLoading && workflows.length === 0 && (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <GitBranch className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhum workflow configurado. Crie o primeiro para começar.
            </p>
          </div>
        )}
        {workflows.map((wf) => (
          <div
            key={wf.id}
            className="rounded-xl border p-5 hover:bg-muted/10 transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div
                  className="h-9 w-9 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: wf.cor + "20" }}
                >
                  <GitBranch
                    className="h-4.5 w-4.5"
                    style={{ color: wf.cor }}
                  />
                </div>
                <div>
                  <p className="text-sm font-semibold">{wf.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {wf.descricao}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setColumnsWf(wf)}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Editar Colunas
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openEdit(wf)}
                  aria-label="Editar workflow"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {wf.id === "wf-processos" ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="sm"
                          variant="outline"
                          disabled
                          className="text-muted-foreground/50"
                          aria-label="Excluir workflow"
                        />
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Workflow reservado para o módulo Processos
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeletingWf(wf)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Excluir workflow"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {wf.colunas.map((col) => (
                <div
                  key={col.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium bg-background"
                >
                  <div
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: col.cor }}
                  />
                  <span className="text-foreground">{col.nome}</span>
                </div>
              ))}
            </div>

            <p className="mt-3 text-[11px] text-muted-foreground">
              {wf.colunas.length} etapas
            </p>
          </div>
        ))}
      </div>

      <WorkflowFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        workflow={editingWf}
      />
      <ColumnEditorDialog
        open={!!columnsWorkflow}
        onClose={() => setColumnsWf(null)}
        workflow={columnsWorkflow}
      />
      <DeleteWorkflowDialog
        workflow={deletingWf}
        onClose={() => setDeletingWf(null)}
      />
    </div>
  );
}
