# Roadmap — Plataforma Jurídica

> Plataforma de gestão para escritório de advocacia.  
> Inspirada no ADVBOX, com foco em UX superior, fluxos simples e alta produtividade.

---

## Visão Geral

```
MVP (validação interna) → v2 (processos) → v3 (financeiro) → SaaS
```

**Princípios:**
- Simplicidade antes de features
- Cada fase deve ser utilizável em produção antes de avançar
- Nenhum overengineering — só adiciona complexidade quando justificado

---

## MVP — Fase Atual

### Fase 0 — Setup e Infraestrutura
**Status:** Concluído

- [x] Next.js 15 + TypeScript strict
- [x] Supabase + PostgreSQL + RLS
- [x] shadcn/ui + Tailwind CSS
- [x] TanStack Query + Zustand
- [x] Feature-based architecture
- [x] Supabase Auth + middleware de rotas
- [x] Layout base: Sidebar + Header
- [x] SQL schema completo
- [x] Tipos TypeScript + Schemas Zod

---

### Fase 1 — CRM Jurídico
**Status:** Em andamento | **Prioridade:** P0

O CRM é o módulo de maior impacto imediato. É onde mais tempo é perdido em ferramentas como ADVBOX.

**Funcionalidades:**
- [ ] Kanban com 7 etapas do pipeline
- [ ] Drag & drop entre colunas
- [ ] Card do lead: nome, telefone, origem, data
- [ ] Drawer lateral de detalhes do lead
- [ ] Criar / editar / excluir lead
- [ ] Mover lead + registrar histórico de movimentos
- [ ] Comentários no lead
- [ ] Timeline de movimentações
- [ ] Pesquisa por nome
- [ ] Filtros: etapa, origem, responsável

**Etapas do Pipeline:**
1. Novo Lead
2. Contato Realizado
3. Reunião Agendada
4. Proposta Enviada
5. Contrato Assinado
6. Cliente Ativo
7. Perdido

---

### Fase 2 — Clientes
**Status:** Pendente | **Prioridade:** P0

- [ ] Lista de clientes com busca
- [ ] Cadastro Pessoa Física (nome, CPF, telefone, email, endereço)
- [ ] Cadastro Pessoa Jurídica (razão social, CNPJ, responsável)
- [ ] Conversão Lead → Cliente (dados pré-preenchidos)
- [ ] Perfil do cliente com tabs:
  - Visão geral
  - Timeline de atividades
  - Tarefas vinculadas
  - Eventos vinculados
  - Anexos (PDF, DOC, imagens)
- [ ] Upload de anexos via Supabase Storage

---

### Fase 3 — Tarefas
**Status:** Pendente | **Prioridade:** P0

Inspirado em Trello e ClickUp.

- [ ] Kanban com 4 colunas: A Fazer / Em Andamento / Aguardando / Concluído
- [ ] Criar / editar / excluir tarefa
- [ ] Prioridade: Baixa / Média / Alta / Urgente
- [ ] Data limite + alerta visual para tarefas atrasadas
- [ ] Checklist de itens
- [ ] Comentários na tarefa
- [ ] Atribuir responsável
- [ ] Vincular a cliente ou lead
- [ ] Vista em lista (alternativa ao kanban)

---

### Fase 4 — Agenda
**Status:** Pendente | **Prioridade:** P1

- [ ] Calendário mensal (padrão)
- [ ] Vista semanal e diária
- [ ] Tipos de evento: Reunião / Audiência / Prazo / Compromisso
- [ ] Cores distintas por tipo
- [ ] Criar / editar / excluir evento
- [ ] Drag & drop para reagendar
- [ ] Vincular evento a cliente ou lead
- [ ] Atribuir responsável

---

### Fase 5 — Dashboard + Polimento
**Status:** Pendente | **Prioridade:** P1

- [ ] Cards de estatísticas com dados reais:
  - Leads ativos
  - Reuniões na semana
  - Tarefas pendentes
  - Clientes ativos
- [ ] Feed de atividades recentes (global)
- [ ] Próximas reuniões do dia
- [ ] Tarefas urgentes / atrasadas
- [ ] Triggers SQL para log automático de atividades
- [ ] Responsividade mobile
- [ ] Testes de fluxo ponta a ponta
- [ ] Ajustes de UX baseados em uso real

---

