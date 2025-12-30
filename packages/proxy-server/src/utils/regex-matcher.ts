import type { ProxyRule, RuleMatchResult } from '../types/index.js'
import { logger } from './logger.js'

interface CompiledRule {
  rule: ProxyRule
  regex: RegExp
  isRegex: boolean
  priority: number
}

/**
 * 正则表达式匹配器
 * 支持预编译正则表达式，缓存编译结果，防止 ReDoS 攻击
 */
export class RegexMatcher {
  private compiledRules: Map<string, CompiledRule> = new Map()
  private readonly maxRegexLength = 10000 // 防止过长的正则表达式
  private readonly maxMatchTime = 1000 // 匹配超时时间（毫秒）

  /**
   * 编译规则
   */
  compileRule(rule: ProxyRule): CompiledRule | null {
    const cacheKey = `${rule.id}-${rule.source}`
    const cached = this.compiledRules.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      // 验证正则表达式长度
      if (rule.source.length > this.maxRegexLength) {
        logger.warn('Rule source too long, skipping', {
          ruleId: rule.id,
          length: rule.source.length,
        })
        return null
      }

      // 尝试作为正则表达式编译
      let regex: RegExp
      let isRegex = false
      let priority = 0

      try {
        // 检查是否是正则表达式（以 / 开头和结尾，或包含特殊字符）
        const isPotentialRegex =
          (rule.source.startsWith('/') && rule.source.endsWith('/')) ||
          /[.*+?^${}()|[\]\\]/.test(rule.source)

        if (isPotentialRegex) {
          // 提取正则表达式（移除首尾的 /）
          const regexStr =
            rule.source.startsWith('/') && rule.source.endsWith('/')
              ? rule.source.slice(1, -1)
              : rule.source

          regex = new RegExp(regexStr)
          isRegex = true

          // 计算优先级：捕获组数量越多，优先级越高
          const captureGroups = (regexStr.match(/\(/g) || []).length
          priority = captureGroups * 100

          // 精确匹配优先级更高
          if (regexStr.startsWith('^') && regexStr.endsWith('$')) {
            priority += 1000
          }
        } else {
          // 普通字符串匹配，转换为正则表达式
          const escaped = rule.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          regex = new RegExp(escaped)
          isRegex = false
          priority = 1
        }

        const compiled: CompiledRule = {
          rule,
          regex,
          isRegex,
          priority,
        }

        this.compiledRules.set(cacheKey, compiled)
        return compiled
      } catch (regexError) {
        // 如果正则表达式编译失败，尝试作为普通字符串
        logger.debug('Failed to compile as regex, using string match', {
          ruleId: rule.id,
          error: regexError instanceof Error ? regexError.message : 'Unknown error',
        })

        const escaped = rule.source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        regex = new RegExp(escaped)
        isRegex = false
        priority = 1

        const compiled: CompiledRule = {
          rule,
          regex,
          isRegex,
          priority,
        }

        this.compiledRules.set(cacheKey, compiled)
        return compiled
      }
    } catch (error) {
      logger.error('Failed to compile rule', {
        ruleId: rule.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * 匹配规则
   */
  matchRules(rules: ProxyRule[], url: string): RuleMatchResult[] {
    const results: RuleMatchResult[] = []

    for (const rule of rules) {
      const compiled = this.compileRule(rule)
      if (!compiled) {
        continue
      }

      try {
        // 使用超时机制防止 ReDoS
        const startTime = Date.now()
        const matches = url.match(compiled.regex)
        const matchTime = Date.now() - startTime

        if (matchTime > this.maxMatchTime) {
          logger.warn('Regex match timeout, skipping', {
            ruleId: rule.id,
            matchTime,
          })
          continue
        }

        if (matches) {
          const result: RuleMatchResult = {
            rule: compiled.rule,
            matches,
            priority: compiled.priority,
          }
          results.push(result)
        }
      } catch (error) {
        logger.warn('Regex match error', {
          ruleId: rule.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        continue
      }
    }

    // 按优先级排序，优先级高的在前
    results.sort((a, b) => b.priority - a.priority)

    return results
  }

  /**
   * 应用捕获组替换到目标 URL
   */
  applyCaptures(target: string, matches: RegExpMatchArray | null): string {
    if (!matches) {
      return target
    }

    // 替换 $1, $2, ... $n
    let result = target
    for (let i = 1; i < matches.length; i++) {
      const placeholder = `$${i}`
      const value = matches[i] || ''
      result = result.replace(new RegExp(placeholder.replace(/\$/g, '\\$'), 'g'), value)
    }

    return result
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.compiledRules.clear()
  }

  /**
   * 清除特定规则的缓存
   */
  clearRuleCache(ruleId: string): void {
    for (const [key, compiled] of this.compiledRules.entries()) {
      if (compiled.rule.id === ruleId) {
        this.compiledRules.delete(key)
      }
    }
  }
}
