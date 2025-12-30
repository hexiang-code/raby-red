import { ruleService } from '~/server/utils/services.js'

export default defineEventHandler(async event => {
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'id is required',
    })
  }

  const deleted = ruleService.deleteRule(id)

  if (!deleted) {
    throw createError({
      statusCode: 404,
      message: 'Rule not found',
    })
  }

  return {
    success: true,
  }
})
