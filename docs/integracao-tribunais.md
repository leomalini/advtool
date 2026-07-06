# Integração com Tribunais — Plano de Implementação

## Contexto

O sistema precisa consultar automaticamente andamentos processuais nos tribunais e atualizar a timeline dos casos. Os processos monitorados estão concentrados em TJSP, TRT-2, TRF-3 e JEF.

---

## 1. Análise das Opções de API

### 1.1 CNJ DataJud API (recomendada como primária)

**Tipo:** Pública e gratuita  
**Endpoint base:** `https://api-publica.datajud.cnj.jus.br/api_publica_{tribunal}/`  
**Autenticação:** `Authorization: APIKey {chave}` — chave gerada no portal CNJ  
**Rate limit:** 120 requisições/minuto  
**Formato:** Elasticsearch (POST com query JSON)  

**Cobertura dos tribunais relevantes:**
| Tribunal | Sufixo da URL | Cobertura |
|----------|--------------|-----------|
| TJSP | `tjsp` | ✅ Boa |
| TRT-2 | `trt2` | ✅ Boa |
| TRF-3 | `trf3` | ✅ Boa |
| JEF | via `trf3` / `jef` | ✅ Incluído no TRF-3 |

**Limitações importantes:**
- Lag de atualização: até 30 dias em alguns tribunais
- Não inclui autos digitais, apenas metadados e movimentos
- Não cobre processos em sigilo

**Estrutura da resposta:**
```json
{
  "hits": {
    "hits": [{
      "_source": {
        "numeroProcesso": "0001234-56.2024.5.02.0001",
        "classe": { "codigo": 1001, "nome": "Reclamação Trabalhista" },
        "assuntos": [{ "codigo": 9947, "nome": "Verbas Rescisórias" }],
        "dataAjuizamento": "2024-04-01T09:00:00.000Z",
        "movimentos": [
          {
            "codigo": 26,
            "nome": "Distribuição",
            "dataHora": "2024-04-01T09:00:00.000Z",
            "complementosTabelados": []
          }
        ],
        "orgaoJulgador": { "nome": "1ª Vara do Trabalho de São Paulo" },
        "partes": [
          { "nome": "Maria Aparecida Silva", "polo": "ATIVO" },
          { "nome": "Constrói Bem Engenharia", "polo": "PASSIVO" }
        ]
      }
    }]
  }
}
```

### 1.2 Escavador API (fallback/complementar)

**Tipo:** Comercial  
**Custo:** ~R$ 10/mês + créditos por consulta (~R$ 4,50/consulta)  
**Cobertura:** Nacional, mais completa e atualizada que DataJud  
**Vantagem:** Menor lag, cobertura de tribunais que DataJud não alcança  
**Quando usar:** Fallback quando DataJud não retornar dados ou para processos críticos

### 1.3 JusBrasil API

**Tipo:** Comercial enterprise  
**Custo:** R$ 1.000+/mês  
**Decisão:** Fora do escopo do MVP. Reavaliar se o escritório escalar.

---

## 2. Arquitetura da Integração

### 2.1 Fluxo de dados

```
[Caso no app] → [Cron job / botão manual]
     ↓
[API Route Next.js: POST /api/processos/consultar]
     ↓
[DataJud Service] → [DataJud API]
     ↓ (falha ou sem dados)
[Escavador Service] → [Escavador API] (opcional, fase 2)
     ↓
[Parser de resposta]
     ↓
[Comparar com movimentos já salvos]
     ↓
[Salvar novos movimentos no banco + criar TimelineItem]
     ↓
[Retornar diff para o frontend]
```

### 2.2 Onde vive o código

