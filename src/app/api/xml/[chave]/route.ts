import { supabase } from '@/lib/supabase'
import { BUCKET_XML, xmlPath, parseChave, fetchXmlFromEspiao, uploadXml } from '@/lib/nfe'

export const dynamic = 'force-dynamic'

function serveXml(xml: string, chave: string, source: string) {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `inline; filename="NFe_${chave}.xml"`,
      'X-Source': source,
    },
  })
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chave: string }> }
) {
  const { chave } = await params

  if (!parseChave(chave).valid) {
    return new Response(JSON.stringify({ error: 'Chave de acesso invalida' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 1) Já está no Supabase Storage? redireciona pra signed URL
  const { data: signed } = await supabase.storage
    .from(BUCKET_XML)
    .createSignedUrl(xmlPath(chave), 120)
  if (signed?.signedUrl) {
    return Response.redirect(signed.signedUrl, 302)
  }

  // 2) Coluna consultaxml.xmls_baixados (legado) -> backfill pro Storage
  try {
    const { data } = await supabase
      .from('xmls_baixados')
      .select('xml_completo, origem')
      .eq('chave_acesso', chave)
      .maybeSingle()

    if (data?.xml_completo) {
      await uploadXml(chave, data.xml_completo, data.origem || 'coluna')
      return serveXml(data.xml_completo, chave, `coluna->storage`)
    }
  } catch (e) {
    console.warn('[xml] lookup coluna falhou:', (e as Error).message)
  }

  // 3) Cache-on-read: Espião -> Storage
  const r = await fetchXmlFromEspiao(chave)
  if (!r.ok) {
    return new Response(
      JSON.stringify({ error: 'XML nao disponivel', status: r.status, body: r.body }),
      { status: r.status, headers: { 'Content-Type': 'application/json' } }
    )
  }

  await uploadXml(chave, r.xml, 'espiao')
  return serveXml(r.xml, chave, 'espiao->storage')
}
