export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chave: string }> }
) {
  const { chave } = await params

  if (!/^\d{44}$/.test(chave)) {
    return new Response(JSON.stringify({ error: 'Chave de acesso inválida' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = `https://api.espiaonfe.com.br/v1-cloud/consulta/chave/pdf?chaveAcesso=${chave}`
  const r = await fetch(url, {
    headers: {
      'esp-cloud-token': process.env.ESP_CLOUD_TOKEN!,
      'user-token': process.env.USER_TOKEN!,
      Accept: 'application/pdf, application/json',
    },
    cache: 'no-store',
  })

  if (!r.ok) {
    const body = await r.text()
    return new Response(
      JSON.stringify({ error: 'PDF não disponível no Espião', status: r.status, body }),
      { status: r.status, headers: { 'Content-Type': 'application/json' } }
    )
  }

  // Pode vir como PDF binário OU como JSON { pdf: "<base64>" }
  const contentType = r.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    try {
      const j = await r.json()
      const b64 = j.pdf || j.base64 || j.arquivo || j.conteudo
      if (b64) {
        const buf = Buffer.from(b64, 'base64')
        return new Response(buf, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="DANFE_${chave}.pdf"`,
          },
        })
      }
      return new Response(JSON.stringify({ error: 'Resposta JSON não contém PDF', json: j }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Erro ao parsear JSON do Espião' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // Assume binário
  const buf = await r.arrayBuffer()
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DANFE_${chave}.pdf"`,
    },
  })
}
