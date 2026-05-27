---
name: sankhya-ref-tabelas
description: >-
  Orienta atualização dos quatro Markdown em 00-SankhyaRefTabelas (tabelas-nativas.md, tabelas-adicionais.md, views.md, ref-sistema.md): secções por objeto, colunas usadas no repo ordenadas por frequência, tipo lógico. Use com SQL Sankhya, inventário de objetos ou após mudança de consulta.
disable-model-invocation: false
---

# Skill — Sankhya Ref Tabelas (`00-SankhyaRefTabelas`)

## Objetivo

Manter **referência mínima e fiel ao uso real** no repositório: dentro de **um único `.md` por categoria**, usar **secções** por tabela/view (`## NOME`), com **colunas** vistas nas consultas, **rank por ocorrências** quando possível, e **tipo lógico**.

## Os quatro documentos

- `00-SankhyaRefTabelas/tabelas-nativas.md` — produto, **não** `AD_*`.
- `00-SankhyaRefTabelas/tabelas-adicionais.md` — `AD_*` e custom.
- `00-SankhyaRefTabelas/views.md` — views.
- `00-SankhyaRefTabelas/ref-sistema.md` — transversal; não repetir tabelas longas dos outros três.

## Quando aplicar

- SQL novo ou alterado (`.sql`, `.md`, HTML/JS com query).
- Pedido para **inventariar** ou **sincronizar** referências.
- Menção a **`@sankhya-ref-tabelas`** ou **`00-SankhyaRefTabelas`**.

## Onde gravar cada objeto

1. **`AD_*`** (ou política equivalente) → **`tabelas-adicionais.md`**.
2. **View** → **`views.md`**.
3. Caso contrário → **`tabelas-nativas.md`**.
4. Título da secção: **`## NOMEOBJETO`** em maiúsculas como no Oracle/Sankhya.

## Conteúdo mínimo por secção

- Subtítulo opcional língua natural; depois tabela: `Coluna | Tipo lógico | Rank (opc.) | Notas`.
- **Rank**: grep / análise estática no repo; se não der, ordem alfabética e nota “rank não calculado”.

## Tipos lógicos

Ex.: `VARCHAR2`/`CHAR`/`CLOB` → texto; `NUMBER` → número; `DATE`/`TIMESTAMP` → data; flags → booleano; sem fonte → `desconhecido`.

## Restrições

- **Não** abrir um novo `.md` por tabela nem criar subpastas por categoria.
- **Não** listar colunas sem uso no projeto (salvo pedido + fonte TDDCAM/export).

## Regeneração em massa (nativas + adicionais)

- `00-SankhyaRefTabelas/scan-ref-repo.js` — scan estático do repo; sobrescreve `tabelas-nativas.md`, `tabelas-adicionais.md` e `views.md`.
- O **contrato** editorial continuam estes quatro ficheiros e o formato por `##`.

## Regra Cursor

- `.cursor/rules/sankhya-ref-tabelas.mdc`
