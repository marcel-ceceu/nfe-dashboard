import { supabase } from '@/lib/supabase'
import { BUCKET_PDF, pdfPath, parseChave, fetchPdfFromEspiao, uploadPdf } from '@/lib/nfe'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ chave: string }> }
) {
  const { chave } = await params

  if (!parseChave(chave).valid) {
    return new Response(JSON.stringify({ error: 'Chave de acesso inválida' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // 1) Já está no Supabase Storage? redireciona pra signed URL (CDN do Supabase)
  const { data: signed } = await supabase.storage
    .from(BUCKET_PDF)
    .createSignedUrl(pdfPath(chave), 120)
  if (signed?.signedUrl) {
    return Response.redirect(signed.signedUrl, 302)
  }

  // 2) Cache-on-read: busca no Espião, grava no Storage e serve
  const pdf = await fetchPdfFromEspiao(chave)
  if (!pdf.ok) {
    return new Response(
      JSON.stringify({ error: 'PDF não disponível no Espião', status: pdf.status, body: pdf.body }),
      { status: pdf.status, headers: { 'Content-Type': 'application/json' } }
    )
  }

  await uploadPdf(chave, pdf.bytes, 'espiao')

  return new Response(new Blob([pdf.bytes], { type: 'application/pdf' }), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DANFE_${chave}.pdf"`,
      'X-Source': 'espiao->storage',
    },
  })
}
