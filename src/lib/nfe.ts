import { supabase } from '@/lib/supabase'

export const BUCKET_XML = 'nfe-xml'
export const BUCKET_PDF = 'nfe-pdf'

const ESP_BASE = 'https://api.espiaonfe.com.br/v1-cloud/consulta/chave'

function espHeaders(accept: string) {
  return {
    'esp-cloud-token': process.env.ESP_CLOUD_TOKEN!,
    'user-token': process.env.USER_TOKEN!,
    Accept: accept,
  }
}

export function parseChave(chave: string) {
  const valid = /^\d{44}$/.test(chave)
  if (!valid) return { valid: false as const, cnpj: '', ano: '' }
  // Layout chave NF-e: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
  const cnpj = chave.substring(6, 20)
  const ano = '20' + chave.substring(2, 4)
  return { valid: true as const, cnpj, ano }
}

export function xmlPath(chave: string) {
  const { cnpj, ano } = parseChave(chave)
  return `${cnpj}/${ano}/${chave}.xml`
}

export function pdfPath(chave: string) {
  const { cnpj, ano } = parseChave(chave)
  return `${cnpj}/${ano}/${chave}.pdf`
}

let bucketsReady = false
export async function ensureBuckets() {
  if (bucketsReady) return
  const { data } = await supabase.storage.listBuckets()
  const existentes = new Set((data || []).map((b) => b.name))
  if (!existentes.has(BUCKET_XML)) {
    await supabase.storage.createBucket(BUCKET_XML, { public: false })
  }
  if (!existentes.has(BUCKET_PDF)) {
    await supabase.storage.createBucket(BUCKET_PDF, { public: false })
  }
  bucketsReady = true
}

export async function storageHasFile(bucket: string, path: string) {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60)
  return Boolean(data?.signedUrl)
}

type EspXml = { ok: true; xml: string } | { ok: false; status: number; body: string }
export async function fetchXmlFromEspiao(chave: string): Promise<EspXml> {
  const r = await fetch(`${ESP_BASE}/xml?chaveAcesso=${chave}`, {
    headers: espHeaders('application/xml, application/json'),
    cache: 'no-store',
  })
  if (!r.ok) return { ok: false, status: r.status, body: (await r.text()).substring(0, 200) }
  return { ok: true, xml: await r.text() }
}

type EspPdf = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; status: number; body: string }
export async function fetchPdfFromEspiao(chave: string): Promise<EspPdf> {
  const r = await fetch(`${ESP_BASE}/pdf?chaveAcesso=${chave}`, {
    headers: espHeaders('application/pdf, application/json'),
    cache: 'no-store',
  })
  if (!r.ok) return { ok: false, status: r.status, body: (await r.text()).substring(0, 200) }

  const contentType = r.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const j = await r.json()
    const b64 = j.pdf || j.base64 || j.arquivo || j.conteudo
    if (!b64) return { ok: false, status: 502, body: 'JSON sem campo de PDF' }
    return { ok: true, bytes: Uint8Array.from(Buffer.from(b64, 'base64')) }
  }
  return { ok: true, bytes: new Uint8Array(await r.arrayBuffer()) }
}

// Registra (upsert) o arquivo na tabela consultaxml.arquivos_nfe para o front
// saber, em 1 query, o que já está no Storage. Degrada sem quebrar se a tabela
// ainda não existir.
export async function registrarArquivo(
  chave: string,
  tipo: 'xml' | 'pdf',
  caminho: string,
  origem: string
) {
  try {
    const { error } = await supabase
      .from('arquivos_nfe')
      .upsert({ chave_acesso: chave, tipo, caminho, origem }, { onConflict: 'chave_acesso,tipo' })
    if (error) console.warn('[arquivos_nfe] registro falhou:', error.message)
  } catch (e) {
    console.warn('[arquivos_nfe] registro falhou:', (e as Error).message)
  }
}

export async function uploadXml(chave: string, xml: string, origem: string) {
  await ensureBuckets()
  const res = await supabase.storage
    .from(BUCKET_XML)
    .upload(xmlPath(chave), new Blob([xml], { type: 'application/xml' }), {
      contentType: 'application/xml; charset=utf-8',
      upsert: true,
      metadata: { origem },
    })
  if (!res.error) await registrarArquivo(chave, 'xml', xmlPath(chave), origem)
  return res
}

export async function uploadPdf(chave: string, bytes: Uint8Array<ArrayBuffer>, origem: string) {
  await ensureBuckets()
  const res = await supabase.storage.from(BUCKET_PDF).upload(pdfPath(chave), bytes, {
    contentType: 'application/pdf',
    upsert: true,
    metadata: { origem },
  })
  if (!res.error) await registrarArquivo(chave, 'pdf', pdfPath(chave), origem)
  return res
}
