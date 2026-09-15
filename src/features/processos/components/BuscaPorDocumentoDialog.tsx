'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ExternalLink, Loader2, Scale, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DOCUMENT_SEARCH_TTL_DAYS,
  normalizeDocument,
  isValidDocument,
  type DocumentSearchResponse,
} from '@/lib/buscaprocessos/documentSearch'
import type { BpProcessoCapa } from '@/lib/buscaprocessos/types'
import { useWorkflow } from '@/features/crm/hooks/useWorkflows'
import { formatDate } from '@/utils/date'
import { formatDocument } from '@/utils/format'
import { cn } from '@/lib/utils'
import { findLegalProcessesByCnjs } from '../services/legalProcesses.service'
import { useDocumentSearch, useImportProcessosFromSearch } from '../hooks/useDocumentSearch'

interface BuscaPorDocumentoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  /** CPF ou CNPJ do cliente, como está cadastrado. */
  document: string
}

/** Como a pessoa do documento consultado aparece naquele processo. */
interface Papel {
  label: string | null
  /** É parte (autor/réu), e não o advogado de alguém. */
  isParty: boolean
}

/**
 * Quem é o dono do documento dentro do processo.
 *
 * Existe porque a busca por CPF devolve TODO processo em que o documento
 * aparece — e num escritório o mesmo CPF costuma ser o do advogado, não o da
 * parte. Num payload real, um dos processos tem os dois polos ocupados por
 * terceiros e o CPF consultado entra como 'ADVOGADO(A/S)'. Importar isso como
 * "processo do cliente" seria gravar uma mentira.
 */
function describePapel(processo: BpProcessoCapa, document: string): Papel {
  for (const fonte of processo.fontes ?? []) {
    for (const envolvido of fonte.envolvidos ?? []) {
      const doc = envolvido.documento ?? envolvido.cpf ?? envolvido.cnpj
      if (doc && normalizeDocument(doc) === document) {
        // O polo sozinho não basta: o advogado do exemplo real vem com polo
        // 'ASSISTENTE_DESINTERESSADO_AMICUS_CURAE', que não é ativo nem
        // passivo — e nada impede a origem de carimbar um advogado num polo
        // de parte.
        const ehAdvogado = /ADVOGAD/i.test(envolvido.tipo ?? '')
        const noPolo = envolvido.polo === 'ATIVO' || envolvido.polo === 'PASSIVO'
        return {
          label: envolvido.tipo ?? envolvido.polo,
          isParty: noPolo && !ehAdvogado,
        }
      }

      // Não apareceu como envolvido: pode estar na lista de advogados de um.
      for (const advogado of envolvido.advogados ?? []) {
        const advDoc = advogado.documento ?? advogado.cpf ?? advogado.cnpj
        if (advDoc && normalizeDocument(advDoc) === document) {
          return { label: 'Advogado', isParty: false }
        }
      }
    }
  }
  return { label: null, isParty: false }
}

/** Primeira fonte que tenha capa — mesma preferência de `mapCapa`. */
function primeiraCapa(processo: BpProcessoCapa) {
  return (processo.fontes ?? []).find((fonte) => fonte.capa)?.capa ?? null
}

function daquiA(dias: number): string {
  const data = new Date()
  data.setDate(data.getDate() + dias)
  return data.toISOString().slice(0, 10)
}

interface Linha {
  cnj: string
  processo: BpProcessoCapa
  papel: Papel
  classe: string | null
  orgao: string | null
  tribunal: string | null
  poloAtivo: string | null
  poloPassivo: string | null
  ultimoMovimento: { data: string | null; descricao: string | null } | null
  /** Id do processo já cadastrado, quando já existe. */
  existenteId: string | null
}

