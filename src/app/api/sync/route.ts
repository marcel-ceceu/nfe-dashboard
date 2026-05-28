import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {
  BUCKET_XML,
  BUCKET_PDF,
  xmlPath,
  pdfPath,
  parseChave,
  ensureBuckets,
  storageHasFile,
  fetchXmlFromEspiao,
  fetchPdfFromEspiao,
  uploadXml,
  uploadPdf,
  registrarArquivo,
} from '@/lib/nfe'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Tipo = 'xml' | 'pdf'
type Item = { chave: string; tipo: Tipo; status: 'ja_existia' | 'gravado' | 'erro'; detalhe?: string }

async function resolveChaves(body: {
  chaves?: string[]
  dataIni?: string
  dataFim?: string
  busca?: string
}): Promise<string[]> {
  if (Array.isArray(body.chaves) && body.chaves.length > 0) {
    return body.chaves.filter((c) => parseChave(c).valid)
  }
  if (!body.dataIni || !body.dataFim) return []

  let query = supabase
    .from('notas_fiscais')
    .select('chave_acesso')
    .gte('data_emissao', body.dataIni)
    .lte('data_emissao', body.dataFim)
    .order('data_emissao', { ascending: false })
    .order('numero_nota', { ascending: false })
    .limit(500)

  if (body.busca && body.busca.length >= 2) {
    const escaped = body.busca.replace(/[%_]/g, (m) => '\\' + m)
    query = query.or(`razao_social_emitente.ilike.%${escaped}%,cnpj_emitente.ilike.%${escaped}%`)
  }

  const { data } = await query
  return (data || []).map((n) => n.chave_acesso).filter((c) => parseChave(c).valid)
}

async function processaItem(chave: string, tipo: Tipo): Promise<Item> {
  try {
    if (tipo === 'xml') {
      if (await storageHasFile(BUCKET_XML, xmlPath(chave))) {
        await registrarArquivo(chave, 'xml', xmlPath(chave), 'storage')
        return { chave, tipo, status: 'ja_existia' }
      }
      // tenta coluna legada antes do Espião
      const { data } = await supabase
        .from('xmls_baixados')
        .select('xml_completo, origem')
        .eq('chave_acesso', chave)
        .maybeSingle()
      if (data?.xml_completo) {
        await uploadXml(chave, data.xml_completo, data.origem || 'coluna')
        return { chave, tipo, status: 'gravado', detalhe: 'coluna' }
      }
      const r = await fetchXmlFromEspiao(chave)
      if (!r.ok) return { chave, tipo, status: 'erro', detalhe: `espiao ${r.status}` }
      await uploadXml(chave, r.xml, 'espiao')
      return { chave, tipo, status: 'gravado', detalhe: 'espiao' }
    } else {
      if (await storageHasFile(BUCKET_PDF, pdfPath(chave))) {
        await registrarArquivo(chave, 'pdf', pdfPath(chave), 'storage')
        return { chave, tipo, status: 'ja_existia' }
      }
      const r = await fetchPdfFromEspiao(chave)
      if (!r.ok) return { chave, tipo, status: 'erro', detalhe: `espiao ${r.status}` }
      await uploadPdf(chave, r.bytes, 'espiao')
      return { chave, tipo, status: 'gravado', detalhe: 'espiao' }
    }
  } catch (e) {
    return { chave, tipo, status: 'erro', detalhe: (e as Error).message }
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const tipos: Tipo[] = Array.isArray(body.tipos) && body.tipos.length > 0 ? body.tipos : ['xml', 'pdf']
  const cursor: number = Number.isInteger(body.cursor) ? body.cursor : 0
  const limit: number = Number.isInteger(body.limit) && body.limit > 0 ? Math.min(body.limit, 50) : 20

  await ensureBuckets()

  const lista = await resolveChaves(body)
  const total = lista.length
  const batch = lista.slice(cursor, cursor + limit)

  const resultados: Item[] = []
  for (const chave of batch) {
    for (const tipo of tipos) {
      resultados.push(await processaItem(chave, tipo))
    }
  }

  const proximoCursor = cursor + limit
  const done = proximoCursor >= total

  return NextResponse.json({
    total,
    cursor,
    processadas: batch.length,
    nextCursor: done ? null : proximoCursor,
    done,
    gravados: resultados.filter((r) => r.status === 'gravado').length,
    ja_existiam: resultados.filter((r) => r.status === 'ja_existia').length,
    erros: resultados.filter((r) => r.status === 'erro').length,
    detalhes_erros: resultados.filter((r) => r.status === 'erro'),
  })
}
