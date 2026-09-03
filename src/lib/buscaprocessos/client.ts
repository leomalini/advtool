// Server-side only — never import this in client components ('use client')
import type {
  BpResponse,
  BpPendingData,
  BpCnjLookupData,
  BpMovimentacoesData,
  BpDocumentosPublicosData,
  BpResumoIaData,
  BpDocumentSearchData,
  BpOabSearchData,
  BpRequestId,
  BpMonitoramento,
  BpMonitoramentosListData,
  BpIntimacoesData,
  BpOabRef,
  BpIntimacaoOabListData,
  BpCreateIntimacaoOabData,
  BpIntimacaoOabMutationData,
} from "./types";

const API_KEY = process.env.BUSCA_PROCESSOS_API_KEY;
const BASE_URL = "https://api.buscaprocessos.app.br";

// ── Error classes ─────────────────────────────────────────────────────────────

export class BpApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "BpApiError";
  }
}

/** HTTP 202: a consulta ultrapassou a janela síncrona e segue em processamento.
 * Não é falha — o resultado sai depois em `GET /v1/requests/{requestId}`. Antes
 * o 202 passava pelo `res.ok` como se fosse sucesso e o mapeamento quebrava. */
export class BpPendingError extends Error {
  constructor(
    public readonly requestId: string,
    public readonly pollAfterMs: number,
    message: string,
  ) {
    super(message);
    this.name = "BpPendingError";
  }
}

/** Mensagem que a API devolve no corpo do erro, quando devolve alguma. */
async function readErrorDetail(res: Response): Promise<string> {
  const raw = await res.text().catch(() => "");
  if (!raw) return "";

  try {
    const parsed = JSON.parse(raw) as {
      message?: string;
      error?: { message?: string; code?: string } | string;
      errors?: unknown;
    };
    const fromError =
      typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
    const message = parsed.message ?? fromError;
    const extra = parsed.errors ? ` (${JSON.stringify(parsed.errors)})` : "";
    return message ? `${message}${extra}` : raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

/** Contexto fixo do status + o que a API explicou. O caminho entra porque o
 * mesmo status significa coisas diferentes em cada endpoint. */
function describeError(status: number, path: string, detail: string): string {
  const base: Record<number, string> = {
    401: "API key inválida ou revogada",
    403: "Créditos insuficientes ou conta inativa",
    404: "Recurso não encontrado",
    422: "Parâmetro recusado pela API",
    429: "Limite de requisições atingido",
  };

  const prefix = base[status] ?? `Erro ${status} na API BuscaProcessos`;
  return detail ? `${prefix}: ${detail}` : `${prefix} (${path})`;
}

// ── Core request ──────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<BpResponse<T>> {
  if (!API_KEY) {
    throw new BpApiError(
      503,
      "BUSCA_PROCESSOS_API_KEY não configurada. Adicione-a ao .env.local.",
    );
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      ...options?.headers,
    },
    signal: options?.signal ?? AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    // O corpo do erro é a única coisa que diz QUAL parâmetro a API recusou.
    // Antes cada status virava uma frase fixa e o corpo era descartado — um 422
    // de webhook em HTTP chegava à tela como "Número CNJ inválido".
    const detail = await readErrorDetail(res);
    throw new BpApiError(res.status, describeError(res.status, path, detail));
  }

  // Ler como texto antes de parsear: um 200 com corpo vazio ou não-JSON
  // estourava um SyntaxError cru, e a rota traduzia isso em "Erro interno" (500)
  // sem deixar rastro de que o problema estava na resposta, e não na chamada.
  const raw = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new BpApiError(
      502,
      `Resposta não-JSON da API BuscaProcessos (${path}): ${raw.slice(0, 300)}`,
    );
  }

  if (parsed === null || typeof parsed !== "object" || !("data" in parsed)) {
    const keys =
      parsed && typeof parsed === "object"
        ? Object.keys(parsed).join(", ")
        : typeof parsed;
    throw new BpApiError(
      502,
      `Envelope inesperado da API BuscaProcessos (${path}). Chaves recebidas: ${keys}`,
    );
  }

  if (res.status === 202) {
    const pending = (parsed as BpResponse<BpPendingData>).data;
    throw new BpPendingError(
      pending?.requestId ?? "",
      pending?.pollAfterMs ?? 5_000,
      pending?.message ?? "Consulta em processamento na BuscaProcessos.",
    );
  }

  return parsed as BpResponse<T>;
}

// ── Processos ─────────────────────────────────────────────────────────────────

/** Consulta a capa do processo pelo número CNJ.
 * Só a capa: movimentações são outro endpoint, cobrado à parte. */
export function getProcessoByCnj(cnj: string, signal?: AbortSignal) {
  return request<BpCnjLookupData>(
    `/v1/processos/cnj/${encodeURIComponent(cnj)}`,
    { signal },
  );
}

