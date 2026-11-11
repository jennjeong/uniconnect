import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

import siteConfiguration from './site.config.json'
import { sitemapXml } from './src/lib/sitemap'
import { gaInitScript } from './src/lib/gaInit'


// Vite 설정 — https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // `--mode development`는 소스맵을 포함해 빌드를 읽기 쉽게 둔다.
  const emitSourcemaps = mode === 'development'
  // 개발 중에는 /api 호출을 Express 백엔드(backend/)로 넘긴다.
  const apiProxy = { '/api': `http://localhost:${process.env.API_PORT || '4000'}` }

  return {
    base: '/',
    build: {
      sourcemap: emitSourcemaps ? 'inline' : false,
      minify: !emitSourcemaps,
      // three.js(크롬 체인과 링, 로그인 그라디언트)는 지연 로딩되어 별도 청크로
      // 나뉘며 최대 약 0.7MB다.
      chunkSizeWarningLimit: 800,
    },
    plugins: [
      react(),
      tailwindcss(),
      siteDocument(siteConfiguration),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
      strictPort: true,
      proxy: apiProxy,
    },
    preview: {
      host: '0.0.0.0',
      port: parseInt(process.env.PORT || '8443'),
      proxy: apiProxy,
    },
  }
})

type SiteConfiguration = {
  title?: string
  description?: string
  language?: string
  // 사이트맵 링크에 쓰는 사이트의 공개 주소.
  url?: string
  robots?: {
    index?: boolean
  }
  // /sitemap.xml에 싣는 공개 페이지 (lib/sitemap.test.ts가 검사한다).
  sitemap?: string[]
  // Google Search Console과 Naver Search Advisor의 사이트 소유 확인 코드. 값이
  // 있으면 각 페이지의 head에 쓴다.
  verification?: {
    google?: string
    naver?: string
  }
  icons?: {
    icon?: string
  }
  openGraph?: {
    image?: string
  }
  analytics?: {
    googleAnalyticsId?: string
  }
  customScripts?: {
    headStart?: string
    headEnd?: string
    bodyStart?: string
    bodyEnd?: string
  }
}

/** site.config.json을 index.html과 그 옆에서 서빙하는 파일에 적용한다. */
function siteDocument(config: SiteConfiguration): Plugin {
  function sanitizeHtmlValue(value: string | undefined): string {
    return value?.replace(/[^a-zA-Z0-9_-]/g, '') || ''
  }
  function escapeHtmlText(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }
  function replaceHtmlCommentSlot(html: string, slotName: string, content: string): string {
    return html.replace(`<!-- ${slotName} -->`, content)
  }

  const title = config.title ?? "uniconnect"
  const description = config.description ?? ''
  const favicon = config.icons?.icon ?? '/favicon.svg'
  const socialImage = config.openGraph?.image ?? ''
  const language = sanitizeHtmlValue(config.language) || 'en'
  const googleAnalyticsId = sanitizeHtmlValue(config.analytics?.googleAnalyticsId)
  const headStart = config.customScripts?.headStart ?? ''
  const headEnd = config.customScripts?.headEnd ?? ''
  const bodyStart = config.customScripts?.bodyStart ?? ''
  const bodyEnd = config.customScripts?.bodyEnd ?? ''
  const robotsTxt = config.robots?.index === false ? 'User-agent: *\nDisallow: /\n' : ''
  // 사이트 전체가 검색에서 빠져 있는 동안은 싣지 않는다.
  const sitemap =
    config.url && config.sitemap?.length && config.robots?.index !== false ? sitemapXml(config.url, config.sitemap) : ''
  const verification = {
    'google-site-verification': sanitizeHtmlValue(config.verification?.google),
    'naver-site-verification': sanitizeHtmlValue(config.verification?.naver),
  }
  const gaInit = googleAnalyticsId ? gaInitScript(googleAnalyticsId) : ''

  return {
    name: 'site-document',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!robotsTxt || req.url?.split('?')[0] !== '/robots.txt') return next()

        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end(robotsTxt)
      })
      server.middlewares.use((req, res, next) => {
        if (!sitemap || req.url?.split('?')[0] !== '/sitemap.xml') return next()

        res.setHeader('Content-Type', 'application/xml; charset=utf-8')
        res.end(sitemap)
      })
      server.middlewares.use((req, res, next) => {
        if (!gaInit || req.url?.split('?')[0] !== '/ga-init.js') return next()

        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.end(gaInit)
      })
    },
    generateBundle() {
      if (robotsTxt) {
        this.emitFile({
          type: 'asset',
          fileName: 'robots.txt',
          source: robotsTxt,
        })
      }
      if (gaInit) {
        this.emitFile({
          type: 'asset',
          fileName: 'ga-init.js',
          source: gaInit,
        })
      }
      if (sitemap) {
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: sitemap,
        })
      }
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        let result = html
        result = replaceHtmlCommentSlot(result, 'site:lang', language)
        result = replaceHtmlCommentSlot(result, 'site:title', escapeHtmlText(title))
        result = replaceHtmlCommentSlot(result, 'site:head-start', headStart)
        result = replaceHtmlCommentSlot(result, 'site:head-end', headEnd)
        result = replaceHtmlCommentSlot(result, 'site:body-start', bodyStart)
        result = replaceHtmlCommentSlot(result, 'site:body-end', bodyEnd)

        const tags: HtmlTagDescriptor[] = []
        if (description) {
          tags.push({ tag: 'meta', attrs: { name: 'description', content: description }, injectTo: 'head' })
        }
        if (config.robots?.index === false) {
          tags.push({ tag: 'meta', attrs: { name: 'robots', content: 'noindex, nofollow' }, injectTo: 'head' })
        }
        for (const [name, content] of Object.entries(verification)) {
          if (content) tags.push({ tag: 'meta', attrs: { name, content }, injectTo: 'head' })
        }
        if (favicon) {
          tags.push({ tag: 'link', attrs: { rel: 'icon', href: favicon }, injectTo: 'head' })
        }
        if (title) {
          tags.push({ tag: 'meta', attrs: { property: 'og:title', content: title }, injectTo: 'head' })
        }
        if (description) {
          tags.push({ tag: 'meta', attrs: { property: 'og:description', content: description }, injectTo: 'head' })
        }
        if (socialImage) {
          tags.push(
            { tag: 'meta', attrs: { property: 'og:image', content: socialImage }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'twitter:card', content: 'summary_large_image' }, injectTo: 'head' },
            { tag: 'meta', attrs: { name: 'twitter:image', content: socialImage }, injectTo: 'head' },
          )
        }

        if (googleAnalyticsId) {
          tags.push({
            tag: 'script',
            attrs: { src: '/ga-init.js', defer: true },
            injectTo: 'head',
          })
        }

        return {
          html: result,
          tags,
        }
      },
    },
  }
}
