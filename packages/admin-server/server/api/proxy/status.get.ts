import type { ProxyStatus } from '../../utils/types.js'
import { proxyServerManager } from '../../utils/services.js'
import net from 'net'

const PROXY_PORT = parseInt(process.env.PROXY_PORT || '8080', 10)
const PROXY_HOST = process.env.PROXY_HOST || '127.0.0.1'

/**
 * 检查端口是否在监听
 */
async function checkPort(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = new net.Socket()

    socket.setTimeout(1000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.once('error', () => {
      resolve(false)
    })

    socket.connect(port, host)
  })
}

/**
 * 从 proxy-server 获取统计信息
 */
async function fetchStatsFromProxyServer(): Promise<ProxyStatus | null> {
  try {
    const response = await fetch(`http://${PROXY_HOST}:${PROXY_PORT}/_proxy/stats`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) {
      return null
    }
    const result = (await response.json()) as { success: boolean; data?: ProxyStatus }
    return result.success && result.data ? result.data : null
  } catch {
    return null
  }
}

export default defineEventHandler(
  async (): Promise<{
    success: boolean
    data?: ProxyStatus
  }> => {
    // 检查进程是否运行
    const processRunning = proxyServerManager.isRunning()
    // 检查端口是否在监听（双重检查）
    const portListening = await checkPort(PROXY_HOST, PROXY_PORT)
    const running = processRunning || portListening

    // 尝试从 proxy-server 获取详细统计信息
    const stats = await fetchStatsFromProxyServer()

    const status: ProxyStatus = stats || {
      running,
      port: PROXY_PORT,
      host: PROXY_HOST,
      requestCount: 0,
      errorCount: 0,
      totalResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      averageResponseTime: 0,
      requestsPerSecond: 0,
      errorsPerSecond: 0,
      uptime: 0,
      startTime: Date.now(),
      statusCodeCounts: {},
      ruleStats: [],
    }

    // 如果无法获取统计信息，至少设置基本状态
    if (!stats) {
      status.running = running
    }

    return {
      success: true,
      data: status,
    }
  }
)
