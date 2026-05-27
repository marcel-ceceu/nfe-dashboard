import { createClient } from '@supabase/supabase-js'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Faltam variaveis SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local')
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    db: { schema: 'consultaxml' },
    auth: { persistSession: false },
  }
)

export type Nota = {
  chave_acesso: string
  cnpj_emitente: string
  razao_social_emitente: string | null
  uf_emitente: string | null
  numero_nota: number | null
  modelo: number
  data_emissao: string | null
  valor_total: number | null
  situacao: string | null
  ciencia_em: string | null
  possui_xml: boolean
  recebida_em: string
}
