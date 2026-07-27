<template>
  <aside class="llms-notice">
    Reading this as an AI agent? Fetch <a href="/llms.txt">/llms.txt</a> for a
    machine-readable index of these docs, or
    <a href="/llms-full.txt">/llms-full.txt</a> for every page in one file.
  </aside>
</template>

<style scoped>
/* Hidden from human readers on purpose. The notice only exists for AI
   agents that fetch the raw HTML (it is SSR-rendered, so the text is in
   the page source regardless of display), pointing them at /llms.txt.
   `display: none` keeps it in the served HTML while removing it from the
   rendered page, so human visitors don't see a banner on every page. The
   human-facing pointer lives in the footer. */
.llms-notice {
  display: none;
}
</style>
