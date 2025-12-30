// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-01-01',
  devtools: { enabled: true },
  modules: ['@element-plus/nuxt', '@nuxtjs/tailwindcss', '@nuxt/eslint'],
  elementPlus: {
    importStyle: 'scss',
  },
  vite: {
    optimizeDeps: {
      include: ['dayjs'],
    },
  },
  css: ['~/assets/styles/main.scss'],
  // Element Plus 样式已通过 @element-plus/nuxt 模块自动导入
  app: {
    baseURL: '/raby-red/',
  },
  router: {
    options: {
      strict: false,
    },
  },
  runtimeConfig: {
    public: {
      apiBase: '/raby-red/api',
    },
  },
  typescript: {
    strict: true,
    typeCheck: true,
  },
  eslint: {
    config: {
      // 禁用 stylistic 规则，使用 Prettier 处理格式化
      stylistic: false,
    },
  },
})
