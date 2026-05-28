import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fetchResumoPagina, ufFromChave, type ResumoDado } from '@/lib/nfe'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function tokenHint(v?: string): string {
  return v ? `set:${v.slice(-4)}` : 'MISSING'
}

function normalizeData(s?: string): string | null {
  if (!s) return null
  const t = s.trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  return null
}

function parseValor(s?: string): number | null {
  if (s == null) return null
  let t = String(s).trim()
  if (!t) return null
  if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.')
  else if (t.includes(',')) t = t.replace(',', '.')
  const v = parseFloat(t)
  return Number.isFinite(v) ? v : null
}

function mapSituacao(s?: string): string | null {
  if (!s) return null
  const t = s.trim()
  if (t === '0') return 'Cancelada'
  if (t === '1') return 'Autorizada'
  if (t === '2') return 'Carta de Correção'
  return t
}

function buildRow(d: ResumoDado, novo: boolean) {
  const chave = d.chaveAcesso as string
  const row: Record<string, unknown> = {
    chave_acesso: chave,
    cnpj_emitente: d.cnpjCpfEmitente ?? chave.substring(6, 20),
    razao_social_emitente: d.nomeEmitente ?? null,
    numero_nota: d.numeroNfe ?? (parseInt(chave.substring(25, 34), 10) || null),
    modelo: parseInt(chave.substring(20, 22), 10) || null,
    uf_emitente: ufFromChave(chave),
    data_emissao: normalizeData(d.dataEmissao),
    valor_total: parseValor(d.valorTotal),
    situacao: mapSituacao(d.situacao),
    possui_xml: Boolean(d.possuiXml),
  }
  if (novo) row.recebida_em = new Date().toISOString()
  return row
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const dataIni: string | undefined = body.dataIni
  const dataFim: string | undefined = body.dataFim
  const modelo: string = body.modelo || '55'
  // 0 = recebidas (destinatário), 1 = emitidas. Este dash é de NFes recebidas.
  const emitidaRecebida: string = body.emitidaRecebida ?? '0'

  if (!dataIni || !dataFim) {
    return NextResponse.json(
      { error: 'Parâmetros dataIni e dataFim são obrigatórios (YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  const cnpjUsado = process.env.CNPJ_EMPRESA || '08696597000162'

  // 1) Puxa o resumo do Espião, paginando
  const dados: ResumoDado[] = []
  let proxima: string | null = null
  let paginas = 0
  do {
    const r = await fetchResumoPagina({
      cnpj: cnpjUsado,
      dataIni,
      dataFim,
      modelo,
      emitidaRecebida,
      proxima,
    })
    if (!r.ok) {
      console.error('[atualizar] espiao fail', {
        status: r.status,
        body: r.body,
        cnpjUsado,
        req: r.req,
      })
      return NextResponse.json(
        {
          error: 'Falha ao consultar o Espião',
          status: r.status,
          body: r.body,
          debug: {
            cnpjUsado,
            req: r.req,
            tokens: {
              esp: tokenHint(process.env.ESP_CLOUD_TOKEN),
              user: tokenHint(process.env.USER_TOKEN),
            },
          },
        },
        { status: r.status }
      )
    }
    dados.push(...r.dados)
    proxima = r.proxima
    paginas++
  } while (proxima && paginas < 50)

  // 2) Mapeia e separa novos x existentes (para não sobrescrever recebida_em)
  const validos = dados.filter((d) => d.chaveAcesso && /^\d{44}$/.test(d.chaveAcesso))
  const chaves = validos.map((d) => d.chaveAcesso as string)

  let existentes = new Set<string>()
  if (chaves.length > 0) {
    const { data: ex } = await supabase
      .from('notas_fiscais')
      .select('chave_acesso')
      .in('chave_acesso', chaves)
    existentes = new Set((ex || []).map((x) => x.chave_acesso))
  }

  const novosRows = validos.filter((d) => !existentes.has(d.chaveAcesso as string)).map((d) => buildRow(d, true))
  const updRows = validos.filter((d) => existentes.has(d.chaveAcesso as string)).map((d) => buildRow(d, false))

  let inseridos = 0
  let atualizados = 0

  if (novosRows.length > 0) {
    const { error } = await supabase.from('notas_fiscais').insert(novosRows)
    if (error) {
      return NextResponse.json(
        { error: 'Falha ao inserir notas', detalhe: error.message, amostra: validos[0] },
        { status: 500 }
      )
    }
    inseridos = novosRows.length
  }

  if (updRows.length > 0) {
    const { error } = await supabase
      .from('notas_fiscais')
      .upsert(updRows, { onConflict: 'chave_acesso' })
    if (error) {
      return NextResponse.json(
        { error: 'Falha ao atualizar notas', detalhe: error.message, amostra: validos[0] },
        { status: 500 }
      )
    }
    atualizados = updRows.length
  }

  return NextResponse.json({
    ok: true,
    periodo: { dataIni, dataFim },
    paginas,
    total: validos.length,
    inseridos,
    atualizados,
    amostra: validos[0] || null,
  })
}
