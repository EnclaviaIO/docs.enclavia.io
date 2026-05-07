import { defineConfig } from 'vitepress'
import llmstxt from 'vitepress-plugin-llms'
import fs from 'node:fs/promises'
import path from 'node:path'

const LLMS_DESCRIPTION =
  'Documentation for Enclavia — running Docker images inside attested enclaves with end-to-end encryption from the browser. Public beta.'
const LLMS_DETAILS =
  'Covers installing the `enclavia` CLI, authenticating, pushing images to the per-user registry, creating enclaves, and connecting to them with the encrypted client library.'

/**
 * vitepress-plugin-llms only emits llms.txt / llms-full.txt during the
 * Rollup `generateBundle` hook (production build). Its dev-server middleware
 * just reads from `outDir`, so on a clean dev run both URLs 404.
 *
 * This shim mirrors the plugin's output well enough for dev: it walks the
 * configured sidebar, reads each source `.md`, and serves a hand-rolled
 * version of both files. Production output is unaffected — `vitepress build`
 * still runs the upstream plugin and writes the canonical files.
 */
function llmstxtDev({ siteTitle, sidebar, description, details }) {
  return {
    name: 'enclavia:llmstxt-dev',
    apply: 'serve',
    configureServer(server) {
      const srcDir = path.resolve('.')
      const sidebarLinks = sidebar
        .flatMap((group) => (group.items || []).map((item) => ({ ...item, group: group.text })))
        .filter((item) => item.link && item.link !== '/')

      async function readSource(link) {
        const file = path.resolve(srcDir, `${link.replace(/^\//, '')}.md`)
        return fs.readFile(file, 'utf8')
      }

      async function buildLlmsTxt() {
        const lines = []
        lines.push(`# ${siteTitle}`, '')
        lines.push(`> ${description}`, '')
        lines.push(details, '')
        lines.push('## Table of Contents', '')
        const groups = new Map()
        for (const item of sidebarLinks) {
          if (!groups.has(item.group)) groups.set(item.group, [])
          groups.get(item.group).push(item)
        }
        for (const [group, items] of groups) {
          lines.push(`### ${group}`, '')
          for (const item of items) {
            lines.push(`- [${item.text}](${item.link}.md)`)
          }
          lines.push('')
        }
        return lines.join('\n')
      }

      async function buildLlmsFullTxt() {
        const parts = []
        for (const item of sidebarLinks) {
          let body
          try {
            body = await readSource(item.link)
          } catch {
            continue
          }
          parts.push(`---\nurl: ${item.link}.md\n---\n${body.trimEnd()}\n`)
        }
        return parts.join('\n')
      }

      server.middlewares.use(async (req, res, next) => {
        try {
          if (req.url === '/llms.txt' || req.url?.startsWith('/llms.txt?')) {
            const body = await buildLlmsTxt()
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end(body)
            return
          }
          if (req.url === '/llms-full.txt' || req.url?.startsWith('/llms-full.txt?')) {
            const body = await buildLlmsFullTxt()
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end(body)
            return
          }
        } catch (err) {
          server.config.logger.error(`[enclavia:llmstxt-dev] ${err.message}`)
        }
        next()
      })
    },
  }
}

const sidebar = [
  {
    text: 'Getting started',
    items: [
      { text: 'Overview', link: '/' },
      { text: 'Install the CLI', link: '/install' },
      { text: 'Authenticate', link: '/auth' },
      { text: 'Push an image', link: '/push' },
      { text: 'Create an enclave', link: '/create' },
      { text: 'Connect from a client', link: '/connect' },
    ],
  },
]

export default defineConfig({
  title: 'Enclavia Docs',
  description: 'Provable computation, as simple as pushing a Docker image.',
  cleanUrls: true,
  lang: 'en-US',
  srcExclude: ['README.md'],

  appearance: 'force-dark',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpolygon points='0,0 24,0 32,8 32,32 0,32' fill='%2322c55e'/%3E%3Ctext x='16' y='16' font-family='Georgia,serif' font-size='16' font-weight='600' fill='%230a0a0a' text-anchor='middle' dominant-baseline='central'%3EEn%3C/text%3E%3C/svg%3E" }],
    ['meta', { name: 'theme-color', content: '#0a0a0a' }],
  ],

  themeConfig: {
    siteTitle: 'Enclavia',
    logo: { src: '/mark.svg', width: 24, height: 24 },

    nav: [
      { text: 'Docs', link: '/install' },
      { text: 'enclavia.io', link: 'https://enclavia.io' },
      { text: 'GitHub', link: 'https://github.com/EnclaviaIO/enclavia-crates' },
    ],

    sidebar,

    socialLinks: [
      { icon: 'github', link: 'https://github.com/EnclaviaIO/enclavia-crates' },
    ],

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Built for AI agents too — fetch <a href="/llms.txt">/llms.txt</a> for a machine-readable index of these docs.',
      copyright: 'Enclavia · provable computation, as simple as pushing a Docker image.',
    },

    outline: { level: [2, 3] },
  },

  vite: {
    plugins: [
      llmstxt({
        description: LLMS_DESCRIPTION,
        details: LLMS_DETAILS,
      }),
      llmstxtDev({
        siteTitle: 'Enclavia',
        sidebar,
        description: LLMS_DESCRIPTION,
        details: LLMS_DETAILS,
      }),
    ],
  },
})
