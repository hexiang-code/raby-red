import { proxyServerManager } from '../../utils/services.js'

export default defineEventHandler(async () => {
  try {
    if (!proxyServerManager.isRunning()) {
      return {
        success: true,
        message: '代理服务器未运行',
      }
    }

    await proxyServerManager.stop()
    return {
      success: true,
      message: '代理服务器已停止',
    }
  } catch (error) {
    console.error('Failed to stop proxy server:', error)
    return {
      success: false,
      message: error instanceof Error ? error.message : '停止代理服务器失败',
    }
  }
})
