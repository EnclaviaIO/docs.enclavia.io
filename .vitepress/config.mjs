import { defineConfig } from 'vitepress'
import llmstxt from 'vitepress-plugin-llms'

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

    sidebar: [
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
    ],

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
        description: 'Documentation for Enclavia — running Docker images inside attested enclaves with end-to-end encryption from the browser. Public beta.',
        details: 'Covers installing the `enclavia` CLI, authenticating, pushing images to the per-user registry, creating enclaves, and connecting to them with the encrypted client library.',
      }),
    ],
  },
})
