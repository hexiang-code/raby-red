import { systemProxyManager } from '~/server/utils/services.js'

export default defineEventHandler(async () => {
  await systemProxyManager.unsetProxy()
  return {
    success: true,
    data: null,
  }
})
