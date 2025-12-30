import type { ProxyRule } from '../types/index.js'

export interface RequestStats {
  ruleId: string
  ruleSource: string
  ruleTarget: string
  requestCount: number
  errorCount: number
  totalResponseTime: number
  minResponseTime: number
  maxResponseTime: number
  averageResponseTime: number
  statusCodeCounts: Record<number, number>
  lastRequestTime: number
  firstRequestTime: number
}

export interface GlobalStats {
  totalRequests: number
  totalErrors: number
  totalResponseTime: number
  minResponseTime: number
  maxResponseTime: number
  averageResponseTime: number
  requestsPerSecond: number
  errorsPerSecond: number
  startTime: number
  uptime: number
  ruleStats: Map<string, RequestStats>
  statusCodeCounts: Record<number, number>
}

export class StatsCollector {
  private stats: GlobalStats
  private resetInterval: number
  private resetTimer: NodeJS.Timeout | null = null

  constructor(resetInterval: number = 3600000) {
    this.resetInterval = resetInterval
    this.stats = this.createEmptyStats()
    this.startResetTimer()
  }

  /**
   * 记录请求
   */
  recordRequest(
    rule: ProxyRule | null,
    responseTime: number,
    statusCode: number,
    isError: boolean = false
  ): void {
    const now = Date.now()

    // 更新全局统计
    this.stats.totalRequests++
    this.stats.totalResponseTime += responseTime
    this.stats.minResponseTime =
      this.stats.minResponseTime === 0 || responseTime < this.stats.minResponseTime
        ? responseTime
        : this.stats.minResponseTime
    this.stats.maxResponseTime = Math.max(this.stats.maxResponseTime, responseTime)
    this.stats.averageResponseTime = this.stats.totalResponseTime / this.stats.totalRequests

    if (isError) {
      this.stats.totalErrors++
    }

    // 更新状态码统计
    this.stats.statusCodeCounts[statusCode] = (this.stats.statusCodeCounts[statusCode] || 0) + 1

    // 更新规则统计
    if (rule) {
      let ruleStat = this.stats.ruleStats.get(rule.id)
      if (!ruleStat) {
        ruleStat = {
          ruleId: rule.id,
          ruleSource: rule.source,
          ruleTarget: rule.target,
          requestCount: 0,
          errorCount: 0,
          totalResponseTime: 0,
          minResponseTime: 0,
          maxResponseTime: 0,
          averageResponseTime: 0,
          statusCodeCounts: {},
          lastRequestTime: 0,
          firstRequestTime: now,
        }
        this.stats.ruleStats.set(rule.id, ruleStat)
      }

      ruleStat.requestCount++
      ruleStat.totalResponseTime += responseTime
      ruleStat.minResponseTime =
        ruleStat.minResponseTime === 0 || responseTime < ruleStat.minResponseTime
          ? responseTime
          : ruleStat.minResponseTime
      ruleStat.maxResponseTime = Math.max(ruleStat.maxResponseTime, responseTime)
      ruleStat.averageResponseTime = ruleStat.totalResponseTime / ruleStat.requestCount
      ruleStat.statusCodeCounts[statusCode] = (ruleStat.statusCodeCounts[statusCode] || 0) + 1
      ruleStat.lastRequestTime = now

      if (isError) {
        ruleStat.errorCount++
      }
    }

    // 更新请求速率
    this.updateRates(now)
  }

  /**
   * 记录无匹配规则的请求
   */
  recordNoMatchRequest(): void {
    this.stats.totalRequests++
    this.updateRates(Date.now())
  }

  /**
   * 获取统计信息
   */
  getStats(): GlobalStats {
    const now = Date.now()
    this.stats.uptime = now - this.stats.startTime

    return {
      ...this.stats,
      ruleStats: new Map(this.stats.ruleStats), // 返回副本
    }
  }

  /**
   * 获取规则统计
   */
  getRuleStats(ruleId: string): RequestStats | null {
    return this.stats.ruleStats.get(ruleId) || null
  }

  /**
   * 重置统计
   */
  reset(): void {
    this.stats = this.createEmptyStats()
    this.startResetTimer()
  }

  /**
   * 创建空的统计对象
   */
  private createEmptyStats(): GlobalStats {
    return {
      totalRequests: 0,
      totalErrors: 0,
      totalResponseTime: 0,
      minResponseTime: 0,
      maxResponseTime: 0,
      averageResponseTime: 0,
      requestsPerSecond: 0,
      errorsPerSecond: 0,
      startTime: Date.now(),
      uptime: 0,
      ruleStats: new Map(),
      statusCodeCounts: {},
    }
  }

  /**
   * 更新请求速率
   */
  private updateRates(now: number): void {
    const uptime = (now - this.stats.startTime) / 1000 // 秒
    if (uptime > 0) {
      this.stats.requestsPerSecond = this.stats.totalRequests / uptime
      this.stats.errorsPerSecond = this.stats.totalErrors / uptime
    }
  }

  /**
   * 启动重置定时器
   */
  private startResetTimer(): void {
    if (this.resetTimer) {
      clearInterval(this.resetTimer)
    }

    if (this.resetInterval > 0) {
      this.resetTimer = setInterval(() => {
        this.reset()
      }, this.resetInterval)
    }
  }

  /**
   * 停止统计收集器
   */
  stop(): void {
    if (this.resetTimer) {
      clearInterval(this.resetTimer)
      this.resetTimer = null
    }
  }
}
