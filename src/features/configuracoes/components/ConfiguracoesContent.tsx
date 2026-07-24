'use client'

import { useState } from 'react'
import { useTheme } from 'next-themes'
import {
  Users,
  Scale,
  GitBranch,
  Tag,
  Settings,
  Plus,
  Pencil,
  UserPlus,
  Building2,
  Upload,
  Save,
  Palette,
  Sun,
  Moon,
  Monitor,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ADVOGADOS, AREAS_JURIDICAS, ETIQUETAS } from '@/data/mock'
import { WorkflowsManager } from './WorkflowsManager'
import type { AreaJuridica, EtiquetaId } from '@/data/mock'
import { cn } from '@/lib/utils'

// ── Theme Preview Card ─────────────────────────────────────────

interface ThemeOption {
  value: 'light' | 'dark' | 'system'
  label: string
  icon: React.ElementType
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

function LightPreview() {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-md border border-slate-200">
      {/* Sidebar */}
      <div className="w-8 shrink-0 bg-white border-r border-slate-200 flex flex-col gap-1 p-1 pt-2">
        <div className="w-4 h-1 rounded-full bg-blue-500 mx-auto mb-1" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className={cn('h-1 rounded-full mx-auto', i === 0 ? 'w-5 bg-blue-100' : 'w-4 bg-slate-200')} />
        ))}
      </div>
      {/* Content */}
      <div className="flex-1 bg-[#f2f3f8] p-1.5 space-y-1">
        <div className="grid grid-cols-2 gap-1">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded p-1">
              <div className="h-1 w-4 bg-slate-200 rounded mb-0.5" />
              <div className="h-2 w-3 bg-blue-500/30 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded p-1">
          <div className="h-1 w-6 bg-slate-200 rounded mb-0.5" />
          <div className="space-y-0.5">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-1 bg-slate-100 rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function DarkPreview() {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-md border border-[#2a2d3e]">
      {/* Sidebar */}
      <div className="w-8 shrink-0 bg-[#252838] border-r border-[#2a2d3e] flex flex-col gap-1 p-1 pt-2">
        <div className="w-4 h-1 rounded-full bg-blue-400 mx-auto mb-1" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className={cn('h-1 rounded-full mx-auto', i === 0 ? 'w-5 bg-blue-400/20' : 'w-4 bg-[#3a3d50]')} />
        ))}
      </div>
      {/* Content */}
      <div className="flex-1 bg-[#1a1d2c] p-1.5 space-y-1">
        <div className="grid grid-cols-2 gap-1">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-[#252838] rounded p-1">
              <div className="h-1 w-4 bg-[#3a3d50] rounded mb-0.5" />
              <div className="h-2 w-3 bg-blue-400/30 rounded" />
            </div>
          ))}
        </div>
        <div className="bg-[#252838] rounded p-1">
          <div className="h-1 w-6 bg-[#3a3d50] rounded mb-0.5" />
          <div className="space-y-0.5">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-1 bg-[#2f3244] rounded" />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SystemPreview() {
  return (
    <div className="flex h-full w-full overflow-hidden rounded-md border border-slate-200 relative">
      {/* Left half — light */}
      <div className="flex w-1/2 overflow-hidden">
        <div className="w-7 shrink-0 bg-white flex flex-col gap-1 p-1 pt-2">
          <div className="w-3 h-1 rounded-full bg-blue-500 mx-auto mb-1" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-1 w-3 bg-slate-200 rounded mx-auto" />
          ))}
        </div>
        <div className="flex-1 bg-[#f2f3f8] p-1 space-y-1">
          <div className="bg-white rounded p-0.5">
            <div className="h-1 w-4 bg-slate-200 rounded" />
          </div>
          <div className="bg-white rounded p-0.5">
            <div className="h-1 w-3 bg-slate-100 rounded" />
          </div>
        </div>
      </div>
      {/* Divider */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300 z-10" />
      {/* Right half — dark */}
      <div className="flex w-1/2 overflow-hidden">
        <div className="flex-1 bg-[#1a1d2c] p-1 space-y-1">
          <div className="bg-[#252838] rounded p-0.5">
            <div className="h-1 w-4 bg-[#3a3d50] rounded" />
          </div>
          <div className="bg-[#252838] rounded p-0.5">
            <div className="h-1 w-3 bg-[#2f3244] rounded" />
          </div>
        </div>
        <div className="w-7 shrink-0 bg-[#252838] flex flex-col gap-1 p-1 pt-2">
          <div className="w-3 h-1 rounded-full bg-blue-400 mx-auto mb-1" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-1 w-3 bg-[#3a3d50] rounded mx-auto" />
          ))}
        </div>
      </div>
    </div>
  )
}

