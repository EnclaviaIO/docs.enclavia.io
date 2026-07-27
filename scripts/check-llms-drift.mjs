/**
 * CI drift guard for the machine-readable index. Every page reachable from
 * the sidebar must appear in the generated `llms.txt` and `llms-full.txt`,
 * so an agent working from the index knows every page exists. This class of
 * bug (add a page to the sidebar, generator silently skips it) recurs
 * quietly, so it fails the build instead.
 *
 * Deliberate exclusions go in EXCLUDED below, so they are declared rather
 * than accidental. Run after `npm run build`:
 *
 *   node scripts/check-llms-drift.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../.vitepress/config.mjs'

// Sidebar routes intentionally absent from llms.txt, e.g. '/some-page'.
const EXCLUDED = new Set([])

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(repoRoot, '.vitepress', 'dist')

const sidebar = config?.themeConfig?.sidebar
if (!Array.isArray(sidebar) || sidebar.length === 0) {
  console.error('check-llms-drift: could not read themeConfig.sidebar from .vitepress/config.mjs')
  process.exit(1)
}

const routes = sidebar
  .flatMap((group) => group.items || [])
  .map((item) => item.link)
  .filter((link) => typeof link === 'string' && !/^https?:/.test(link))
  .filter((link) => !EXCLUDED.has(link))

// '/foo' is served to agents as '/foo.md'; the homepage as '/index.md'.
const expected = routes.map((link) => (link === '/' ? '/index.md' : `${link}.md`))

const llmsTxt = fs.readFileSync(path.join(dist, 'llms.txt'), 'utf8')
const llmsFullTxt = fs.readFileSync(path.join(dist, 'llms-full.txt'), 'utf8')

// Collect llms.txt link targets as pathnames, tolerating absolute URLs.
const indexPaths = new Set(
  [...llmsTxt.matchAll(/\]\(([^)]+)\)/g)].map((m) => {
    try {
      return new URL(m[1], 'https://docs.enclavia.io').pathname
    } catch {
      return m[1]
    }
  }),
)

const fullPaths = new Set(
  [...llmsFullTxt.matchAll(/^url:\s*['"]?([^'"\s]+)['"]?\s*$/gm)].map((m) => {
    try {
      return new URL(m[1], 'https://docs.enclavia.io').pathname
    } catch {
      return m[1]
    }
  }),
)

const missingFromIndex = expected.filter((p) => !indexPaths.has(p))
const missingFromFull = expected.filter((p) => !fullPaths.has(p))

let failed = false
if (missingFromIndex.length > 0) {
  failed = true
  console.error(
    `check-llms-drift: sidebar route(s) missing from llms.txt: ${missingFromIndex.join(', ')}\n` +
      '  Either fix the generator config in .vitepress/config.mjs, or declare the\n' +
      '  exclusion in EXCLUDED in scripts/check-llms-drift.mjs.',
  )
}
if (missingFromFull.length > 0) {
  failed = true
  console.error(
    `check-llms-drift: sidebar route(s) missing from llms-full.txt: ${missingFromFull.join(', ')}`,
  )
}

if (failed) process.exit(1)
console.log(`check-llms-drift: all ${expected.length} sidebar route(s) present in llms.txt and llms-full.txt`)
