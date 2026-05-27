'use client'

import { useState, useEffect, useCallback } from 'react'

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
}

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

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
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

  const totalValor = notas.reduce((s, n) => s + (n.valor_total || 0), 0)

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">NFes Recebidas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            AUTO PEÇAS FRANCISCATO LTDA · CNPJ 08.696.597/0001-62
          </p>
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
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
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
                        <a
                          href={(n.possui_xml || n.xml_local) ? `/api/xml/${n.chave_acesso}` : undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={
                            n.xml_local
                              ? 'px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium'
                              : n.possui_xml
                                ? 'px-2 py-1 text-xs rounded bg-blue-100 text-blue-700 hover:bg-blue-200'
                                : 'px-2 py-1 text-xs rounded bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
                          }
                          title={n.xml_local ? 'Baixar XML (local - Supabase)' : n.possui_xml ? 'Baixar XML (via Espiao)' : 'XML nao disponivel'}
                        >
                          XML
                        </a>
                        <a
                          href={n.possui_xml ? `/api/pdf/${n.chave_acesso}` : undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={
                            n.possui_xml
                              ? 'px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200'
                              : 'px-2 py-1 text-xs rounded bg-gray-100 text-gray-400 cursor-not-allowed pointer-events-none'
                          }
                          title={n.possui_xml ? 'Visualizar DANFE' : 'DANFE não disponível'}
                        >
                          DANFE
                        </a>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <footer className="mt-6 text-xs text-gray-400 text-center">
          Dados: Supabase consultaxml · XML: Supabase (local) + Espiao (fallback) · DANFE: Espiao
        </footer>
      </div>
    </main>
  )
}
