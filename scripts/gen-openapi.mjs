#!/usr/bin/env node
// Gera specs OpenAPI 3.0.3 a partir dos apps VTEX IO com builder `node` do workspace Sicredi.
//
// Fonte: ../sicredi.*/node/service.json (paths + flag public) cruzado com os métodos HTTP
// declarados via `method({ GET, POST, ... })` em node/routes.ts ou node/index.ts.
//
// Saída: public/apis/<app>.openapi.json + public/apis/index.json (consumidos pelo Swagger UI).
//
// Limitações conhecidas (ver CLAUDE.md): os apps não validam payload por schema (sem zod/joi),
// então requestBody é genérico. Quando o método de uma rota não puder ser inferido, registre
// um override em scripts/openapi-overrides.json.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..')
const WORKSPACE_ROOT = resolve(REPO_ROOT, '..')
const OUT_DIR = join(REPO_ROOT, 'public', 'apis')
const PAGES_DIR = join(REPO_ROOT, 'apis')
const OVERRIDES_PATH = join(__dirname, 'openapi-overrides.json')

const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']

const DEFAULT_ACCOUNT = 'sicrediqa'
const DEFAULT_ENVIRONMENT = 'vtexcommercestable.com.br'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function loadOverrides() {
  if (!existsSync(OVERRIDES_PATH)) return {}
  try {
    return readJson(OVERRIDES_PATH)
  } catch (e) {
    console.warn(`! overrides inválidos em ${OVERRIDES_PATH}: ${e.message}`)
    return {}
  }
}

// Lê routes.ts + index.ts (quando existirem) concatenados, para cobrir os dois padrões de
// montagem (routes.ts importado vs. rotas inline no index.ts).
function readRoutesSource(nodeDir) {
  let src = ''
  for (const f of ['routes.ts', 'index.ts']) {
    const p = join(nodeDir, f)
    if (existsSync(p)) src += `\n${readFileSync(p, 'utf8')}`
  }
  return src
}

// Dado o nome da rota, encontra `<key>: method({ ... })` e extrai os verbos HTTP do bloco,
// respeitando o balanceamento de chaves para não vazar para a próxima rota.
function extractMethods(src, routeKey) {
  const re = new RegExp(`\\b${routeKey}\\s*:\\s*method\\s*\\(\\s*\\{`, 'm')
  const m = re.exec(src)
  if (!m) return null // não está embrulhado em method() — handler plano

  let i = m.index + m[0].length
  let depth = 1
  const start = i
  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    i++
  }
  const block = src.slice(start, i - 1)

  const verbs = []
  for (const verb of HTTP_VERBS) {
    if (new RegExp(`\\b${verb}\\s*:`, 'm').test(block)) verbs.push(verb)
  }
  return verbs.length ? verbs : null
}

// /_v/foo/:bar/*url -> /_v/foo/{bar}/{url}; coleta os nomes de parâmetros de path.
function toOpenApiPath(vtexPath) {
  const params = []
  const path = vtexPath
    .replace(/:([A-Za-z0-9_]+)/g, (_, name) => {
      params.push(name)
      return `{${name}}`
    })
    .replace(/\*([A-Za-z0-9_]+)/g, (_, name) => {
      params.push(name)
      return `{${name}}`
    })
  return { path, params }
}

function pathParamObjects(params) {
  return params.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }))
}

function buildOperation(verb, routeKey, params, isPublic) {
  const op = {
    summary: routeKey,
    operationId: `${routeKey}_${verb.toLowerCase()}`,
    parameters: pathParamObjects(params),
    responses: {
      200: { description: 'OK' },
      default: { description: 'Erro' },
    },
  }
  if (['POST', 'PUT', 'PATCH'].includes(verb)) {
    op.requestBody = {
      required: false,
      content: {
        'application/json': {
          schema: { type: 'object', additionalProperties: true },
        },
      },
    }
  }
  if (!isPublic) op['x-vtex-private'] = true
  return op
}

function buildSpec(appName, manifest, routeEntries) {
  const paths = {}
  for (const { path, params, verbs, routeKey, isPublic } of routeEntries) {
    paths[path] = paths[path] ?? {}
    for (const verb of verbs) {
      paths[path][verb.toLowerCase()] = buildOperation(
        verb,
        routeKey,
        params,
        isPublic
      )
    }
  }

  return {
    openapi: '3.0.3',
    info: {
      title: manifest.title || `${manifest.vendor}.${manifest.name}`,
      version: manifest.version || '0.0.0',
      description:
        manifest.description ||
        `Rotas HTTP do app VTEX IO ${manifest.vendor}.${manifest.name}.`,
    },
    servers: [
      {
        url: 'https://{account}.{environment}',
        description: 'Host VTEX (account + environment configuráveis)',
        variables: {
          account: { default: DEFAULT_ACCOUNT, description: 'Account VTEX (ex.: sicrediqa)' },
          environment: {
            default: DEFAULT_ENVIRONMENT,
            description: 'Environment VTEX (ex.: vtexcommercestable.com.br)',
          },
        },
      },
    ],
    tags: [{ name: appName }],
    security: [{ appKey: [], appToken: [] }],
    components: {
      securitySchemes: {
        appKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-VTEX-API-AppKey',
          description: 'Application Key da VTEX.',
        },
        appToken: {
          type: 'apiKey',
          in: 'header',
          name: 'X-VTEX-API-AppToken',
          description: 'Application Token da VTEX.',
        },
      },
    },
    paths,
  }
}

