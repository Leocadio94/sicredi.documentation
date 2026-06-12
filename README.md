# sicredi.documentation

Documentação de onboarding do **Shopping Sicredi** (shopping.sicredi.com.br), pronta para colar no Confluence (Markdown + MermaidJS).

| Arquivo | Conteúdo |
| --- | --- |
| [ONBOARDING.md](./ONBOARDING.md) | Relatório principal: o que é o projeto, glossário VTEX, arquitetura compartilhada e diagrama macro |
| [ONBOARDING-DOMINIOS.md](./ONBOARDING-DOMINIOS.md) | Um capítulo por domínio funcional (auth, pontos, pagamentos...), com rotas, queries e fluxograma |
| [ONBOARDING-CATALOGO.md](./ONBOARDING-CATALOGO.md) | Tabela de referência de todos os repositórios `sicredi.*` |
| [diagrams/](./diagrams/) | SVGs dos diagramas (fallback para Confluence sem plugin Mermaid); fontes `.mmd` em `diagrams/.src/` |

Para regenerar os SVGs após editar um diagrama:

```sh
mmdc -p puppeteer.json -i diagrams/.src/<nome>.mmd -o diagrams/<nome>.svg -b white
```

(onde `puppeteer.json` contém `{"executablePath":"/usr/sbin/chromium","args":["--no-sandbox"]}` se o Chromium do puppeteer não estiver instalado).
