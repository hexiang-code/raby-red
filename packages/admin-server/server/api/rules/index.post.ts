import { ruleService } from '~/server/utils/services.js'
import type { ProxyRule } from '~/server/utils/types.js'

export default defineEventHandler(async event => {
  const body = await readBody<{
    source?: string
    target?: string
    enabled?: boolean
    name?: string
    type?: 'rule' | 'group'
    parentId?: string
  }>(event)

  const ruleType = body.type || 'rule'

  // 验证规则数据
  if (ruleType === 'group') {
    if (!body.name) {
      throw createError({
        statusCode: 400,
        message: 'name is required for group',
      })
    }
  } else {
    if (!body.source || !body.target) {
      throw createError({
        statusCode: 400,
        message: 'source and target are required for rule',
      })
    }
  }

  try {
    const ruleData: Omit<ProxyRule, 'id' | 'createdAt' | 'updatedAt'> = {
      type: ruleType,
      enabled: body.enabled ?? true,
    }

    if (ruleType === 'group') {
      ruleData.name = body.name
    } else {
      ruleData.source = body.source!
      ruleData.target = body.target!
    }

    if (body.parentId) {
      ruleData.parentId = body.parentId
    }

    const rule = await ruleService.addRule(ruleData)

    return {
      success: true,
      data: rule,
    }
  } catch (error) {
    throw createError({
      statusCode: 400,
      message: error instanceof Error ? error.message : '规则验证失败',
    })
  }
})
