import { systemProxyManager } from '~/server/utils/services.js'

export default defineEventHandler(async event => {
  const body = await readBody<{ host: string; port: number }>(event)

  if (!body.host || !body.port) {
    throw createError({
      statusCode: 400,
      message: 'host and port are required',
    })
  }

  await systemProxyManager.setProxy(body.host, body.port)
  const status = await systemProxyManager.getProxyStatus()

  return {
    success: true,
    data: status,
  }
})
