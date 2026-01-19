import { ruleService } from '~/server/utils/services.js'
import type { ProxyRule } from '~/server/utils/types.js'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')
  const body = await readBody<Partial<Omit<ProxyRule, 'id' | 'createdAt'>>>(event)

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'id is required',
    })
  }

  try {
    const rule = await ruleService.updateRule(id, body)

    if (!rule) {
      throw createError({
        statusCode: 404,
        message: 'Rule not found',
      })
    }

    return {
      success: true,
      data: rule,
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) {
      throw error
    }
    throw createError({
      statusCode: 400,
      message: error instanceof Error ? error.message : '规则验证失败',
    })
  }
})