```
src/
  app/
    api/
      processos/
        consultar/
          route.ts          # API route que chama o service
        sincronizar/
          route.ts          # Sincroniza todos os casos com processo
  features/
    processos/
      services/
        datajud.service.ts  # Integração com DataJud
        escavador.service.ts # Integração com Escavador (fase 2)
        parser.service.ts   # Mapeia resposta → tipos do app
      hooks/
        useConsultarProcesso.ts  # Mutation: consultar processo individual
        useSincronizarProcessos.ts # Query: estado da última sincronização
      components/
        ConsultarProcessoButton.tsx # Botão na aba Processo do CasoModal
        MovimentacoesLog.tsx        # Lista de movimentações do DataJud
        SincronizacaoStatus.tsx     # Badge: "Atualizado há 2h"
  lib/
    cnj-parser.ts           # Parser do número CNJ (extrai tribunal, vara, etc.)
```

### 2.3 Variáveis de ambiente necessárias

```env
# DataJud CNJ (obrigatório)
DATAJUD_API_KEY=APIKey cnjApApiKey...

# Escavador (opcional, fase 2)
ESCAVADOR_TOKEN=Bearer eyJ...

# Cron secret (para acionar sync via cron externo, ex: Vercel Cron)
CRON_SECRET=seu_secret_aqui
```

---

## 3. Parser do Número CNJ

O número CNJ tem o formato `NNNNNNN-DD.AAAA.J.TT.OOOO`.

```
0001234-56.2024.5.02.0001
│       │  │    │ │  └── Unidade de origem (vara/juizado)
│       │  │    │ └───── Código do tribunal
│       │  │    └─────── Ramo da justiça (5 = Trabalhista)
│       │  └──────────── Ano
│       └─────────────── Dígito verificador
└─────────────────────── Número sequencial
```

**Ramos da justiça:**
- `1` = Estadual (TJSP, TJRJ, etc.)
- `2` = Federal (TRF-1 a TRF-6)
- `3` = Trabalho (TRT-1 a TRT-24)
- `4` = Eleitoral
- `8` = Juizados Especiais Federais

**Mapeamento tribunal → sufixo DataJud:**
| Ramo | Código | Sufixo DataJud |
|------|--------|---------------|
| Estadual | `1.26` | `tjsp` |
| Estadual | `1.09` | `tjrj` |
| Federal | `4.03` | `trf3` |
| Trabalho | `5.02` | `trt2` |
| JEF | `8.26` | `tjsp` ou `jef` |

---

## 4. Mapeamento de Dados

### 4.1 Movimento DataJud → TimelineItem do app

| Campo DataJud | Campo TimelineItem |
|--------------|-------------------|
| `movimentos[].nome` | `titulo` |
| `movimentos[].dataHora` | `data` |
| `movimentos[].complementosTabelados` | `descricao` (formatado) |
| Fixo: `movimentacao_processo` | `tipo` |
| Fixo: `"DataJud/CNJ"` | `autor` |

### 4.2 Processo DataJud → campos do Caso

| Campo DataJud | Campo Caso |
|--------------|------------|
| `orgaoJulgador.nome` | `vara` |
| `classe.nome` | Informativo (aba Processo) |
| `assuntos[].nome` | Informativo (aba Processo) |
| `partes[]` | `partes.requerente / requerido` |

---

## 5. Fases de Implementação

### Fase 1 — Consulta manual (MVP)

**Objetivo:** Usuário clica em "Consultar Tribunal" na aba Processo do CasoModal e vê as movimentações mais recentes.

**O que implementar:**
- [ ] `src/lib/cnj-parser.ts` — parsear número CNJ e resolver tribunal
- [ ] `src/features/processos/services/datajud.service.ts` — chamada à API DataJud
- [ ] `src/app/api/processos/consultar/route.ts` — API Route (server-side, esconde a chave)
- [ ] `src/features/processos/hooks/useConsultarProcesso.ts` — mutation React Query
- [ ] `ConsultarProcessoButton.tsx` — botão na aba Processo com estado de loading
- [ ] `MovimentacoesLog.tsx` — lista de movimentações retornadas
- [ ] Integrar na aba **Processo** do `CasoModal`

**UX esperada:**
1. Usuário abre o CasoModal → aba Processo
2. Vê o número CNJ do processo
3. Clica em "Consultar Tribunal"
4. Loading spinner ~2-5s
5. Aparece lista de movimentações com data/hora
6. Badge "X novas movimentações" se houver atualizações desde a última consulta
7. Botão "Adicionar à Timeline" para cada movimentação nova