## v2.0 — Processos Jurídicos
**Estimativa:** 3 meses após go-live do MVP

### Módulo de Processos
- [ ] Cadastro de processo (número CNJ, tribunal, vara, tipo, status)
- [ ] Partes: autor, réu, advogado adverso
- [ ] Andamentos processuais
- [ ] Prazos vinculados à Agenda
- [ ] Documentos por processo
- [ ] Vinculação processo ↔ cliente

### Integração CNJ (futura)
- [ ] Consulta de andamentos via API pública do CNJ

---

## v2.1 — Financeiro
**Estimativa:** 4-5 meses após go-live do MVP

- [ ] Honorários: contrato, parcelas, recorrências
- [ ] Registro de pagamentos recebidos
- [ ] Despesas processuais e do escritório
- [ ] Relatórios:
  - Receita por mês
  - Honorários em aberto
  - Receita por área do direito

---

## v2.2 — Portal do Cliente
**Estimativa:** 6 meses após go-live do MVP

- [ ] Login separado para clientes (role distinta no Supabase)
- [ ] Visão limitada: processos, documentos, eventos
- [ ] Aprovação de documentos
- [ ] Mensagens entre advogado e cliente

---

## v2.3 — Inteligência Artificial
**Estimativa:** Após v2.2 estabilizar

- [ ] Resumo automático de processos (LLM)
- [ ] Sugestão de próximas ações
- [ ] Análise de documentos (OCR + LLM)
- [ ] Busca semântica em documentos
- [ ] Geração de minutas a partir de templates

---

## v2.4 — Comunicação
**Estimativa:** Após v2.1

- [ ] WhatsApp Business API:
  - Envio de mensagens para clientes
  - Notificações de prazos
  - Bot de triagem inicial de leads
- [ ] E-mail integrado:
  - Templates de propostas
  - Acompanhamento de contratos

---

## v3.0 — SaaS Multi-tenant
**Estimativa:** Somente após validação interna comprovada

> Decisão condicional: só faz sentido se o produto demonstrar valor real para o escritório.

- [ ] Multi-tenancy com RLS por `tenant_id`
- [ ] Planos de assinatura (Starter / Pro / Enterprise)
- [ ] Onboarding automatizado
- [ ] Billing com Stripe
- [ ] Subdomínios por escritório
- [ ] White-label opcional
- [ ] Dashboard de métricas SaaS (MRR, churn, etc.)

---

## Stack Técnico

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Estilo | Tailwind CSS, shadcn/ui |
| Estado servidor | TanStack Query |
| Estado UI | Zustand |
| Formulários | React Hook Form + Zod |
| Backend/DB | Supabase (PostgreSQL + Auth + Storage) |
| DnD | @dnd-kit |
| Datas | date-fns |

---

## Arquitetura de Pastas

```
src/
├── app/              # Roteamento Next.js
├── components/       # UI compartilhada
├── features/         # Lógica por domínio
│   ├── dashboard/
│   ├── crm/
│   ├── clientes/
│   ├── agenda/
│   └── tarefas/
├── hooks/            # Hooks compartilhados
├── services/         # Data access (Supabase)
├── lib/              # Configurações
├── store/            # Zustand stores
├── schemas/          # Zod schemas
├── types/            # TypeScript types
└── utils/            # Helpers
```

---

## Banco de Dados — Entidades Principais

```
profiles         → Usuários do escritório
leads            → Prospects no pipeline
lead_stages      → Etapas do CRM (seed fixo)
lead_movements   → Histórico de movimentações
lead_comments    → Comentários nos leads
clients          → Clientes ativos (PF e PJ)
client_attachments → Documentos dos clientes
events           → Agenda (reuniões, audiências, prazos)
tasks            → Tarefas (kanban)
task_comments    → Comentários nas tarefas
task_checklist_items → Checklists das tarefas
activities       → Log global de atividades
```

---

## Critério de Conclusão do MVP

O MVP está concluído quando:

- [ ] Ambos os advogados conseguem usar diariamente sem suporte
- [ ] Todos os leads são gerenciados pelo CRM (saída do WhatsApp/papel)
- [ ] Tarefas substituem planilhas de controle
- [ ] Agenda substitui Google Agenda para eventos do escritório
- [ ] Dashboard dá visão real do estado do escritório em 30 segundos

---

*Última atualização: Junho 2026*
