import type { ProxyRule, RuleMatchResult } from '../types/index.js'
import { RegexMatcher } from '../utils/regex-matcher.js'
import { logger } from '../utils/logger.js'

export class RuleClient {
  private adminServerUrl: string
  private cache: ProxyRule[] = []
  private cacheTimeout: number = 5000 // 5秒缓存
  private lastFetchTime: number = 0
  private regexMatcher: RegexMatcher

  constructor(adminServerUrl: string = 'http://127.0.0.1:3000') {
    this.adminServerUrl = adminServerUrl.replace(/\/$/, '')
    this.regexMatcher = new RegexMatcher()
  }

  /**
   * 获取所有启用的规则
   */
  async getEnabledRules(): Promise<ProxyRule[]> {
    const now = Date.now()

    // 如果缓存未过期，直接返回缓存
    if (now - this.lastFetchTime < this.cacheTimeout && this.cache.length > 0) {
      return this.cache
    }

    try {
      // 只获取启用的规则
      const response = await fetch(`${this.adminServerUrl}/api/rules?enabled=true`)
      if (!response.ok) {
        throw new Error(`Failed to fetch rules: ${response.statusText}`)
      }

      const result = (await response.json()) as {
        success: boolean
        data?: ProxyRule[]
      }
      if (result.success && Array.isArray(result.data)) {
        this.cache = result.data
        this.lastFetchTime = now
        // 清除旧的编译缓存，重新编译新规则
        this.regexMatcher.clearCache()
        return this.cache
      }

      return []
    } catch (error) {
      logger.error('Failed to fetch rules from admin server', {
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      // 如果获取失败，返回缓存（如果有）
      return this.cache
    }
  }

  /**
   * 匹配规则（使用正则表达式）
   */
  async matchRule(hostname: string, url: string, port?: number): Promise<RuleMatchResult | null> {
    const rules = await this.getEnabledRules()

    if (rules.length === 0) {
      return null
    }

    // 构建完整的 URL 用于匹配
    // 格式：http://hostname:port/path
    const portStr = port ? `:${port}` : ''
    const fullUrl = `http://${hostname}${portStr}${url}`

    // 也尝试只匹配 hostname:port
    const hostPort = `${hostname}${portStr}`

    // 匹配规则
    const urlMatches: RuleMatchResult[] = this.regexMatcher.matchRules(rules, fullUrl)
    const hostMatches: RuleMatchResult[] = this.regexMatcher.matchRules(rules, hostPort)

    // 合并结果，URL 匹配优先级更高
    const allMatches: RuleMatchResult[] = [...urlMatches, ...hostMatches]

    if (allMatches.length === 0) {
      return null
    }

    // 返回优先级最高的匹配
    return allMatches[0]
  }

  /**
   * 应用捕获组替换到目标 URL
   */
  applyCaptures(target: string, matches: RegExpMatchArray | null): string {
    return this.regexMatcher.applyCaptures(target, matches)
  }

  /**
   * 清除缓存（强制刷新）
   */
  clearCache(): void {
    this.cache = []
    this.lastFetchTime = 0
    this.regexMatcher.clearCache()
  }
}
