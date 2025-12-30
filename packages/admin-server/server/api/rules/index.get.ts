import { ruleService } from '~/server/utils/services.js'

export default defineEventHandler(event => {
  const query = getQuery(event)

  // 如果请求只获取启用的规则（供 proxy-server 使用）
  if (query.enabled === 'true') {
    const rules = ruleService.getEnabledRules()
    return {
      success: true,
      data: rules,
    }
  }

  // 默认返回所有规则
  const rules = ruleService.getAllRules()
  return {
    success: true,
    data: rules,
  }
})