function listNodeApps() {
  return readdirSync(WORKSPACE_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((name) => name.startsWith('sicredi.') && !name.startsWith('.DEPRECATED_'))
    .filter((name) => existsSync(join(WORKSPACE_ROOT, name, 'node', 'service.json')))
    .sort()
}

function main() {
  const overrides = loadOverrides()
  const apps = listNodeApps()
  if (!apps.length) {
    console.error(
      `Nenhum app node encontrado em ${WORKSPACE_ROOT}. Os repos sicredi.* irmãos estão presentes?`
    )
    process.exit(1)
  }

  rmSync(OUT_DIR, { recursive: true, force: true })
  mkdirSync(OUT_DIR, { recursive: true })
  const index = []

  for (const dir of apps) {
    const appPath = join(WORKSPACE_ROOT, dir)
    const nodeDir = join(appPath, 'node')
    const service = readJson(join(nodeDir, 'service.json'))
    const manifest = existsSync(join(appPath, 'manifest.json'))
      ? readJson(join(appPath, 'manifest.json'))
      : { name: dir.replace(/^sicredi\./, ''), vendor: 'sicredi' }
    const appName = `${manifest.vendor || 'sicredi'}.${manifest.name}`
    const src = readRoutesSource(nodeDir)
    const appOverrides = overrides[appName] || overrides[manifest.name] || {}

    const routeEntries = []
    const warnings = []
    for (const [routeKey, def] of Object.entries(service.routes || {})) {
      if (!def?.path) continue
      const { path, params } = toOpenApiPath(def.path)
      let verbs = appOverrides[routeKey]
      if (!verbs) {
        verbs = extractMethods(src, routeKey)
        if (!verbs) {
          // Handler plano (sem method()): default POST. Corrija via overrides se for GET.
          verbs = ['POST']
          warnings.push(routeKey)
        }
      }
      routeEntries.push({
        routeKey,
        path,
        params,
        verbs,
        isPublic: def.public !== false,
      })
    }

    if (!routeEntries.length) {
      // Apps GraphQL/sem rotas HTTP em service.json não rendem Swagger útil.
      console.log(`· ${appName} — sem rotas HTTP, ignorado`)
      continue
    }

    const spec = buildSpec(appName, manifest, routeEntries)
    const file = `${manifest.name}.openapi.json`
    writeFileSync(join(OUT_DIR, file), `${JSON.stringify(spec, null, 2)}\n`)

    index.push({
      name: appName,
      shortName: manifest.name,
      title: spec.info.title,
      file,
      routes: routeEntries.length,
    })

    const warn = warnings.length ? ` (método inferido: ${warnings.join(', ')})` : ''
    console.log(`✓ ${appName} — ${routeEntries.length} rota(s)${warn}`)
  }

  index.sort((a, b) => a.name.localeCompare(b.name))
  writeFileSync(join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)

  // Páginas VitePress: uma por app (deep-link) + índice da seção APIs.
  rmSync(PAGES_DIR, { recursive: true, force: true })
  mkdirSync(PAGES_DIR, { recursive: true })
  for (const app of index) {
    const md = `---
title: ${app.name}
aside: false
---

# ${app.title}

\`${app.name}\` — ${app.routes} rota(s). Spec: [\`/apis/${app.file}\`](/apis/${app.file})

> O **Try it out** chama o ambiente VTEX real com as credenciais informadas em **Authorize**
> (\`X-VTEX-API-AppKey\` / \`X-VTEX-API-AppToken\`). As credenciais ficam só no seu browser.

<SwaggerView spec="/apis/${app.file}" />
`
    writeFileSync(join(PAGES_DIR, `${app.shortName}.md`), md)
  }

  const indexRows = index
    .map((a) => `| [${a.name}](/apis/${a.shortName}) | ${a.title} | ${a.routes} |`)
    .join('\n')
  writeFileSync(
    join(PAGES_DIR, 'index.md'),
    `---
title: APIs
---

# APIs dos serviços

Specs OpenAPI geradas a partir dos \`service.json\` dos apps com builder \`node\`. Cada página tem
Swagger UI com **Try it out** habilitado. Configure account/environment e credenciais
(\`X-VTEX-API-AppKey\` / \`X-VTEX-API-AppToken\`) no botão **Authorize**.

Regerar: \`yarn gen:openapi\`.

| App | Título | Rotas |
| --- | --- | --- |
${indexRows}
`
  )

  console.log(`\n${index.length} spec(s) em ${OUT_DIR}`)
  console.log(`${index.length} página(s) em ${PAGES_DIR}`)
}

main()
