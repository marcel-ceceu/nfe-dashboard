'use client'

import { useState, useEffect, useCallback } from 'react'
import { downloadZip } from 'client-zip'

type Nota = {
  chave_acesso: string
  cnpj_emitente: string
  razao_social_emitente: string | null
  uf_emitente: string | null
  numero_nota: number | null
  data_emissao: string | null
  valor_total: number | null
  situacao: string | null
  ciencia_em: string | null
  possui_xml: boolean
  xml_local?: boolean
  xml_storage?: boolean
  pdf_storage?: boolean
}

type Formato = 'xml' | 'pdf' | 'ambos'
type Progresso = { fase: string; atual: number; total: number } | null

const fmtData = (s: string | null) => {
  if (!s) return '-'
  const [y, m, d] = s.substring(0, 10).split('-')
  return `${d}/${m}/${y}`
}

const fmtMoeda = (v: number | null) => {
  if (v == null) return '-'
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const hoje = () => new Date().toISOString().slice(0, 10)
const diasAtras = (d: number) => {
  const dt = new Date()
  dt.setDate(dt.getDate() - d)
  return dt.toISOString().slice(0, 10)
}

export default function Home() {
  const [dataIni, setDataIni] = useState(diasAtras(60))
  const [dataFim, setDataFim] = useState(hoje())
  const [busca, setBusca] = useState('')
  const [notas, setNotas] = useState<Nota[]>([])
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [formato, setFormato] = useState<Formato>('ambos')
  const [baixando, setBaixando] = useState(false)
  const [progresso, setProgresso] = useState<Progresso>(null)
  const [ajudaAberta, setAjudaAberta] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    setSelecionadas(new Set())
    try {
      const params = new URLSearchParams({ dataIni, dataFim })
      if (busca.trim()) params.set('busca', busca.trim())
      const r = await fetch('/api/notas?' + params.toString())
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro ao buscar notas')
      setNotas(j.dados || [])
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro desconhecido')
      setNotas([])
    } finally {
      setLoading(false)
    }
  }, [dataIni, dataFim, busca])

  useEffect(() => {
    carregar()
  }, []) // carrega ao montar; depois e botao manual

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAjudaAberta(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const totalValor = notas.reduce((s, n) => s + (n.valor_total || 0), 0)
  const todasMarcadas = notas.length > 0 && selecionadas.size === notas.length

  const toggleUma = (chave: string) => {
    setSelecionadas((prev) => {
      const next = new Set(prev)
      if (next.has(chave)) next.delete(chave)
      else next.add(chave)
      return next
    })
  }

  const toggleTodas = () => {
    setSelecionadas((prev) =>
      prev.size === notas.length ? new Set() : new Set(notas.map((n) => n.chave_acesso))
    )
  }

  const baixarZip = useCallback(async () => {
    const alvo = selecionadas.size > 0 ? notas.filter((n) => selecionadas.has(n.chave_acesso)) : notas
    const chaves = alvo.map((n) => n.chave_acesso)
    if (chaves.length === 0) return

    const tipos: ('xml' | 'pdf')[] = formato === 'ambos' ? ['xml', 'pdf'] : [formato]
    setBaixando(true)
    setErro(null)
    try {
      // Fase 1: preencher o Supabase Storage em lotes (Espião -> Storage)
      setProgresso({ fase: 'Preparando arquivos (Espião → Supabase)', atual: 0, total: chaves.length })
      let next: number | null = 0
      while (next !== null) {
        const r: Response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chaves, tipos, cursor: next, limit: 20 }),
        })
        const j: {
          total: number
          cursor: number
          processadas: number
          nextCursor: number | null
          error?: string
        } = await r.json()
        if (!r.ok) throw new Error(j.error || 'Erro ao preparar arquivos')
        setProgresso({
          fase: 'Preparando arquivos (Espião → Supabase)',
          atual: Math.min(j.cursor + j.processadas, j.total),
          total: j.total,
        })
        next = j.nextCursor
      }

      // Fase 2: gerar signed URLs em batch
      setProgresso({ fase: 'Gerando links', atual: 0, total: chaves.length })
      const arquivos: { name: string; url: string }[] = []
      for (const tipo of tipos) {
        const r = await fetch('/api/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chaves, tipo }),
        })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Erro ao gerar links')
        arquivos.push(...j.links)
      }
      if (arquivos.length === 0) throw new Error('Nenhum arquivo disponível para download')

      // Fase 3: baixar do CDN do Supabase e compactar no navegador
      setProgresso({ fase: 'Baixando e compactando', atual: 0, total: arquivos.length })
      const inputs: { name: string; input: Response }[] = []
      let i = 0
      for (const a of arquivos) {
        const res = await fetch(a.url)
        inputs.push({ name: a.name, input: res })
        i++
        setProgresso({ fase: 'Baixando e compactando', atual: i, total: arquivos.length })
      }

      const blob = await downloadZip(inputs).blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `nfe_${dataIni}_a_${dataFim}.zip`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      // Atualiza a tabela: os arquivos agora estao no Supabase Storage
      await carregar()
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro no download')
    } finally {
      setBaixando(false)
      setProgresso(null)
    }
  }, [selecionadas, notas, formato, dataIni, dataFim, carregar])

  const qtdAlvo = selecionadas.size > 0 ? selecionadas.size : notas.length

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">NFes Recebidas</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              AUTO PEÇAS FRANCISCATO LTDA · CNPJ 08.696.597/0001-62
            </p>
          </div>
          <button
            onClick={() => setAjudaAberta(true)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
            title="Como usar o dashboard"
          >
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold">?</span>
            Ajuda
          </button>
        </header>

        {/* Filtros */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Data inicial</label>
              <input
                type="date"
                value={dataIni}
                onChange={(e) => setDataIni(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">Data final</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Buscar emitente (nome ou CNPJ)
              </label>
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && carregar()}
                placeholder="ex: EMBREPAR"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2">
              <button
                onClick={carregar}
                disabled={loading}
                className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </div>
        </div>

        {/* Barra de download em massa */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-gray-600">
            {selecionadas.size > 0
              ? `${selecionadas.size} selecionada${selecionadas.size !== 1 ? 's' : ''}`
              : 'Nenhuma selecionada — baixa todas da tabela'}
          </span>

          <div className="flex items-center gap-1 ml-auto text-sm">
            <span className="text-xs text-gray-500 mr-1">Formato:</span>
            {(['xml', 'pdf', 'ambos'] as Formato[]).map((f) => (
              <button
                key={f}
                onClick={() => setFormato(f)}
                disabled={baixando}
                className={
                  'px-2.5 py-1 rounded text-xs font-medium border ' +
                  (formato === f
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50')
                }
              >
                {f === 'xml' ? 'XML' : f === 'pdf' ? 'DANFE' : 'XML + DANFE'}
              </button>
            ))}
          </div>

          <button
            onClick={baixarZip}
            disabled={baixando || notas.length === 0}
            className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {baixando ? 'Baixando...' : `Baixar ${qtdAlvo} (ZIP)`}
          </button>
        </div>

        {/* Progresso */}
        {progresso && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-4 py-3 mb-4">
            <div className="flex justify-between text-xs text-gray-600 mb-1">
              <span>{progresso.fase}</span>
              <span>
                {progresso.atual} / {progresso.total}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="bg-emerald-500 h-2 rounded-full transition-all"
                style={{
                  width: progresso.total ? `${(progresso.atual / progresso.total) * 100}%` : '0%',
                }}
              />
            </div>
          </div>
        )}

        {/* Resumo + erro */}
        <div className="bg-white rounded-t-lg shadow-sm border-x border-t border-gray-200 px-4 py-3 flex items-center justify-between text-sm">
          <div className="flex gap-6">
            <span>
              <span className="font-semibold text-gray-900">{notas.length}</span>
              <span className="text-gray-500 ml-1">nota{notas.length !== 1 ? 's' : ''}</span>
            </span>
            <span>
              <span className="text-gray-500">Total:</span>
              <span className="font-semibold text-gray-900 ml-1">R$ {fmtMoeda(totalValor)}</span>
            </span>
          </div>
          <div className="text-xs text-gray-400">
            {dataIni && dataFim && `${fmtData(dataIni)} a ${fmtData(dataFim)}`}
          </div>
        </div>

        {erro && (
          <div className="bg-red-50 border-x border-red-200 px-4 py-2 text-sm text-red-700">
            {erro}
          </div>
        )}

        {/* Tabela */}
        <div className="bg-white rounded-b-lg shadow-sm border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-t border-gray-200">
              <tr className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={todasMarcadas}
                    onChange={toggleTodas}
                    aria-label="Selecionar todas"
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5">Emitente</th>
                <th className="px-4 py-2.5">UF</th>
                <th className="px-4 py-2.5 text-right">Nº</th>
                <th className="px-4 py-2.5 text-right">Valor (R$)</th>
                <th className="px-4 py-2.5">Situação</th>
                <th className="px-4 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {notas.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    {erro ? 'Erro ao carregar.' : 'Sem notas no período.'}
                  </td>
                </tr>
              )}
              {notas.map((n) => {
                const situacaoCurta = n.situacao?.startsWith('Autorizad')
                  ? 'Autorizada'
                  : n.situacao || '-'
                return (
                  <tr key={n.chave_acesso} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selecionadas.has(n.chave_acesso)}
                        onChange={() => toggleUma(n.chave_acesso)}
                        aria-label={`Selecionar nota ${n.numero_nota ?? ''}`}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                      {fmtData(n.data_emissao)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-gray-900 truncate max-w-md">
                        {n.razao_social_emitente || '-'}
                      </div>
                      <div className="text-xs text-gray-500">{n.cnpj_emitente}</div>
                    </td>
                    <td className="px-4 py-2 text-gray-600">{n.uf_emitente || '-'}</td>
                    <td className="px-4 py-2 text-right text-gray-700 tabular-nums">
                      {n.numero_nota ?? '-'}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900 tabular-nums">
                      {fmtMoeda(n.valor_total)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        {situacaoCurta}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1 justify-center">
                        {(() => {
                          const xmlNoSupabase = n.xml_storage || n.xml_local
                          const xmlDisponivel = xmlNoSupabase || n.possui_xml
                          return (
                            <a
                              href={xmlDisponivel ? `/api/xml/${n.chave_acesso}` : undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={
                                xmlNoSupabase
                                  ? 'px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium'
                                  : n.possui_xml
                                    ? 'px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200'
                                    : 'px-2 py-1 text-xs rounded bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
                              }
                              title={
                                xmlNoSupabase
                                  ? 'Baixar XML (no Supabase)'
                                  : n.possui_xml
                                    ? 'Baixar XML (via Espião, será guardado no Supabase)'
                                    : 'XML não disponível'
                              }
                            >
                              XML
                            </a>
                          )
                        })()}
                        {(() => {
                          const pdfDisponivel = n.pdf_storage || n.possui_xml
                          return (
                            <a
                              href={pdfDisponivel ? `/api/pdf/${n.chave_acesso}` : undefined}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={
                                n.pdf_storage
                                  ? 'px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium'
                                  : n.possui_xml
                                    ? 'px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200'
                                    : 'px-2 py-1 text-xs rounded bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
                              }
                              title={
                                n.pdf_storage
                                  ? 'Visualizar DANFE (no Supabase)'
                                  : n.possui_xml
                                    ? 'Visualizar DANFE (via Espião, será guardado no Supabase)'
                                    : 'DANFE não disponível'
                              }
                            >
                              DANFE
                            </a>
                          )
                        })()}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <footer className="mt-6 text-xs text-gray-400 text-center">
          Dados: Supabase consultaxml · Arquivos: Supabase Storage (cache-on-read via Espião) · ZIP gerado no navegador
        </footer>
      </div>

      {ajudaAberta && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
          onClick={() => setAjudaAberta(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Ajuda do dashboard"
          >
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-lg font-bold text-gray-900">Como usar o dashboard</h2>
              <button
                onClick={() => setAjudaAberta(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none px-1"
                aria-label="Fechar ajuda"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5 space-y-6 text-sm text-gray-700 leading-relaxed">
              <section>
                <h3 className="font-semibold text-gray-900 mb-1.5">1. Visão geral</h3>
                <p>
                  Aqui você consulta as NF-e recebidas pela AUTO PEÇAS FRANCISCATO e baixa os
                  documentos (XML e DANFE em PDF). Os dados das notas vêm do banco (Supabase) e os
                  arquivos ficam guardados no próprio Supabase — quando um arquivo ainda não existe,
                  o sistema busca no Espião NF-e na primeira vez e guarda para as próximas.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1.5">2. Buscar e filtrar</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><b>Data inicial / Data final:</b> definem o período de emissão das notas.</li>
                  <li><b>Buscar emitente:</b> filtra por nome (razão social) ou CNPJ. Digite ao menos 2 caracteres.</li>
                  <li>Clique em <b>Buscar</b> (ou tecle <b>Enter</b> no campo de busca) para aplicar os filtros.</li>
                  <li>A consulta traz até <b>500 notas</b> por vez, das mais recentes para as mais antigas.</li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1.5">3. Entendendo a tabela</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><b>Data:</b> data de emissão da nota.</li>
                  <li><b>Emitente:</b> razão social e CNPJ de quem emitiu.</li>
                  <li><b>UF:</b> estado do emitente.</li>
                  <li><b>Nº:</b> número da nota fiscal.</li>
                  <li><b>Valor (R$):</b> valor total da nota.</li>
                  <li><b>Situação:</b> status da nota na SEFAZ (ex.: Autorizada).</li>
                  <li><b>Ações:</b> botões para abrir o XML e a DANFE de cada nota.</li>
                </ul>
                <p className="mt-2 text-gray-500">
                  No topo da tabela aparece o total de notas e a soma dos valores do período.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1.5">4. Legenda dos botões (cores)</h3>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 font-medium">XML</span>
                    <span>Verde: XML já guardado no Supabase — download imediato.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-xs rounded bg-blue-100 text-blue-700">XML</span>
                    <span>Azul: XML será buscado no Espião na hora (e guardado para as próximas vezes).</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-400">XML</span>
                    <span>Cinza: XML indisponível para esta nota.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-1 text-xs rounded bg-red-100 text-red-700">DANFE</span>
                    <span>Vermelho: abre a DANFE (PDF). Cinza quando indisponível.</span>
                  </div>
                </div>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1.5">5. Baixar uma nota por vez</h3>
                <p>
                  Na coluna <b>Ações</b>, clique em <b>XML</b> ou <b>DANFE</b> da linha desejada. O
                  arquivo abre em uma nova aba. É o caminho mais rápido para uma nota específica.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1.5">6. Baixar em massa (ZIP)</h3>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Marque as caixas das notas desejadas — ou use a caixa do cabeçalho para <b>selecionar todas</b>. Sem nenhuma marcada, o download considera <b>todas as notas da tabela</b>.</li>
                  <li>Escolha o <b>formato</b>: XML, DANFE ou XML + DANFE.</li>
                  <li>Clique em <b>Baixar (ZIP)</b>. Um único arquivo .zip será salvo, com os XMLs e/ou DANFEs organizados em pastas.</li>
                </ol>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1.5">7. O que acontece por trás</h3>
                <p>O download em massa passa por 3 fases, mostradas na barra de progresso:</p>
                <ul className="list-disc pl-5 space-y-1 mt-1">
                  <li><b>Preparando arquivos:</b> garante que cada XML/PDF esteja guardado no Supabase, buscando no Espião o que faltar (em lotes).</li>
                  <li><b>Gerando links:</b> cria os links de acesso aos arquivos.</li>
                  <li><b>Baixando e compactando:</b> o ZIP é montado no seu navegador.</li>
                </ul>
                <p className="mt-2 text-gray-500">
                  A primeira vez de cada documento é mais lenta (busca no Espião). Depois fica rápido,
                  pois o arquivo já está no Supabase.
                </p>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1.5">8. Dicas e boas práticas</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Para muitos documentos, baixe <b>aos poucos</b> (selecione por partes) — fica mais leve para o navegador.</li>
                  <li>Use os filtros de data e emitente para reduzir a lista antes de baixar em massa.</li>
                  <li>Após o primeiro download de um período, os próximos são bem mais rápidos.</li>
                </ul>
              </section>

              <section>
                <h3 className="font-semibold text-gray-900 mb-1.5">9. Problemas comuns</h3>
                <ul className="list-disc pl-5 space-y-1">
                  <li><b>Botão cinza:</b> o documento não está disponível para aquela nota.</li>
                  <li><b>“Nenhum arquivo disponível”:</b> o Espião não retornou os arquivos do período — tente novamente ou um intervalo menor.</li>
                  <li><b>Erro ao carregar:</b> verifique o período e a conexão, e clique em Buscar de novo.</li>
                </ul>
              </section>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-3 rounded-b-lg text-right">
              <button
                onClick={() => setAjudaAberta(false)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
