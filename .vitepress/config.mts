import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Sidebar da seção APIs montada a partir do índice gerado por scripts/gen-openapi.mjs.
function apiSidebar() {
  const indexPath = fileURLToPath(new URL('../public/apis/index.json', import.meta.url))
  if (!existsSync(indexPath)) return []
  try {
    const apps = JSON.parse(readFileSync(indexPath, 'utf8'))
    return apps.map((a: { shortName: string; name: string }) => ({
      text: a.name,
      link: `/apis/${a.shortName}`,
    }))
  } catch {
    return []
  }
}

export default withMermaid(
  defineConfig({
    title: 'Sicredi — Documentação',
    description: 'Onboarding técnico do Shopping Sicredi (VTEX IO).',
    lang: 'pt-BR',
    cleanUrls: true,
    // Não tratar estes como páginas do site.
    srcExclude: ['README.md', 'CLAUDE.md'],
    ignoreDeadLinks: true,
    themeConfig: {
      nav: [
        { text: 'Onboarding', link: '/ONBOARDING' },
        { text: 'Domínios', link: '/ONBOARDING-DOMINIOS' },
        { text: 'Catálogo', link: '/ONBOARDING-CATALOGO' },
        { text: 'APIs', link: '/apis/' },
      ],
      sidebar: [
        {
          text: 'Onboarding',
          items: [
            { text: 'Visão geral', link: '/ONBOARDING' },
            { text: 'Domínios funcionais', link: '/ONBOARDING-DOMINIOS' },
            { text: 'Catálogo de repositórios', link: '/ONBOARDING-CATALOGO' },
          ],
        },
        {
          text: 'APIs',
          items: [{ text: 'Índice', link: '/apis/' }, ...apiSidebar()],
        },
      ],
      outline: { level: [2, 3], label: 'Nesta página' },
      search: { provider: 'local' },
    },
  })
)
