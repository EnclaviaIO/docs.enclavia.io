<template>
  <aside class="llms-notice">
    Reading this as an AI agent? Fetch <a href="/llms.txt">/llms.txt</a> for a
    machine-readable index of these docs, or
    <a href="/llms-full.txt">/llms-full.txt</a> for every page in one file.
  </aside>
</template>

<style scoped>
.llms-notice {
  margin: 0 0 24px;
  padding: 8px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

.llms-notice a {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
