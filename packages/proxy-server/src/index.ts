import { ProxyServer } from './services/proxy-server.js'
import { config } from './utils/config.js'
import { logger } from './utils/logger.js'

async function main(): Promise<void> {
  const proxyServer = new ProxyServer(config.adminServerUrl, config.proxyPort, config.proxyHost)

  // 启动代理服务器
  await proxyServer.start()

  logger.info('Proxy server initialized', {
    adminServerUrl: config.adminServerUrl,
    proxyHost: config.proxyHost,
    proxyPort: config.proxyPort,
  })

  // 优雅关闭
  process.on('SIGINT', () => {
    void (async (): Promise<void> => {
      logger.info('Received SIGINT, shutting down...')
      await proxyServer.stop()
      process.exit(0)
    })()
  })

  process.on('SIGTERM', () => {
    void (async (): Promise<void> => {
      logger.info('Received SIGTERM, shutting down...')
      await proxyServer.stop()
      process.exit(0)
    })()
  })
}

main().catch(error => {
  logger.error('Failed to start proxy server', {
    error: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
  })
  process.exit(1)
})
