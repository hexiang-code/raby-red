import http from 'http'
import net from 'net'
import httpProxy from 'http-proxy'
import type { IncomingMessage, ServerResponse } from 'http'
import type { ProxyRule, ProxyServerStatus, RuleMatchResult } from '../types/index.js'
import { RuleClient } from './rule-client.js'
import { logger } from '../utils/logger.js'
import { StatsCollector } from '../utils/stats.js'
import { config } from '../utils/config.js'

interface RequestContext {
  startTime: number
  hostname: string
  port: number
  url: string
  method: string
  originalUrl: string
}

export class ProxyServer {
  private server: http.Server | null = null
  private proxy: httpProxy
  private ruleClient: RuleClient
  private status: ProxyServerStatus
  private statsCollector: StatsCollector

  constructor(adminServerUrl: string, port = 8080, host = '127.0.0.1') {
    this.ruleClient = new RuleClient(adminServerUrl)
    this.proxy = httpProxy.createProxyServer({
      xfwd: true,
      changeOrigin: true,
    })

    this.statsCollector = new StatsCollector(config.statsResetInterval)

    this.status = {
      running: false,
      port,
      host,
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

    this.setupProxyErrorHandlers()
  }

  /**
   * 启动代理服务器
   */
  async start(): Promise<void> {
    if (this.server) {
      throw new Error('Proxy server is already running')
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleHttpRequest(req, res).catch(error => {
          logger.error('Unhandled error in HTTP request', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          })
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain' })
            res.end('Internal Server Error')
          }
        })
      })

      // 监听 CONNECT 事件（HTTPS 请求）
      this.server.on('connect', (req, socket, head) => {
        this.handleConnectRequest(req, socket as net.Socket, head).catch(error => {
          logger.error('Unhandled error in CONNECT request', {
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
          })
          ;(socket as net.Socket).end()
        })
      })

      this.server.listen(this.status.port, this.status.host, () => {
        this.status.running = true
        this.status.startTime = Date.now()
        logger.info('Proxy server started', {
          host: this.status.host,
          port: this.status.port,
        })
        resolve()
      })

      this.server.on('error', (error: Error) => {
        this.status.running = false
        logger.error('Failed to start proxy server', { error: error.message })
        reject(error)
      })
    })
  }

  /**
   * 停止代理服务器
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return
    }

    return new Promise((resolve, reject) => {
      this.server?.close(error => {
        if (error) {
          logger.error('Error stopping proxy server', { error: error.message })
          reject(error)
        } else {
          this.server = null
          this.status.running = false
          this.statsCollector.stop()
          logger.info('Proxy server stopped')

          // 尝试关闭系统代理
          void this.disableSystemProxy().catch(err => {
            logger.warn('Failed to disable system proxy', {
              error: err instanceof Error ? err.message : 'Unknown error',
            })
          })

          resolve()
        }
      })
    })
  }

  /**
   * 关闭系统代理
   */
  private async disableSystemProxy(): Promise<void> {
    try {
      const adminServerUrl = this.ruleClient['adminServerUrl']
      const response = await fetch(`${adminServerUrl}/api/system-proxy/disable`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to disable system proxy: ${response.statusText}`)
      }

      const result = (await response.json()) as { success: boolean }
      if (result.success) {
        logger.info('System proxy disabled successfully')
      }
    } catch (error) {
      logger.warn('Failed to disable system proxy via admin server', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * 获取服务器状态
   */
  getStatus(): ProxyServerStatus {
    const stats = this.statsCollector.getStats()
    const now = Date.now()

    return {
      ...this.status,
      requestCount: stats.totalRequests,
      errorCount: stats.totalErrors,
      totalResponseTime: stats.totalResponseTime,
      minResponseTime: stats.minResponseTime,
      maxResponseTime: stats.maxResponseTime,
      averageResponseTime: stats.averageResponseTime,
      requestsPerSecond: stats.requestsPerSecond,
      errorsPerSecond: stats.errorsPerSecond,
      uptime: now - this.status.startTime,
      statusCodeCounts: { ...stats.statusCodeCounts },
      ruleStats: Array.from(stats.ruleStats.values()),
    }
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // 处理管理端点
    if (req.url === '/_proxy/stats' && req.method === 'GET') {
      this.handleStatsRequest(res)
      return
    }

    const ctx = this.createRequestContext(req)
    const matchResult = await this.ruleClient.matchRule(ctx.hostname, ctx.url, ctx.port)

    if (matchResult) {
      // 类型保护：确保 matchResult 是 RuleMatchResult
      const result: RuleMatchResult = matchResult
      this.proxyToTarget(req, res, result, ctx)
    } else {
      this.passthroughRequest(req, res, ctx)
    }
  }

  /**
   * 处理 CONNECT 请求（HTTPS）
   */
  private async handleConnectRequest(
    req: IncomingMessage,
    socket: net.Socket,
    head: Buffer
  ): Promise<void> {
    const target = req.url || ''
    const [hostname, portStr] = target.split(':')
    const port = parseInt(portStr || '443', 10)

    logger.debug('CONNECT request', {
      target,
      hostname,
      port,
    })

    // 匹配规则
    const matchResult = await this.ruleClient.matchRule(hostname, '', port)

    let targetHost: string
    let targetPort: number

    if (
      matchResult &&
      'rule' in matchResult &&
      'matches' in matchResult &&
      'priority' in matchResult
    ) {
      // 类型保护：确保 matchResult 是 RuleMatchResult
      const result: RuleMatchResult = matchResult
      // 应用规则：解析目标 URL
      try {
        const rule = result.rule
        const matches = result.matches
        const targetUrlStr = this.ruleClient.applyCaptures(rule.target, matches)
        const targetUrl = new URL(targetUrlStr)
        targetHost = targetUrl.hostname
        targetPort = parseInt(targetUrl.port || '443', 10)
        logger.debug('CONNECT matched rule', {
          ruleId: rule.id,
          originalTarget: target,
          proxyTarget: `${targetHost}:${targetPort}`,
        })
      } catch (error) {
        const rule = result.rule
        logger.warn('Failed to parse target URL from rule, using original target', {
          ruleId: rule.id,
          target: rule.target,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        targetHost = hostname
        targetPort = port
      }
    } else {
      // 透传：使用原始目标
      targetHost = hostname
      targetPort = port
      // 不记录透传的 CONNECT 请求
    }

    // 建立 TCP 连接
    const proxySocket = net.createConnection(targetPort, targetHost, () => {
      // 连接成功，发送 200 Connection Established
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n')

      // 开始转发数据
      proxySocket.write(head)
      proxySocket.pipe(socket)
      socket.pipe(proxySocket)

      // 只记录匹配规则的 CONNECT 隧道建立
      if (matchResult) {
        logger.debug('CONNECT tunnel established', {
          target: `${targetHost}:${targetPort}`,
          ruleId: matchResult.rule.id,
        })
      }
    })

    proxySocket.on('error', error => {
      // 只记录匹配规则的请求错误
      if (matchResult) {
        logger.error('CONNECT proxy socket error', {
          target: `${targetHost}:${targetPort}`,
          ruleId: matchResult.rule.id,
          error: error.message,
        })
      }
      socket.end()
    })

    socket.on('error', error => {
      // 只记录匹配规则的请求错误
      if (matchResult) {
        logger.error('CONNECT client socket error', {
          target: `${targetHost}:${targetPort}`,
          ruleId: matchResult.rule.id,
          error: error.message,
        })
      }
      proxySocket.end()
    })

    socket.on('close', () => {
      proxySocket.end()
    })

    proxySocket.on('close', () => {
      socket.end()
    })
  }

  /**
   * 代理到目标服务器
   */
  private proxyToTarget(
    req: IncomingMessage,
    res: ServerResponse,
    matchResult: RuleMatchResult,
    ctx: RequestContext
  ): void {
    try {
      // 明确类型，避免 TypeScript 的 unsafe 警告
      const rule: ProxyRule = matchResult.rule
      const matches: RegExpMatchArray | null = matchResult.matches
      const targetUrlStr = this.ruleClient.applyCaptures(rule.target, matches)
      const targetUrl = new URL(targetUrlStr)
      const targetBase = `${targetUrl.protocol}//${targetUrl.host}`

      // 重写路径
      const rewrittenPath = this.rewritePath(
        req.url || '',
        rule.source,
        targetUrl.pathname,
        matches
      )
      const originalUrl = req.url
      req.url =
        rewrittenPath + (req.url?.includes('?') ? req.url.substring(req.url.indexOf('?')) : '')

      const finalTargetUrl = `${targetUrl.protocol}//${targetUrl.host}${rewrittenPath}`

      logger.debug('Proxying request', {
        method: ctx.method,
        originalUrl,
        hostname: ctx.hostname,
        targetUrl: finalTargetUrl,
        ruleId: rule.id,
      })

      const responseStartTime = Date.now()

      // 监听响应完成
      res.once('finish', () => {
        const responseTime = Date.now() - responseStartTime
        const statusCode = res.statusCode || 0
        const isError = statusCode >= 400

        if (config.statsEnabled) {
          this.statsCollector.recordRequest(rule, responseTime, statusCode, isError)
        }

        const logLevel = isError ? 'warn' : 'info'
        logger[logLevel]('Request completed', {
          method: ctx.method,
          originalUrl,
          hostname: ctx.hostname,
          targetUrl: finalTargetUrl,
          ruleId: rule.id,
          statusCode,
          responseTime,
        })
      })

      this.proxy.web(req, res, {
        target: targetBase,
        changeOrigin: true,
      })
    } catch (error) {
      const rule = matchResult.rule
      logger.error('Failed to proxy request', {
        method: ctx.method,
        url: ctx.url,
        hostname: ctx.hostname,
        ruleId: rule.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })

      if (config.statsEnabled) {
        const responseTime = Date.now() - ctx.startTime
        this.statsCollector.recordRequest(rule, responseTime, 500, true)
      }

      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' })
        res.end('Proxy error: ' + (error instanceof Error ? error.message : 'Unknown error'))
      }
    }
  }

  /**
   * 透传请求到原始目标
   */
  private passthroughRequest(req: IncomingMessage, res: ServerResponse, ctx: RequestContext): void {
    // 不记录透传请求的日志

    if (config.statsEnabled) {
      this.statsCollector.recordNoMatchRequest()
    }

    // 构建原始目标 URL
    const protocol = ctx.port === 443 ? 'https' : 'http'
    const targetBase = `${protocol}://${ctx.hostname}${ctx.port !== 80 && ctx.port !== 443 ? `:${ctx.port}` : ''}`

    const responseStartTime = Date.now()

    res.once('finish', () => {
      const responseTime = Date.now() - responseStartTime
      const statusCode = res.statusCode || 0
      // 不记录透传请求完成的日志
      if (config.statsEnabled) {
        this.statsCollector.recordRequest(null, responseTime, statusCode, statusCode >= 400)
      }
    })

    this.proxy.web(req, res, {
      target: targetBase,
      changeOrigin: true,
    })
  }

  /**
   * 创建请求上下文
   */
  private createRequestContext(req: IncomingMessage): RequestContext {
    const hostHeader = req.headers.host || ''
    const [hostname, portStr] = hostHeader.split(':')
    const port = portStr ? parseInt(portStr, 10) : 80
    const url = req.url || ''
    const method = req.method || 'GET'

    return {
      startTime: Date.now(),
      hostname,
      port,
      url,
      method,
      originalUrl: url,
    }
  }

  /**
   * 重写路径
   */
  private rewritePath(
    requestPath: string,
    sourcePattern: string,
    targetPath: string,
    matches: RegExpMatchArray | null
  ): string {
    // 移除查询参数
    const pathOnly = requestPath.split('?')[0]

    // 如果源模式是正则表达式且有捕获组，使用捕获组替换
    if (matches && matches.length > 1) {
      // 应用捕获组到目标路径
      let rewritten = targetPath
      for (let i = 1; i < matches.length; i++) {
        const placeholder = `$${i}`
        const value = matches[i] || ''
        rewritten = rewritten.replace(new RegExp(placeholder.replace(/\$/g, '\\$'), 'g'), value)
      }
      return rewritten
    }

    // 否则，使用路径前缀替换
    try {
      const sourceUrl = new URL(
        sourcePattern.startsWith('http') ? sourcePattern : `http://${sourcePattern}`
      )
      const sourcePath = sourceUrl.pathname || '/'

      if (sourcePath !== '/' && pathOnly.startsWith(sourcePath)) {
        const remainingPath = pathOnly.substring(sourcePath.length)
        const normalizedRemaining = remainingPath.startsWith('/')
          ? remainingPath
          : '/' + remainingPath
        return (targetPath.replace(/\/$/, '') || '') + normalizedRemaining
      }
    } catch {
      // 如果解析失败，直接返回目标路径
    }

    return targetPath.replace(/\/$/, '') + pathOnly
  }

  /**
   * 处理统计信息请求
   */
  private handleStatsRequest(res: ServerResponse): void {
    const status = this.getStatus()
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    })
    res.end(JSON.stringify({ success: true, data: status }))
  }

  /**
   * 设置代理错误处理器
   */
  private setupProxyErrorHandlers(): void {
    // @ts-expect-error - http-proxy 类型定义不完整
    this.proxy.on('error', (error: Error, req: IncomingMessage, res: ServerResponse): void => {
      const responseTime = Date.now()
      const statusCode = 500

      if (config.statsEnabled) {
        this.statsCollector.recordRequest(null, responseTime, statusCode, true)
      }

      logger.error('Proxy error', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
      })

      if (!res.headersSent) {
        res.writeHead(500, {
          'Content-Type': 'text/plain',
        })
        res.end('Proxy error: ' + error.message)
      }
    })

    // 移除 proxyReq 和 proxyRes 的 debug 日志，减少日志噪音
    // 匹配规则的请求会在 proxyToTarget 方法中记录详细日志
  }
}
