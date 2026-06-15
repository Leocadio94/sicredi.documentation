# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é este repositório

`sicredi.documentation` é a documentação de onboarding e arquitetura do **Shopping Sicredi**
(shopping.sicredi.com.br) — um conjunto de apps VTEX IO. É um repo **só de documentação**: não
contém código de app VTEX. É o ponto de partida para perguntas de arquitetura, "qual app faz o
quê" e "como o site funciona".

As convenções técnicas do workspace (stack de auth, entidade `CA` do Master Data, contrato
compartilhado de audit-log, constraints de builder, estilo de código) vivem no `CLAUDE.md` do
workspace pai em `/home/gabriel/Quality/sicredi/CLAUDE.md`. Quando um app tem o próprio
`CLAUDE.md` (ex.: `oauth-provider`, `authentication-token-provider`, `admin-audit-logs`,
`login-service`), **o per-app vence**. Este repo apenas descreve e diagrama esses contratos —
não os redefine.

## Estrutura

| Arquivo | Conteúdo |
| --- | --- |
| `ONBOARDING.md` | Relatório principal: o que é o projeto, glossário VTEX, organização do código, arquitetura compartilhada, mapa de domínios, diagrama macro. |
| `ONBOARDING-DOMINIOS.md` | Um capítulo por domínio funcional (D1 auth … D7 rotinas): narrativa + tabela de rotas/queries + quem chama o quê + fluxograma. |
| `ONBOARDING-CATALOGO.md` | Tabela de referência de todos os repositórios `sicredi.*` (categoria, builders, domínio, rotas, dependências). |
| `diagrams/.src/*.mmd` | Fontes Mermaid dos diagramas. |
| `diagrams/*.svg` | SVGs exportados — fallback para Confluence sem plugin Mermaid. |

Diagramas: `d0-macro` (visão por camadas) + `d1`…`d7` (um fluxograma por domínio) +
`s1-login-gate` (diagrama de sequência do gate de pré-sessão). 9 ao todo.

Os Markdown são **Confluence-ready**: podem ser colados direto no Confluence, que renderiza o
Mermaid inline; os SVGs cobrem o caso sem plugin.

## Mantendo a documentação em sincronia

Ao mudar rotas, schemas GraphQL ou relações entre apps no workspace, atualize o Markdown
correspondente **e** regenere o diagrama afetado:

```sh
# .mmd → .svg (precisa do Mermaid CLI; puppeteer.json aponta o Chromium se necessário)
mmdc -p puppeteer.json -i diagrams/.src/<nome>.mmd -o diagrams/<nome>.svg -b white
```

`puppeteer.json` exemplo: `{"executablePath":"/usr/sbin/chromium","args":["--no-sandbox"]}`.

## Tooling local (site + OpenAPI)

Este repo também serve a documentação como site estático local (VitePress) e gera specs
OpenAPI/Swagger dos apps com builder `node`. **Local-only — nada é publicado.**

```sh
yarn install
yarn gen:openapi     # gera public/apis/<app>.openapi.json a partir dos service.json dos apps node
yarn docs:dev        # site local em http://localhost:5173 (Markdown + Mermaid + Swagger UI)
yarn docs:build      # build estático em .vitepress/dist
yarn docs:preview    # serve o build
```

`gen:openapi` (`scripts/gen-openapi.mjs`) lê os repos **irmãos** em
`/home/gabriel/Quality/sicredi/sicredi.*/node/` — eles precisam estar presentes no workspace
(use `sync-sicredi-repos.sh` do pai para clonar/atualizar). Para cada app: extrai paths do
`service.json` e os métodos HTTP parseando `method({ GET, POST, ... })` em `routes.ts`/`index.ts`.
Como os apps não têm validação por schema (zod/joi), o `requestBody` gerado é genérico — os specs
servem para descobrir/testar endpoints, não como contrato tipado.

- Base configurável no Swagger UI: variáveis de server `account` (default `sicrediqa`) e
  `environment` (default `vtexcommercestable.com.br`).
- Auth: headers `X-VTEX-API-AppKey` / `X-VTEX-API-AppToken` (botão **Authorize**).
- O **"Try it out" bate em ambiente VTEX real** com as credenciais informadas — elas ficam só no
  browser. Os apps excluídos são os `.DEPRECATED_*`.
- Quando o parse de método falhar para algum app (ex.: handler plano como
  `coupon-service`/`validateCoupon`), registre um override em `scripts/openapi-overrides.json` e
  rode `yarn gen:openapi` de novo.

## Contexto de domínio relevante para a doc

Apenas o essencial para escrever/diagramar com precisão (detalhe completo no `CLAUDE.md` do pai):

- **Gate**: `sicredi.oauth-provider` (Custom OAuth do VTEX ID) gateia a vitrine sobre a entidade
  `CA` do Master Data (`isSicrediAssociate=true`). Caminhos: OTP por e-mail ou Google.
- **Broker de token**: `sicredi.authentication-token-provider` centraliza credenciais Sicredi;
  apps de back-end dependem dele em vez de guardar segredos.
- **Audit-log compartilhado**: 8 services escrevem no mesmo shape em VBase, lido pelo
  `admin-audit-logs`. `POST /audit-logs` é intencionalmente não autenticado (cross-write entre
  apps); `GET`/`DELETE` são gateados por admin. Ao mudar a lista de writers ou o shape, atualize
  os 8 + o reader + as seções de audit-log destes docs em conjunto.
- **Ignorar** `sicredi.login-custom` (experimento descontinuado) — não entra em docs nem diagramas.
