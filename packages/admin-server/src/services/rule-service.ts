import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { ProxyRule } from '../types/index.js'
import { RuleValidator, type ValidationResult } from '../utils/rule-validator.js'

const RULES_FILE = join(process.cwd(), 'data', 'rules.json')

export class RuleService {
  private rules: Map<string, ProxyRule> = new Map()

  constructor() {
    this.loadRules()
  }

  /**
   * 获取所有规则
   */
  getAllRules(): ProxyRule[] {
    return Array.from(this.rules.values())
  }

  /**
   * 获取启用的规则
   */
  getEnabledRules(): ProxyRule[] {
    return Array.from(this.rules.values()).filter(rule => rule.enabled)
  }

  /**
   * 根据 ID 获取规则
   */
  getRuleById(id: string): ProxyRule | undefined {
    return this.rules.get(id)
  }

  /**
   * 验证规则
   */
  validateRule(rule: Partial<ProxyRule>, excludeId?: string): ValidationResult {
    const existingRules = this.getAllRules()
    return RuleValidator.validateAndDetectConflicts(rule, existingRules, excludeId)
  }

  /**
   * 添加规则
   */
  addRule(rule: Omit<ProxyRule, 'id' | 'createdAt' | 'updatedAt'>): ProxyRule {
    // 验证规则
    const validation = this.validateRule(rule)
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ')
      throw new Error(`规则验证失败: ${errorMessages}`)
    }

    const id = this.generateId()
    const now = new Date().toISOString()

    const newRule: ProxyRule = {
      ...rule,
      id,
      createdAt: now,
      updatedAt: now,
    }

    this.rules.set(id, newRule)
    this.saveRules()
    return newRule
  }

  /**
   * 更新规则
   */
  updateRule(id: string, updates: Partial<Omit<ProxyRule, 'id' | 'createdAt'>>): ProxyRule | null {
    const rule = this.rules.get(id)
    if (!rule) {
      return null
    }

    // 合并更新
    const updatedRuleData = { ...rule, ...updates }

    // 验证规则
    const validation = this.validateRule(updatedRuleData, id)
    if (!validation.valid) {
      const errorMessages = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ')
      throw new Error(`规则验证失败: ${errorMessages}`)
    }

    const updatedRule: ProxyRule = {
      ...updatedRuleData,
      updatedAt: new Date().toISOString(),
    }

    this.rules.set(id, updatedRule)
    this.saveRules()
    return updatedRule
  }

  /**
   * 删除规则
   */
  deleteRule(id: string): boolean {
    const deleted = this.rules.delete(id)
    if (deleted) {
      this.saveRules()
    }
    return deleted
  }

  /**
   * 匹配规则（用于代理服务查询）
   */
  matchRule(hostname: string, url: string): ProxyRule | null {
    const enabledRules = this.getEnabledRules()

    for (const rule of enabledRules) {
      // 精确匹配域名
      if (hostname === rule.source) {
        return rule
      }

      // URL 包含匹配
      if (url.includes(rule.source)) {
        return rule
      }

      // 域名包含匹配
      if (hostname.includes(rule.source)) {
        return rule
      }
    }

    return null
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * 从 JSON 文件加载规则
   */
  private loadRules(): void {
    try {
      if (existsSync(RULES_FILE)) {
        const data = readFileSync(RULES_FILE, 'utf-8')
        const rules: ProxyRule[] = JSON.parse(data)
        this.rules = new Map(rules.map(rule => [rule.id, rule]))
      } else {
        // 如果文件不存在，创建空数组
        this.saveRules()
      }
    } catch (error) {
      console.error('Failed to load rules:', error)
      this.rules = new Map()
    }
  }

  /**
   * 保存规则到 JSON 文件
   */
  private saveRules(): void {
    try {
      const rules = Array.from(this.rules.values())
      writeFileSync(RULES_FILE, JSON.stringify(rules, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to save rules:', error)
    }
  }
}
