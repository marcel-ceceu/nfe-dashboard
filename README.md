# NFe Dashboard - APESP

Dashboard local pra consultar NFes recebidas contra o CNPJ APESP (08.696.597/0001-62).
Le do Supabase `consultaxml.notas_fiscais` (populado pelo worker) e proxia XML/DANFE via API do Espiao Cloud.

## Stack

- Next.js 15 (App Router) + React 19
- TypeScript
- Tailwind CSS 3
- Supabase (service_role, server-side)

## Rodar local

**Desenvolvimento** (hot-reload, porta 3000):

```bash
npm install
npm run dev
```

Ou duplo clique em **`abrir-dash.bat`**.

**Build de distribuição** (`dist/`, modo produção, porta 3001):

```bash
npm run build:dist
```

Ou duplo clique em **`abrir-dist.bat`** (gera `dist/` na primeira vez e abre o browser).

> Diferente dos dashboards Sankhya (um `.html` em `dist/`): aqui `dist/` é um **servidor Node** com as API routes. Continua precisando de `.env.local`.

## Estrutura

```
build.js                         # next build + copia standalone -> dist/
abrir-dash.bat / abrir-dist.bat  # Abrir no browser (dev vs dist)
src/
├── app/
│   ├── page.tsx                 # Tela principal (filtros + tabela)
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── notas/route.ts       # GET /api/notas?dataIni&dataFim&busca
│       ├── atualizar/route.ts   # POST resumo Espião -> notas_fiscais
│       ├── sync/route.ts        # POST Espião -> Storage
│       ├── links/route.ts       # POST signed URLs (ZIP)
│       ├── xml/[chave]/route.ts # GET /api/xml/<chave>
│       └── pdf/[chave]/route.ts # GET /api/pdf/<chave>
└── lib/
    ├── supabase.ts
    └── nfe.ts                   # Espião, Storage, arquivos_nfe
dist/                            # Gerado (gitignore) — servidor standalone
```

## Credenciais

Ja preenchidas em `.env.local`. Para deploy em Vercel, configurar as mesmas vars no painel.

## Proximos passos

- [ ] Paginacao (atual: limit 500)
- [ ] Export CSV
- [ ] Filtro por emitente (dropdown)
- [ ] Manifestacao do destinatario (botao "Confirmar operacao")
- [ ] Deploy Vercel