/** Lista as movimentações do processo — chamada separada e cobrada à parte. */
export function getMovimentacoesByCnj(
  cnj: string,
  limit = 20,
  cursor?: string,
) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return request<BpMovimentacoesData>(
    `/v1/processos/cnj/${encodeURIComponent(cnj)}/movimentacoes?${params}`,
  );
}

/** Catálogo de documentos públicos do processo.
 *
 * Devolve metadados e uma URL de download autenticada — o arquivo em si sai
 * por outro endpoint, cobrado por download. */
export function getDocumentosPublicos(cnj: string, page = 1, limit = 50) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  return request<BpDocumentosPublicosData>(
    `/v1/processos/cnj/${encodeURIComponent(cnj)}/documentos-publicos?${params}`,
  );
}

/** Baixa o binário de um documento público.
 *
 * Fora do `request` de propósito: aqui a resposta é arquivo, não JSON, e
 * `Content-Type`/`Content-Disposition` precisam chegar intactos a quem for
 * repassar o download. Cobrado por download (R$ 0,20), então nunca chame em
 * varredura — só quando alguém pedir o documento. */
export async function downloadDocumentoPublico(
  cnj: string,
  documentId: string,
): Promise<Response> {
  if (!API_KEY) {
    throw new BpApiError(
      503,
      "BUSCA_PROCESSOS_API_KEY não configurada. Adicione-a ao .env.local.",
    );
  }

  const path = `/v1/processos/cnj/${encodeURIComponent(cnj)}/documentos/${encodeURIComponent(
    documentId,
  )}/download`;

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-api-key": API_KEY },
    signal: AbortSignal.timeout(60_000),
  });

  if (res.status === 404) throw new BpApiError(404, "Documento não encontrado");
  if (res.status === 401)
    throw new BpApiError(401, "API key inválida ou revogada");
  if (res.status === 403)
    throw new BpApiError(403, "Créditos insuficientes ou conta inativa");
  if (res.status === 429)
    throw new BpApiError(429, "Limite de requisições atingido");
  if (res.status === 202) {
    throw new BpPendingError(
      "",
      5_000,
      "Documento ainda sendo preparado. Tente em instantes.",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new BpApiError(
      res.status,
      `Erro ao baixar documento: ${body.slice(0, 200)}`,
    );
  }

  return res;
}

/** Resumo do processo gerado por IA.
 *
 * Pode voltar 202 na primeira vez, enquanto o resumo é gerado; o `cached` da
 * resposta indica reaproveitamento do lado deles, mas a consulta é cobrada
 * do mesmo jeito — daí guardarmos o texto aqui. */
export function getResumoIa(cnj: string) {
  return request<BpResumoIaData>(
    `/v1/processos/cnj/${encodeURIComponent(cnj)}/resumo-ia`,
  );
}

/** Lista processos vinculados a um CPF ou CNPJ */
export function searchProcessosByDocument(cpfCnpj: string, page = 1) {
  const params = new URLSearchParams({ cpf_cnpj: cpfCnpj, page: String(page) });
  return request<BpDocumentSearchData>(`/v1/processos?${params}`);
}

export interface OabSearchInput {
  /** UF da inscrição, duas letras — 'SP'. */
  oab_estado: string;
  oab_numero: string;
  oab_tipo?: string;
  page?: number;
  limit?: number;
}

/** Lista processos de um advogado pela inscrição na OAB.
 *
 * O caminho anterior (`/v1/processos/oab/{oab}`) não existe na API e sempre
 * respondia 404. O endpoint real é `/v1/advogados/processos`, e a inscrição
 * vai partida em UF + número, não como string única. */
export function searchProcessosByOab(input: OabSearchInput) {
  const params = new URLSearchParams({
    oab_estado: input.oab_estado,
    oab_numero: input.oab_numero,
  });
  if (input.oab_tipo) params.set("oab_tipo", input.oab_tipo);
  if (input.page) params.set("page", String(input.page));
  if (input.limit) params.set("limit", String(input.limit));
  return request<BpOabSearchData>(`/v1/advogados/processos?${params}`);
}

/** Solicita atualização forçada de um processo.
 *
 * O corpo é obrigatório no OpenAPI (`ProcessUpdateRequest`): a chamada sem
 * body voltava 400. `documentos_publicos` pede também a captura de documentos
 * nos tribunais que suportam. */
export function requestProcessUpdate(cnj: string, documentosPublicos = false) {
  return request<{ message: string }>(
    `/v1/processos/cnj/${encodeURIComponent(cnj)}/solicitar-atualizacao`,
    {
      method: "POST",
      body: JSON.stringify({ documentos_publicos: documentosPublicos }),
    },
  );
}

// ── Resultado assíncrono (202) ────────────────────────────────────────────────

/** Rebusca o resultado de uma consulta que saiu por 202.
 *
 * Enquanto o trabalho não termina, a rota devolve 202 de novo — e `request`
 * converte isso em BpPendingError, então o chamador repete a espera. */
export function getRequestResult<T>(requestId: BpRequestId) {
  return request<T>(`/v1/requests/${encodeURIComponent(requestId)}`);
}

// ── Intimações ────────────────────────────────────────────────────────────────