### Fase 2 — Sincronização automática (pós-MVP)

**Objetivo:** Processar todos os casos automaticamente, notificando o usuário de novidades.

**O que implementar:**
- [ ] `src/app/api/processos/sincronizar/route.ts` — rota que percorre todos os casos com CNJ
- [ ] Cron job via Vercel Cron ou similar (1x por dia)
- [ ] Persistência no Supabase: tabela `processo_movimentos`
- [ ] Notificação no dashboard: "3 processos com novidades"
- [ ] `SincronizacaoStatus.tsx` — badge "Atualizado há 2h"
- [ ] Fallback para Escavador API quando DataJud não retornar

### Fase 3 — Monitoramento inteligente (futuro)

**Objetivo:** Alertas proativos para prazos e audiências detectados nos movimentos.

**O que implementar:**
- [ ] Parser de movimentos para detectar audiências (código TPU específico)
- [ ] Criação automática de evento na Agenda quando audiência detectada
- [ ] Criação automática de tarefa quando prazo detectado
- [ ] Integração com Escavador para maior velocidade de atualização
- [ ] Dashboard: "Processos com movimentação nos últimos 7 dias"

---

## 6. Schema Supabase (Fase 2)

```sql
-- Movimentações importadas dos tribunais
create table processo_movimentos (
  id uuid primary key default gen_random_uuid(),
  caso_id uuid references casos(id) on delete cascade,
  numero_cnj text not null,
  tribunal text not null,
  codigo_tpu integer,         -- código TPU do CNJ
  nome_movimento text not null,
  data_movimento timestamptz not null,
  complemento text,
  origem text default 'datajud', -- 'datajud' | 'escavador'
  importado_em timestamptz default now(),
  adicionado_timeline boolean default false,

  unique(caso_id, codigo_tpu, data_movimento)
);

-- Última sincronização por caso
create table processo_sync_log (
  caso_id uuid primary key references casos(id) on delete cascade,
  ultimo_sync timestamptz,
  status text, -- 'success' | 'error' | 'not_found'
  total_movimentos integer default 0,
  novos_movimentos integer default 0,
  erro_mensagem text
);
```

---

## 7. Tratamento de Erros e Edge Cases

| Cenário | Comportamento |
|---------|--------------|
| Número CNJ inválido | Mostrar erro inline "Número CNJ inválido" |
| Tribunal não coberto pelo DataJud | Mostrar mensagem + link para consulta manual |
| Rate limit atingido (120/min) | Retry com backoff exponencial (3 tentativas) |
| Processo não encontrado | "Processo não encontrado no DataJud. Pode estar em sigilo ou com lag." |
| DataJud instável (timeout) | Fallback para Escavador (fase 2) ou mensagem de erro |
| Processo sem movimentações | "Nenhuma movimentação encontrada até o momento." |

---

## 8. Segurança

- A `DATAJUD_API_KEY` **nunca** vai para o cliente. Toda chamada passa pela API Route do Next.js.
- A API Route valida que o `casoId` pertence ao escritório antes de consultar.
- Rate limiting na API Route para evitar abuso: max 10 consultas/minuto por usuário.
- Logs de consulta para auditoria.

---

## 9. Decisão de Implementação

**Para o MVP:** Implementar apenas a **Fase 1** (consulta manual via botão).

**Motivo:** Valor imediato sem complexidade de cron jobs ou banco de dados adicional. O usuário consulta quando precisar e vê os movimentos na hora.

**Próximo milestone:** Fase 2 (sync automático) quando o app for para produção com Supabase real.

---

## 10. Estimativa de Esforço

| Fase | Arquivos | Complexidade |
|------|----------|-------------|
| Fase 1 (consulta manual) | ~6 arquivos | Média |
| Fase 2 (sync automático) | ~8 arquivos + Supabase | Alta |
| Fase 3 (monitoramento) | ~5 arquivos + regras de negócio | Muito Alta |
