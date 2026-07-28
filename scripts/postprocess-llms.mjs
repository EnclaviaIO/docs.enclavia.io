/**
 * Post-build cleanup for the LLM-facing outputs. vitepress-plugin-llms emits
 * `llms.txt`, `llms-full.txt`, and a per-page `.md` mirror during
 * `generateBundle`, but it does not translate VitePress container syntax
 * (`::: tip`, `::: tabs`, `== Tab`), so those markers leak into files whose
 * entire purpose is clean plain-text parsing. Runs after `vitepress build`
 * (see the `build` script in package.json) and rewrites the emitted files
 * in place via cleanLlmsMarkdown.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanLlmsMarkdown, ensureIndexH1 } from './llms-transform.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(repoRoot, '.vitepress', 'dist')

if (!fs.existsSync(dist)) {
  console.error(`postprocess-llms: ${dist} does not exist, run \`vitepress build\` first`)
  process.exit(1)
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

const targets = [...walk(dist)].filter((f) => {
  const base = path.basename(f)
  return base === 'llms.txt' || base === 'llms-full.txt' || base.endsWith('.md')
})

let changed = 0
for (const file of targets) {
  const before = fs.readFileSync(file, 'utf8')
  const after = ensureIndexH1(cleanLlmsMarkdown(before))
  if (after !== before) {
    fs.writeFileSync(file, after)
    changed++
  }
}

console.log(`postprocess-llms: cleaned ${changed}/${targets.length} file(s)`)
