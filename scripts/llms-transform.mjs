/**
 * Rewrites VitePress-only syntax into plain markdown for the LLM-facing
 * outputs (`llms.txt`, `llms-full.txt`, per-page `.md`). Two constructs leak
 * from the source pages into the generated plain text:
 *
 * - `::: tip|warning|danger|info|note|details [Title]` containers, which
 *   become blockquotes with a bold lead (`> **Warning: Title**`), preserving
 *   the admonition semantics in plain markdown.
 * - `::: tabs` blocks (vitepress-plugin-tabs), whose `== Label` separators
 *   (sometimes escaped as `\== Label` in generated output) become `###`
 *   subheadings; tabs are a visual affordance with no meaning in linear text.
 *
 * Lines inside code fences are left untouched (apart from the `> ` prefix
 * when the fence sits inside an admonition, which is valid markdown).
 *
 * It also rewrites root-relative in-body links (`](/connect)`) to absolute
 * `.md` links (`](https://docs.enclavia.io/connect.md)`): agents reading the
 * markdown corpus should stay in the corpus when they follow a link, and
 * fetchers that allowlist absolute URLs can't resolve relative ones.
 */

export const DOCS_DOMAIN = 'https://docs.enclavia.io'

const ADMONITIONS = new Set(['tip', 'warning', 'danger', 'info', 'note', 'details'])

function absolutizeLinks(line) {
  return line.replace(/\]\((\/[^)\s]*)\)/g, (_, target) => {
    const [pathPart, ...hashParts] = target.split('#')
    const hash = hashParts.length ? `#${hashParts.join('#')}` : ''
    let p = pathPart === '/' ? '/index.md' : pathPart
    // '/connect' is a page (served to agents as '/connect.md'); '/llms.txt'
    // or '/mark.svg' already name a file and only need the domain prefix.
    if (!/\.[a-z0-9]+$/i.test(p)) p = `${p}.md`
    return `](${DOCS_DOMAIN}${p}${hash})`
  })
}

export function cleanLlmsMarkdown(text) {
  const out = []
  let inFence = false
  let inContainer = false
  let inTabs = false

  for (const line of text.split('\n')) {
    if (!inFence) {
      const open = line.match(/^:{3,}\s*([\w-]+)?\s*(.*?)\s*$/)
      if (open) {
        const kind = (open[1] || '').toLowerCase()
        if (kind === 'tabs') {
          inTabs = true
          continue
        }
        if (ADMONITIONS.has(kind)) {
          inContainer = true
          const label = kind[0].toUpperCase() + kind.slice(1)
          out.push(open[2] ? `> **${label}: ${open[2]}**` : `> **${label}**`)
          out.push('>')
          continue
        }
        if (!kind) {
          // bare ::: closes whichever block is open
          if (inContainer) {
            inContainer = false
            continue
          }
          if (inTabs) {
            inTabs = false
            continue
          }
        }
      }
      if (inTabs) {
        const tab = line.match(/^\\?==\s+(.*?)\s*$/)
        if (tab) {
          out.push(`### ${tab[1]}`)
          continue
        }
      }
    }

    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence

    const cleaned = inFence ? line : absolutizeLinks(line)
    if (inContainer) {
      out.push(cleaned.trim() === '' ? '>' : `> ${cleaned}`)
    } else {
      out.push(cleaned)
    }
  }

  return out.join('\n')
}

/**
 * The homepage source has no H1 (the VitePress hero supplies the visual
 * title), so its markdown mirror opens at `## What is Enclavia` while every
 * other page opens with an H1 — annoying for anything chunking on heading
 * level. If the text starts with a frontmatter block whose `url` points at
 * `/index.md` (true for both the standalone mirror and the first section of
 * `llms-full.txt`) and no H1 follows, insert one.
 */
export function ensureIndexH1(text, title = 'Overview') {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/)
  if (!m) return text
  if (!/^url:.*\/index\.md['"]?\s*$/m.test(m[1])) return text
  const rest = text.slice(m[0].length)
  if (/^\s*# /.test(rest)) return text
  return `${m[0]}# ${title}\n\n${rest.replace(/^\n+/, '')}`
}
