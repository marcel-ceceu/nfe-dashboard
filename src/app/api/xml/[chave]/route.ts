import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chave: string }> }
) {
  const { chave } = await params

  if (!/^\d{44}$/.test(chave)) {
    return new Response(JSON.stringify({ error: 'Chave de acesso invalida' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 1) Supabase primeiro (consultaxml.xmls_baixados)
  try {
    const { data } = await supabase
      .from('xmls_baixados')
      .select('xml_completo, origem, tamanho_bytes')
      .eq('chave_acesso', chave)
      .maybeSingle()

    if (data?.xml_completo) {
      return new Response(data.xml_completo, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Content-Disposition': `inline; filename="NFe_${chave}.xml"`,
          'X-Source': `supabase-${data.origem || 'local'}`,
          'X-Size': String(data.tamanho_bytes || 0),
        },
      })
    }
  } catch (e) {
    console.warn('[xml] supabase lookup falhou:', (e as Error).message)
  }

  // 2) Fallback Espiao
  const url = `https://api.espiaonfe.com.br/v1-cloud/consulta/chave/xml?chaveAcesso=${chave}`
  const r = await fetch(url, {
    headers: {
      'esp-cloud-token': process.env.ESP_CLOUD_TOKEN!,
      'user-token': process.env.USER_TOKEN!,
      Accept: 'application/xml, application/json',
    },
    cache: 'no-store',
  })

  if (!r.ok) {
    const body = await r.text()
    return new Response(
      JSON.stringify({ error: 'XML nao disponivel', status: r.status, body: body.substring(0, 200) }),
      { status: r.status, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const xml = await r.text()
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `inline; filename="NFe_${chave}.xml"`,
      'X-Source': 'espiao-fallback',
    },
  })
}