// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'
import prettierConfig from 'eslint-config-prettier'
import prettierPlugin from 'eslint-plugin-prettier'

export default withNuxt(
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      // Nuxt 的 typeCheck: true 已经启用了基础类型检查规则
      // 如果需要更严格的类型检查，可以通过 tsconfig.json 的 strict 模式实现
      // 允许 Prettier 处理箭头函数括号（arrowParens: "avoid"）
      '@stylistic/arrow-parens': 'off',
    },
  },
  {
    ignores: ['eslint.config.mjs', 'nuxt.config.ts'],
  }
)
