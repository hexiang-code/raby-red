import { proxyServerManager } from '../../utils/services.js'

export default defineEventHandler(async () => {
  try {
    if (proxyServerManager.isRunning()) {
      return {
        success: true,
        message: '代理服务器已经在运行中',
      }
    }

    await proxyServerManager.start()
    return {
      success: true,
      message: '代理服务器已启动',
    }
  } catch (error) {
    console.error('Failed to start proxy server:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : '启动代理服务器失败',
    }
  }
})