function ThemeCard({
  option,
  isActive,
  onClick,
}: {
  option: ThemeOption
  isActive: boolean
  onClick: () => void
}) {
  const Icon = option.icon

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col rounded-xl border-2 p-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isActive
          ? 'border-primary bg-accent/30'
          : 'border-border hover:border-muted-foreground/40 hover:bg-muted/30',
      )}
    >
      {/* Preview */}
      <div className="aspect-video w-full mb-2.5">
        {option.value === 'light' && <LightPreview />}
        {option.value === 'dark' && <DarkPreview />}
        {option.value === 'system' && <SystemPreview />}
      </div>

      {/* Label row */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <Icon className={cn('h-3.5 w-3.5', isActive ? 'text-primary' : 'text-muted-foreground')} />
          <span className={cn('text-xs font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}>
            {option.label}
          </span>
        </div>
        {isActive && (
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
            <Check className="h-2.5 w-2.5 text-primary-foreground" />
          </div>
        )}
      </div>
    </button>
  )
}

// ── Helpers ────────────────────────────────────────────────────

type TabValue = 'usuarios' | 'areas' | 'workflows' | 'etiquetas' | 'geral'

const TABS: { value: TabValue; label: string; icon: React.ElementType }[] = [
  { value: 'geral', label: 'Geral', icon: Settings },
  { value: 'usuarios', label: 'Usuários', icon: Users },
  { value: 'areas', label: 'Áreas Jurídicas', icon: Scale },
  { value: 'workflows', label: 'Workflows', icon: GitBranch },
  { value: 'etiquetas', label: 'Etiquetas', icon: Tag },
]

// ── Aba Usuários ───────────────────────────────────────────────

function TabUsuarios() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Usuários do Escritório</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ADVOGADOS.length} usuário{ADVOGADOS.length !== 1 ? 's' : ''} cadastrados
          </p>
        </div>
        <Button size="sm">
          <UserPlus className="h-3.5 w-3.5 mr-1.5" />
          Convidar Usuário
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_200px_160px_100px] gap-4 px-5 py-2.5 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
          <div className="w-9" />
          <span>Nome</span>
          <span>OAB</span>
          <span>Perfil</span>
          <span />
        </div>
        <div className="divide-y">
          {ADVOGADOS.map((adv) => (
            <div
              key={adv.id}
              className="grid grid-cols-[auto_1fr_200px_160px_100px] gap-4 px-5 py-4 items-center hover:bg-muted/20 transition-colors"
            >
              {/* Avatar */}
              <div
                className={cn(
                  'h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-semibold',
                  adv.cor,
                )}
              >
                {adv.iniciais}
              </div>

              {/* Nome + email */}
              <div>
                <p className="text-sm font-medium">{adv.nome}</p>
                <p className="text-xs text-muted-foreground">{adv.email}</p>
              </div>

              {/* OAB */}
              <p className="text-sm text-muted-foreground font-mono">{adv.oab}</p>

              {/* Perfil */}
              <span
                className={cn(
                  'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
                  adv.id === 'adv-1'
                    ? 'bg-chart-2/12 text-chart-2 border-chart-2/25'
                    : 'bg-info/12 text-info border-info/25',
                )}
              >
                {adv.id === 'adv-1' ? 'Admin' : 'Advogado'}
              </span>

              {/* Ação */}
              <div className="flex justify-end">
                <button
                  type="button"
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Aba Áreas Jurídicas ────────────────────────────────────────

function TabAreas() {
  const [ativos, setAtivos] = useState<Record<string, boolean>>(
    Object.fromEntries(Object.keys(AREAS_JURIDICAS).map((k) => [k, true])),
  )

  function toggleArea(area: AreaJuridica) {
    setAtivos((prev) => ({ ...prev, [area]: !prev[area] }))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Áreas Jurídicas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure as áreas de atuação do escritório
          </p>
        </div>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Nova Área
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-2.5 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
          <span>Área</span>
          <span>Status</span>
          <span />
        </div>
        <div className="divide-y">
          {(Object.entries(AREAS_JURIDICAS) as [AreaJuridica, { label: string; color: string; bg: string }][]).map(
            ([area, info]) => (
              <div
                key={area}
                className="grid grid-cols-[1fr_auto_auto] gap-4 px-5 py-3.5 items-center hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      info.bg,
                      info.color,
                    )}
                  >
                    {info.label}
                  </span>
                </div>

                {/* Toggle */}
                <button
                  type="button"
                  onClick={() => toggleArea(area)}
                  className={cn(
                    'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                    ativos[area] ? 'bg-success' : 'bg-muted-foreground/30',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
                      ativos[area] ? 'translate-x-4' : 'translate-x-1',
                    )}
                  />
                </button>

                {/* Editar */}
                <button
                  type="button"
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  )
}

// ── Aba Etiquetas ──────────────────────────────────────────────

function TabEtiquetas() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Etiquetas</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organize casos e tarefas com etiquetas personalizadas
          </p>
        </div>
        <Button size="sm">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Nova Etiqueta
        </Button>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] gap-4 px-5 py-2.5 bg-muted/30 border-b text-xs font-medium text-muted-foreground">
          <span>Etiqueta</span>
          <span />
        </div>
        <div className="divide-y">
          {(Object.entries(ETIQUETAS) as [EtiquetaId, { id: EtiquetaId; label: string; color: string; textColor: string }][]).map(
            ([id, etiqueta]) => (
              <div
                key={id}
                className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3 items-center hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                      etiqueta.color,
                      etiqueta.textColor,
                    )}
                  >
                    {etiqueta.label}
                  </span>
                </div>
                <button
                  type="button"
                  className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  )
}

// ── Aba Geral ──────────────────────────────────────────────────

function TabGeral() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold">Configurações Gerais</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Informações do escritório e preferências do sistema
        </p>
      </div>

      {/* Aparência */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Palette className="h-4 w-4 text-muted-foreground" />
            Aparência
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {THEME_OPTIONS.map((option) => (
              <ThemeCard
                key={option.value}
                option={option}
                isActive={theme === option.value}
                onClick={() => setTheme(option.value)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Informações do Escritório
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Logo */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Logo do Escritório</label>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-xl border-2 border-dashed border-border flex items-center justify-center bg-muted/30">
                <Building2 className="h-6 w-6 text-muted-foreground/40" />
              </div>
              <Button size="sm" variant="outline">
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Fazer Upload
              </Button>
            </div>
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Nome do Escritório</label>
            <Input
              defaultValue="Souza & Lima Advogados Associados"
              className="h-9 text-sm"
            />
          </div>

          {/* OABs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">OAB Principal</label>
              <Input defaultValue="OAB/SP 123.456" className="h-9 text-sm font-mono" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">OAB Secundária</label>
              <Input defaultValue="OAB/SP 789.012" className="h-9 text-sm font-mono" />
            </div>
          </div>

          {/* Endereço */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">Endereço</label>
            <Input
              defaultValue="Av. Paulista, 1234 — Sala 810, Bela Vista, São Paulo/SP — 01310-100"
              className="h-9 text-sm"
            />
          </div>

          {/* Email */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">E-mail de Contato</label>
              <Input defaultValue="contato@souzalima.adv.br" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Telefone</label>
              <Input defaultValue="(11) 3456-7890" className="h-9 text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Botão Salvar */}
      <div className="flex justify-end">
        <Button size="sm">
          <Save className="h-3.5 w-3.5 mr-1.5" />
          Salvar Alterações
        </Button>
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function ConfiguracoesContent() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Gerencie usuários, áreas jurídicas, workflows e preferências do sistema
        </p>
      </div>

      <Tabs defaultValue="geral">
        <TabsList variant="line" className="border-b w-full rounded-none pb-0 gap-0 h-auto">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-none text-sm h-auto"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="pt-5">
          <TabsContent value="usuarios">
            <TabUsuarios />
          </TabsContent>
          <TabsContent value="areas">
            <TabAreas />
          </TabsContent>
          <TabsContent value="workflows">
            <WorkflowsManager />
          </TabsContent>
          <TabsContent value="etiquetas">
            <TabEtiquetas />
          </TabsContent>
          <TabsContent value="geral">
            <TabGeral />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
