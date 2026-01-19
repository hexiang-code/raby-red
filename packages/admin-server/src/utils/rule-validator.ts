import type { ProxyRule } from '../types/index.js'

export interface ValidationError {
  field: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * 规则验证器
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class RuleValidator {
  /**
   * 验证规则格式
   */
  static validateRule(rule: Partial<ProxyRule>): ValidationResult {
    const errors: ValidationError[] = []

    // 验证 source
    if (!rule.source || typeof rule.source !== 'string' || rule.source.trim() === '') {
      errors.push({ field: 'source', message: '源地址不能为空' })
    } else {
      const sourceError = this.validateUrl(rule.source, 'source')
      if (sourceError) {
        errors.push(sourceError)
      }
    }

    // 验证 target
    if (!rule.target || typeof rule.target !== 'string' || rule.target.trim() === '') {
      errors.push({ field: 'target', message: '目标地址不能为空' })
    } else {
      const targetError = this.validateUrl(rule.target, 'target', true)
      if (targetError) {
        errors.push(targetError)
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * 验证 URL 格式或正则表达式
   */
  private static validateUrl(
    url: string,
    field: string,
    requireProtocol: boolean = false
  ): ValidationError | null {
    const urlToValidate = url.trim()

    // 检查是否是正则表达式（以 / 开头和结尾，或包含特殊字符）
    const isPotentialRegex =
      (urlToValidate.startsWith('/') && urlToValidate.endsWith('/')) ||
      /[.*+?^${}()|[\]\\]/.test(urlToValidate)

    if (isPotentialRegex) {
      // 验证正则表达式
      return this.validateRegex(urlToValidate, field)
    }

    // 验证普通 URL
    try {
      let urlStr = urlToValidate
      if (!urlStr.match(/^https?:\/\//i)) {
        if (requireProtocol) {
          return {
            field,
            message: `${field} 必须包含协议（http:// 或 https://）`,
          }
        }
        urlStr = `http://${urlStr}`
      }

      const parsedUrl = new URL(urlStr)

      // 验证协议
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
          field,
          message: `${field} 必须使用 http:// 或 https:// 协议`,
        }
      }

      // 验证主机名
      if (!parsedUrl.hostname || parsedUrl.hostname.trim() === '') {
        return {
          field,
          message: `${field} 必须包含有效的主机名`,
        }
      }

      return null
    } catch (error) {
      return {
        field,
        message: `${field} 格式无效: ${error instanceof Error ? error.message : '未知错误'}`,
      }
    }
  }

  /**
   * 验证正则表达式
   */
  private static validateRegex(regexStr: string, field: string): ValidationError | null {
    // 防止过长的正则表达式（ReDoS 防护）
    const maxLength = 10000
    if (regexStr.length > maxLength) {
      return {
        field,
        message: `${field} 正则表达式过长（最大 ${maxLength} 字符）`,
      }
    }

    try {
      // 提取正则表达式（移除首尾的 /）
      const pattern =
        regexStr.startsWith('/') && regexStr.endsWith('/') ? regexStr.slice(1, -1) : regexStr

      // 尝试编译正则表达式
      new RegExp(pattern)

      return null
    } catch (error) {
      return {
        field,
        message: `${field} 正则表达式无效: ${error instanceof Error ? error.message : '未知错误'}`,
      }
    }
  }

  /**
   * 检测规则冲突
   */
  static detectConflicts(
    newRule: Partial<ProxyRule>,
    existingRules: ProxyRule[],
    excludeId?: string
  ): ValidationError[] {
    const errors: ValidationError[] = []

    if (!newRule.source || !newRule.target) {
      return errors
    }

    // 规范化源地址用于比较
    const normalizedSource = this.normalizeUrl(newRule.source)

    for (const existingRule of existingRules) {
      // 跳过自己
      if (excludeId && existingRule.id === excludeId) {
        continue
      }

      // 只检查启用的规则
      if (!existingRule.enabled) {
        continue
      }

      if (!existingRule.source) {
        continue
      }

      const normalizedExistingSource = this.normalizeUrl(existingRule.source)

      // 检查完全相同的源地址
      if (normalizedSource === normalizedExistingSource) {
        errors.push({
          field: 'source',
          message: `源地址 "${newRule.source}" 与规则 "${existingRule.id}" 冲突`,
        })
        continue
      }

      // 检查源地址是否相互包含（一个规则是另一个规则的子路径）
      if (this.isSubPath(normalizedSource, normalizedExistingSource)) {
        errors.push({
          field: 'source',
          message: `源地址 "${newRule.source}" 与规则 "${existingRule.id}" 的源地址 "${existingRule.source}" 存在路径冲突`,
        })
      } else if (this.isSubPath(normalizedExistingSource, normalizedSource)) {
        errors.push({
          field: 'source',
          message: `源地址 "${newRule.source}" 与规则 "${existingRule.id}" 的源地址 "${existingRule.source}" 存在路径冲突`,
        })
      }
    }

    return errors
  }

  /**
   * 规范化 URL（用于比较）
   */
  private static normalizeUrl(url: string): string {
    try {
      let normalized = url.trim().toLowerCase()

      // 如果没有协议，添加 http://
      if (!normalized.match(/^https?:\/\//i)) {
        normalized = `http://${normalized}`
      }

      const parsed = new URL(normalized)

      // 移除末尾的斜杠（路径部分）
      const pathname = parsed.pathname.replace(/\/$/, '') || '/'

      return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}${pathname}`
    } catch {
      return url.toLowerCase()
    }
  }

  /**
   * 检查一个路径是否是另一个路径的子路径
   */
  private static isSubPath(path1: string, path2: string): boolean {
    // 如果两个路径完全相同，不算子路径
    if (path1 === path2) {
      return false
    }

    // 提取路径部分
    const url1 = this.parseUrl(path1)
    const url2 = this.parseUrl(path2)

    if (!url1 || !url2) {
      return false
    }

    // 主机名必须相同
    if (url1.host !== url2.host) {
      return false
    }

    // 检查路径关系
    const path1Parts = url1.path.split('/').filter(Boolean)
    const path2Parts = url2.path.split('/').filter(Boolean)

    // path1 是 path2 的子路径
    if (path1Parts.length > path2Parts.length) {
      return path2Parts.every((part, index) => path1Parts[index] === part)
    }

    // path2 是 path1 的子路径
    if (path2Parts.length > path1Parts.length) {
      return path1Parts.every((part, index) => path2Parts[index] === part)
    }

    return false
  }

  /**
   * 解析 URL（简化版）
   */
  private static parseUrl(url: string): { host: string; path: string } | null {
    try {
      let urlToParse = url.trim()
      if (!urlToParse.match(/^https?:\/\//i)) {
        urlToParse = `http://${urlToParse}`
      }

      const parsed = new URL(urlToParse)
      return {
        host: `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`,
        path: parsed.pathname || '/',
      }
    } catch {
      return null
    }
  }

  /**
   * 验证并检测冲突（组合方法）
   */
  static validateAndDetectConflicts(
    rule: Partial<ProxyRule>,
    existingRules: ProxyRule[],
    excludeId?: string
  ): ValidationResult {
    const validation = this.validateRule(rule)
    const conflicts = this.detectConflicts(rule, existingRules, excludeId)

    return {
      valid: validation.valid && conflicts.length === 0,
      errors: [...validation.errors, ...conflicts],
    }
  }
}
