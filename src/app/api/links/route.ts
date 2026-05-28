import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { BUCKET_XML, BUCKET_PDF, xmlPath, pdfPath, parseChave } from '@/lib/nfe'

export const dynamic = 'force-dynamic'

type Tipo = 'xml' | 'pdf'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const tipo: Tipo = body.tipo === 'pdf' ? 'pdf' : 'xml'
  const chaves: string[] = Array.isArray(body.chaves)
    ? body.chaves.filter((c: string) => parseChave(c).valid)
    : []

  if (chaves.length === 0) {
    return NextResponse.json({ error: 'Informe ao menos uma chave válida' }, { status: 400 })
  }

  const bucket = tipo === 'pdf' ? BUCKET_PDF : BUCKET_XML
  const paths = chaves.map((c) => (tipo === 'pdf' ? pdfPath(c) : xmlPath(c)))

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(paths, 300)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const links = (data || [])
    .map((d, i) => ({
      chave: chaves[i],
      url: d.signedUrl,
      erro: d.error,
      name:
        tipo === 'pdf' ? `DANFE/DANFE_${chaves[i]}.pdf` : `XML/NFe_${chaves[i]}.xml`,
    }))
    .filter((l) => l.url && !l.erro)
    .map(({ chave, url, name }) => ({ chave, url, name }))

  return NextResponse.json({
    tipo,
    solicitadas: chaves.length,
    disponiveis: links.length,
    links,
  })
}
