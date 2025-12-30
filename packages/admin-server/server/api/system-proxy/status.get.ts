import { systemProxyManager } from '~/server/utils/services.js'

export default defineEventHandler(async () => {
  const status = await systemProxyManager.getProxyStatus()
  return {
    success: true,
    data: status,
  }
})