export function BuscaPorDocumentoDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  document,
}: BuscaPorDocumentoDialogProps) {
  const documentDigits = normalizeDocument(document)
  const workflow = useWorkflow('wf-processos')

  const [resultado, setResultado] = useState<DocumentSearchResponse | null>(null)
  const [pendente, setPendente] = useState<string | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [columnId, setColumnId] = useState('')
  const [prazo, setPrazo] = useState(() => daquiA(7))
  const [progresso, setProgresso] = useState<{ done: number; total: number } | null>(null)

  const busca = useDocumentSearch()
  const importacao = useImportProcessosFromSearch()

  const cnjs = useMemo(
    () =>
      (resultado?.processos ?? [])
        .map((p) => p.numero_cnj ?? p.numeroCnj ?? '')
        .filter(Boolean),
    [resultado],
  )

  // Uma consulta só para a lista inteira, depois que o resultado chega.
  const { data: jaCadastrados } = useQuery({
    queryKey: ['legal_processes', 'by-cnjs', cnjs],
    queryFn: () => findLegalProcessesByCnjs(cnjs),
    enabled: cnjs.length > 0,
  })

  const linhas = useMemo<Linha[]>(() => {
    return (resultado?.processos ?? []).map((processo) => {
      const cnj = processo.numero_cnj ?? processo.numeroCnj ?? ''
      const capa = primeiraCapa(processo)
      const fonte = (processo.fontes ?? [])[0]

      return {
        cnj,
        processo,
        papel: describePapel(processo, documentDigits),
        classe: capa?.classe ?? null,
        orgao: capa?.orgao_julgador ?? null,
        tribunal: processo.tribunal ?? fonte?.tribunal?.sigla ?? fonte?.sigla ?? null,
        poloAtivo: processo.poloAtivo ?? processo.titulo_polo_ativo ?? null,
        poloPassivo: processo.poloPassivo ?? processo.titulo_polo_passivo ?? null,
        // A descrição do último ato já vem nesta resposta; pedi-la ao endpoint
        // de movimentações seria uma consulta a mais por processo.
        ultimoMovimento: capa?.ultimo_movimento
          ? {
              data: capa.ultimo_movimento.data ?? null,
              descricao: capa.ultimo_movimento.descricao ?? null,
            }
          : null,
        existenteId: jaCadastrados?.get(cnj) ?? null,
      }
    })
  }, [resultado, documentDigits, jaCadastrados])

  const importaveis = linhas.filter((l) => !l.existenteId)
  const marcados = importaveis.filter((l) => selecionados.has(l.cnj))

  async function buscar(force = false) {
    setPendente(null)
    const outcome = await busca.mutateAsync({
      document: documentDigits,
      clientId,
      force,
    })

    if (outcome.status === 'pending') {
      setPendente(outcome.message)
      return
    }

    setResultado(outcome.data)
    // Pré-seleção deliberada: só onde a pessoa é PARTE. O resto da lista
    // costuma ser processo de cliente dela, em que ela é a advogada — marcar
    // tudo por padrão faria o usuário importar (e pagar por) acervo alheio.
    setSelecionados(
      new Set(
        outcome.data.processos
          .filter((p) => describePapel(p, documentDigits).isParty)
          .map((p) => p.numero_cnj ?? p.numeroCnj ?? '')
          .filter(Boolean),
      ),
    )
  }

  function alternar(cnj: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual)
      if (proximo.has(cnj)) proximo.delete(cnj)
      else proximo.add(cnj)
      return proximo
    })
  }

  async function importar() {
    const columnIdFinal = columnId || workflow?.colunas[0]?.id
    if (!columnIdFinal || marcados.length === 0) return

    setProgresso({ done: 0, total: marcados.length })
    try {
      await importacao.mutateAsync({
        candidates: marcados.map((l) => ({ processo: l.processo })),
        clientId,
        columnId: columnIdFinal,
        nextDeadline: prazo,
        onProgress: (done, total) => setProgresso({ done, total }),
      })
      onOpenChange(false)
      setResultado(null)
      setSelecionados(new Set())
    } finally {
      setProgresso(null)
    }
  }

  const documentoValido = isValidDocument(documentDigits)
  const importando = importacao.isPending

  return (
    <Dialog open={open} onOpenChange={(v) => !importando && onOpenChange(v)}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-sm font-semibold">
            Buscar processos por CPF/CNPJ
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {clientName} · {documentoValido ? formatDocument(documentDigits) : document}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!documentoValido && (
            <p className="text-sm text-muted-foreground">
              Este cliente não tem um CPF ou CNPJ completo cadastrado. Preencha o documento na
              aba Cadastro para poder consultar.
            </p>
          )}

          {documentoValido && !resultado && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  A consulta procura o documento nos tribunais e pode levar alguns segundos. O
                  resultado fica guardado por {DOCUMENT_SEARCH_TTL_DAYS} dias — dentro desse
                  período a busca responde na hora, sem consultar de novo.
                </p>
              </div>

              <Button onClick={() => buscar()} disabled={busca.isPending} size="sm">
                {busca.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Consultando…
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" /> Buscar processos
                  </>
                )}
              </Button>

              {pendente && <p className="text-xs text-muted-foreground">{pendente}</p>}
            </div>
          )}

          {resultado && (
            <>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <p className="text-sm font-medium text-foreground">
                    {resultado.envolvido?.nome ?? clientName}
                  </p>
                  <p>
                    {resultado.total} processo{resultado.total === 1 ? '' : 's'} encontrado
                    {resultado.total === 1 ? '' : 's'}
                    {resultado.fromCache &&
                      ` · consulta de ${formatDate(resultado.searchedAt)}`}
                  </p>
                </div>
                {resultado.fromCache && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => buscar(true)}
                    disabled={busca.isPending || importando}
                  >
                    {busca.isPending ? 'Consultando…' : 'Atualizar consulta'}
                  </Button>
                )}
              </div>

              {importaveis.some((l) => !l.papel.isParty) && (
                <p className="text-xs text-muted-foreground border-l-2 border-border pl-2">
                  Só os processos em que {resultado.envolvido?.nome ?? 'a pessoa'} é{' '}
                  <strong>parte</strong> vêm marcados. Nos demais ela aparece como advogada ou
                  participante — confira antes de importar.
                </p>
              )}

              <div className="space-y-1.5">
                {linhas.map((linha) => {
                  const jaExiste = Boolean(linha.existenteId)

                  return (
                    <div
                      key={linha.cnj}
                      className={cn(
                        'flex gap-3 rounded-lg border border-border p-3',
                        jaExiste && 'opacity-60',
                      )}
                    >
                      <Checkbox
                        checked={selecionados.has(linha.cnj) && !jaExiste}
                        disabled={jaExiste || importando}
                        onCheckedChange={() => alternar(linha.cnj)}
                        className="mt-0.5"
                        aria-label={`Selecionar ${linha.cnj}`}
                      />

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs">{linha.cnj}</span>
                          {linha.tribunal && (
                            <Badge variant="outline" className="text-[10px]">
                              {linha.tribunal}
                            </Badge>
                          )}
                          {linha.papel.label && (
                            <Badge
                              variant={linha.papel.isParty ? 'secondary' : 'outline'}
                              className="text-[10px]"
                            >
                              {linha.papel.label}
                            </Badge>
                          )}
                          {jaExiste && (
                            <Link
                              href={`/processos/${linha.existenteId}`}
                              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                            >
                              Já cadastrado <ExternalLink className="h-3 w-3" />
                            </Link>
                          )}
                        </div>

                        <p className="text-sm truncate">
                          {linha.classe ?? 'Classe não informada'}
                          {linha.orgao && (
                            <span className="text-muted-foreground"> · {linha.orgao}</span>
                          )}
                        </p>

                        <p className="text-xs text-muted-foreground truncate">
                          {linha.poloAtivo ?? '—'} × {linha.poloPassivo ?? '—'}
                        </p>

                        {linha.ultimoMovimento?.descricao && (
                          <p className="text-xs text-muted-foreground truncate">
                            {linha.ultimoMovimento.data &&
                              `${formatDate(linha.ultimoMovimento.data)} · `}
                            {linha.ultimoMovimento.descricao}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {linhas.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <Scale className="h-7 w-7" />
                    <p className="text-sm">Nenhum processo encontrado para este documento.</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {resultado && importaveis.length > 0 && (
          <div className="border-t border-border px-6 py-4 space-y-3">
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1 min-w-[160px]">
                <label className="text-xs text-muted-foreground mb-1 block">Etapa</label>
                <Select
                  value={columnId || workflow?.colunas[0]?.id || ''}
                  onValueChange={setColumnId}
                  disabled={importando}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(workflow?.colunas ?? []).map((coluna) => (
                      <SelectItem key={coluna.id} value={coluna.id}>
                        {coluna.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 min-w-[160px]">
                {/* Prazo por processo não existe na resposta da API. Inventar
                    uma data por item seria pior do que perguntar uma vez para
                    o lote — o campo é obrigatório no cadastro. */}
                <label className="text-xs text-muted-foreground mb-1 block">
                  Próximo prazo (todos)
                </label>
                <Input
                  type="date"
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                  disabled={importando}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-muted-foreground">
                {marcados.length} de {importaveis.length} selecionado
                {marcados.length === 1 ? '' : 's'}
                {progresso && ` · importando ${progresso.done}/${progresso.total}`}
              </p>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  disabled={importando}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={importar}
                  disabled={marcados.length === 0 || !prazo || importando}
                >
                  {importando ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Importando…
                    </>
                  ) : (
                    `Importar ${marcados.length}`
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
