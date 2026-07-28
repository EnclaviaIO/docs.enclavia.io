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
 */

const ADMONITIONS = new Set(['tip', 'warning', 'danger', 'info', 'note', 'details'])

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

    if (inContainer) {
      out.push(line.trim() === '' ? '>' : `> ${line}`)
    } else {
      out.push(line)
    }
  }

  return out.join('\n')
}
