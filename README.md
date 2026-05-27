# NFe Dashboard - APESP

Dashboard local pra consultar NFes recebidas contra o CNPJ APESP (08.696.597/0001-62).
Le do Supabase `consultaxml.notas_fiscais` (populado pelo worker) e proxia XML/DANFE via API do Espiao Cloud.

## Stack

- Next.js 15 (App Router) + React 19
- TypeScript
- Tailwind CSS 3
- Supabase (service_role, server-side)

## Rodar local

```bash
npm install
npm run dev
```

Abre em http://localhost:3000

## Estrutura

```
src/
├── app/
│   ├── page.tsx                 # Tela principal (filtros + tabela)
│   ├── layout.tsx
│   ├── globals.css
│   └── api/
│       ├── notas/route.ts       # GET /api/notas?dataIni&dataFim&busca
│       ├── xml/[chave]/route.ts # GET /api/xml/<chave> -> XML do Espiao
│       └── pdf/[chave]/route.ts # GET /api/pdf/<chave> -> DANFE PDF do Espiao
└── lib/
    └── supabase.ts              # Cliente server-side (schema consultaxml)
```

## Credenciais

Ja preenchidas em `.env.local`. Para deploy em Vercel, configurar as mesmas vars no painel.

## Proximos passos

- [ ] Paginacao (atual: limit 500)
- [ ] Export CSV
- [ ] Filtro por emitente (dropdown)
- [ ] Manifestacao do destinatario (botao "Confirmar operacao")
- [ ] Deploy Vercel