/** Monta o parâmetro `oabs`: lista UF:NÚMERO separada por vírgula. */
function formatOabs(oabs: readonly BpOabRef[]): string {
  return oabs
    .map((oab) => `${oab.estado.toUpperCase()}:${oab.numero}`)
    .join(",");
}

/** Publicações encontradas em diário oficial para as OABs monitoradas.
 *
 * Cobrado por OAB consultada (R$ 0,10), não por publicação devolvida — uma
 * chamada com cinco OABs custa o mesmo trazendo uma ou cem publicações, então
 * consulte todas de uma vez em vez de uma por vez.
 *
 * OAB sem monitoramento ativo volta em `missingMonitorings` e não traz nada. */
export function getIntimacoes(
  oabs: readonly BpOabRef[],
  desde?: string,
  page = 1,
) {
  const params = new URLSearchParams({
    oabs: formatOabs(oabs),
    page: String(page),
  });
  if (desde) params.set("desde", desde);
  return request<BpIntimacoesData>(`/v1/intimacoes?${params}`);
}

/** Consulta o monitoramento de UMA inscrição.
 *
 * A API não tem listagem geral: estado e número são obrigatórios, então
 * conferir N advogados custa N chamadas — todas gratuitas. */
export function getIntimacaoMonitoramento(oab: BpOabRef) {
  const params = new URLSearchParams({
    oab_estado: oab.estado.toUpperCase(),
    oab_numero: oab.numero,
  })
  return request<BpIntimacaoOabListData>(`/v1/intimacoes/oab?${params}`)
}

/** Liga o monitoramento de intimações de UMA inscrição.
 *
 * Corpo no formato plano (`oab_estado`/`oab_numero`), que é o do exemplo da
 * documentação. O campo `oabs` também existe, mas a spec declara os itens como
 * objeto sem propriedade nenhuma — o formato de cada item não está documentado,
 * e adivinhá-lo foi o que rendeu 422.
 *
 * Cobra R$ 0,90 por inscrição NOVA a cada 30 dias; inscrição já monitorada volta
 * com `reused: true` e não entra na cobrança. `webhookUrl` precisa ser HTTPS —
 * a própria descrição do endpoint diz "uma webhook_url HTTPS".
 */
export function createIntimacaoMonitoramento(
  oab: BpOabRef,
  webhookUrl?: string,
) {
  return request<BpCreateIntimacaoOabData>("/v1/intimacoes/oab", {
    method: "POST",
    body: JSON.stringify({
      oab_estado: oab.estado.toUpperCase(),
      oab_numero: oab.numero,
      ...(webhookUrl ? { webhook_url: webhookUrl } : {}),
    }),
  });
}

/** Aponta (ou reaponta) o webhook de uma inscrição já monitorada.
 *
 * Serve para consertar o cadastro sem recriar o monitoramento — recriar
 * cobraria de novo. Não cobra nada. */
export function updateIntimacaoMonitoramentoWebhook(oab: BpOabRef, webhookUrl: string | null) {
  const params = new URLSearchParams({
    oab_estado: oab.estado.toUpperCase(),
    oab_numero: oab.numero,
  })
  return request<BpIntimacaoOabMutationData>(`/v1/intimacoes/oab?${params}`, {
    method: 'PUT',
    body: JSON.stringify({
      oab_estado: oab.estado.toUpperCase(),
      oab_numero: oab.numero,
      webhook_url: webhookUrl,
    }),
  })
}

/** Desliga o monitoramento. Não cobra, e interrompe a recorrência mensal. */
export function deleteIntimacaoMonitoramento(oab: BpOabRef) {
  const params = new URLSearchParams({
    oab_estado: oab.estado.toUpperCase(),
    oab_numero: oab.numero,
  })
  return request<BpIntimacaoOabMutationData>(`/v1/intimacoes/oab?${params}`, {
    method: 'DELETE',
  })
}

// ── Monitoramentos ────────────────────────────────────────────────────────────

/** Corpo de POST /v1/monitoramentos/processos (schema ProcessMonitoringRequest).
 *
 * Só `numero_cnj` é obrigatório. `webhookUrl` não existe neste endpoint — a
 * URL de webhook é configurada no painel da conta; enviá-la aqui era campo
 * inventado, do mesmo modo que `numeroCnj` em camelCase. */
export interface CreateMonitorInput {
  numero_cnj: string;
  tribunal?: string | null;
  frequencia?: "DIARIA" | "SEMANAL" | "MENSAL";
}

/** Cria um monitor de acompanhamento para um processo */
export function createMonitoramento(input: CreateMonitorInput) {
  return request<BpMonitoramento>("/v1/monitoramentos/processos", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

/** Lista todos os monitoramentos ativos */
export function listMonitoramentos() {
  return request<BpMonitoramentosListData>("/v1/monitoramentos/processos");
}

/** Remove um monitoramento pelo ID */
export function deleteMonitoramento(id: string) {
  return request<void>(
    `/v1/monitoramentos/processos/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}
