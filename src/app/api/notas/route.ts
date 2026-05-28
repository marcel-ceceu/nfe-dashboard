import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const dataIni = searchParams.get('dataIni')
  const dataFim = searchParams.get('dataFim')
  const busca = searchParams.get('busca')

  if (!dataIni || !dataFim) {
    return NextResponse.json(
      { error: 'Parametros dataIni e dataFim sao obrigatorios (formato YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  let query = supabase
    .from('notas_fiscais')
    .select(
      'chave_acesso, cnpj_emitente, razao_social_emitente, uf_emitente, numero_nota, data_emissao, valor_total, situacao, ciencia_em, possui_xml'
    )
    .gte('data_emissao', dataIni)
    .lte('data_emissao', dataFim)
    .order('data_emissao', { ascending: false })
    .order('numero_nota', { ascending: false })
    .limit(500)

  if (busca && busca.length >= 2) {
    const escaped = busca.replace(/[%_]/g, (m) => '\\' + m)
    query = query.or(
      `razao_social_emitente.ilike.%${escaped}%,cnpj_emitente.ilike.%${escaped}%`
    )
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Enriquecer com xml_local (coluna legada) e flags do Storage (arquivos_nfe)
  let xmlsLocais = new Set<string>()
  let xmlStorage = new Set<string>()
  let pdfStorage = new Set<string>()
  if (data && data.length > 0) {
    const chaves = data.map(n => n.chave_acesso)

    const { data: locais } = await supabase
      .from('xmls_baixados')
      .select('chave_acesso')
      .in('chave_acesso', chaves)
    if (locais) xmlsLocais = new Set(locais.map(x => x.chave_acesso))

    // Flags do Supabase Storage (degrada sem quebrar se a tabela ainda nao existir)
    try {
      const { data: arq } = await supabase
        .from('arquivos_nfe')
        .select('chave_acesso, tipo')
        .in('chave_acesso', chaves)
      for (const a of arq || []) {
        if (a.tipo === 'xml') xmlStorage.add(a.chave_acesso)
        else if (a.tipo === 'pdf') pdfStorage.add(a.chave_acesso)
      }
    } catch (e) {
      console.warn('[notas] arquivos_nfe indisponivel:', (e as Error).message)
    }
  }

  const enriched = (data || []).map(n => ({
    ...n,
    xml_local: xmlsLocais.has(n.chave_acesso),
    xml_storage: xmlStorage.has(n.chave_acesso),
    pdf_storage: pdfStorage.has(n.chave_acesso),
  }))

  return NextResponse.json({
    dados: enriched,
    count: enriched.length,
    xmls_locais: enriched.filter(n => n.xml_local).length,
    xmls_storage: enriched.filter(n => n.xml_storage).length,
    pdfs_storage: enriched.filter(n => n.pdf_storage).length,
  })
}