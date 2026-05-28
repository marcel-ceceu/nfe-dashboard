-- Rastreio dos arquivos (XML/PDF) já gravados no Supabase Storage.
-- Permite ao dashboard saber, em 1 query, o que está disponível p/ download.
-- Rode uma vez no SQL Editor do Supabase.

create table if not exists consultaxml.arquivos_nfe (
  chave_acesso text        not null,
  tipo         text        not null check (tipo in ('xml', 'pdf')),
  caminho      text,
  origem       text,
  criado_em    timestamptz not null default now(),
  primary key (chave_acesso, tipo)
);

-- O dashboard acessa via service role (bypassa RLS), então não precisa de policy.
-- Recarrega o schema do PostgREST para a API enxergar a tabela imediatamente.
notify pgrst, 'reload schema';
