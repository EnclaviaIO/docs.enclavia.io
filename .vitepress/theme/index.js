import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'
import LlmsNotice from './LlmsNotice.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  // The footer already points agents at /llms.txt, but the default theme
  // hides the footer on every page with a sidebar, i.e. every docs page.
  // This slot emits the pointer at the top of each doc page, SSR-rendered
  // so agents fetching the raw HTML see it. It is CSS-hidden from human
  // readers (see LlmsNotice.vue): present in the page source, not on the
  // rendered page.
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'doc-before': () => h(LlmsNotice),
    })
  },
  enhanceApp({ app }) {
    enhanceAppWithTabs(app)
  },
}
