import { ruleService } from '~/server/utils/services.js'

export default defineEventHandler(async event => {
  const body = await readBody<{ source: string; target: string; enabled?: boolean }>(event)

  if (!body.source || !body.target) {
    throw createError({
      statusCode: 400,
      message: 'source and target are required',
    })
  }

  try {
    const rule = ruleService.addRule({
      source: body.source,
      target: body.target,
      enabled: body.enabled ?? true,
    })

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
