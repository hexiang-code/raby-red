import type { ProxyRule } from '../types/index.js'
import { RuleValidator, type ValidationResult } from '../utils/rule-validator.js'
import type { RuleStorageStrategy } from './storage/rule-storage-strategy.js'
import { StorageFactory } from './storage/storage-factory.js'

export class RuleService {
  private rules: Map<string, ProxyRule> = new Map()
  private storageStrategy: RuleStorageStrategy
  private initialized: boolean = false
  private initPromise: Promise<void> | null = null

  constructor(storageStrategy?: RuleStorageStrategy) {
    // 如果未提供策略，使用工厂创建默认策略
    this.storageStrategy = storageStrategy || StorageFactory.createStrategy()
    // 初始化加载规则（懒加载，首次使用时加载）
    this.initPromise = this.loadRules()
  }

  /**
   * 确保规则已加载（懒加载）
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && this.initPromise) {
      await this.initPromise
      this.initialized = true
      this.initPromise = null
    }
  }

  /**
   * 扁平化规则（递归获取所有规则，包括子规则）
   */
  private flattenRules(rules: ProxyRule[]): ProxyRule[] {
    const result: ProxyRule[] = []
    for (const rule of rules) {
      result.push(rule)
      if (rule.children && rule.children.length > 0) {
        result.push(...this.flattenRules(rule.children))
      }
    }
    return result
  }

  /**
   * 构建规则映射（扁平化后构建 Map）
   */
  private buildRuleMap(rules: ProxyRule[]): Map<string, ProxyRule> {
    const flattened = this.flattenRules(rules)
    return new Map(flattened.map(rule => [rule.id, rule]))
  }

  /**
   * 获取所有规则（树形结构）
   */
  async getAllRules(): Promise<ProxyRule[]> {
    await this.ensureInitialized()
    // 从存储加载的是树形结构
    return Array.from(this.rules.values())
  }

  /**
   * 获取所有规则（扁平结构，用于内部操作）
   */
  private getAllRulesFlat(): ProxyRule[] {
    return Array.from(this.rules.values())
  }

  /**
   * 获取启用的规则（扁平结构，供代理服务使用）
   */
  async getEnabledRules(): Promise<ProxyRule[]> {
    await this.ensureInitialized()
    const allRules = this.flattenRules(Array.from(this.rules.values()))
    return allRules.filter(rule => rule.enabled && rule.type !== 'group')
  }

  /**
   * 根据 ID 获取规则（递归查找）
   */
  async getRuleById(id: string): Promise<ProxyRule | undefined> {
    await this.ensureInitialized()
    const findRule = (rules: ProxyRule[]): ProxyRule | undefined => {
      for (const rule of rules) {
        if (rule.id === id) {
          return rule
        }
        if (rule.children && rule.children.length > 0) {
          const found = findRule(rule.children)
          if (found) {
            return found
          }
        }
      }
      return undefined
    }
    return findRule(Array.from(this.rules.values()))
  }

  /**
   * 验证规则
   */
  async validateRule(rule: Partial<ProxyRule>, excludeId?: string): Promise<ValidationResult> {
    await this.ensureInitialized()
    const existingRules = this.flattenRules(Array.from(this.rules.values()))
    return RuleValidator.validateAndDetectConflicts(rule, existingRules, excludeId)
  }

  /**
   * 检查循环引用（检查 parentId 是否指向自身或子节点）
   */
  private checkCircularReference(
    ruleId: string,
    parentId: string | undefined,
    allRules: ProxyRule[]
  ): boolean {
    if (!parentId) {
      return false
    }

    // 如果 parentId 等于自身，存在循环引用
    if (parentId === ruleId) {
      return true
    }

    // 检查 parentId 是否指向当前规则的子节点
    const findRuleById = (rules: ProxyRule[], targetId: string): ProxyRule | null => {
      for (const r of rules) {
        if (r.id === targetId) {
          return r
        }
        if (r.children && r.children.length > 0) {
          const found = findRuleById(r.children, targetId)
          if (found) {
            return found
          }
        }
      }
      return null
    }

    const rule = findRuleById(allRules, ruleId)
    if (!rule) {
      return false
    }

    // 递归检查 parentId 是否在 rule 的子节点中
    const isDescendant = (parent: ProxyRule, targetId: string): boolean => {
      if (parent.id === targetId) {
        return true
      }
      if (parent.children && parent.children.length > 0) {
        for (const child of parent.children) {
          if (isDescendant(child, targetId)) {
            return true
          }
        }
      }
      return false
    }

    return isDescendant(rule, parentId)
  }

  /**
   * 添加规则
   */
  async addRule(rule: Omit<ProxyRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProxyRule> {
    await this.ensureInitialized()

    // 如果是分组，不需要验证 source 和 target
    if (rule.type !== 'group') {
      // 验证规则
      const validation = await this.validateRule(rule)
      if (!validation.valid) {
        const errorMessages = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ')
        throw new Error(`规则验证失败: ${errorMessages}`)
      }
    }

    const id = this.generateId()
    const now = new Date().toISOString()

    const newRule: ProxyRule = {
      ...rule,
      id,
      type: rule.type || 'rule',
      createdAt: now,
      updatedAt: now,
    }

    // 检查循环引用
    const allRules = Array.from(this.rules.values())
    if (this.checkCircularReference(id, rule.parentId, allRules)) {
      throw new Error('不能将规则设置为自己的父级或子级的父级，这会导致循环引用')
    }

    // 如果有父级，添加到父级的 children 中
    if (rule.parentId) {
      const addToParent = (rules: ProxyRule[]): boolean => {
        for (const r of rules) {
          if (r.id === rule.parentId) {
            if (!r.children) {
              r.children = []
            }
            r.children.push(newRule)
            return true
          }
          if (r.children && r.children.length > 0) {
            if (addToParent(r.children)) {
              return true
            }
          }
        }
        return false
      }

      const added = addToParent(allRules)

      if (added) {
        // 更新 Map 以保持引用
        this.rules = new Map()
        for (const rootRule of allRules) {
          this.rules.set(rootRule.id, rootRule)
        }
        await this.saveRules()
        return newRule
      }
      // 如果找不到父级，作为根节点添加
    }

    // 没有父级或找不到父级，作为根节点
    this.rules.set(id, newRule)
    await this.saveRules()
    return newRule
  }

  /**
   * 更新规则（递归查找并更新）
   */
  async updateRule(
    id: string,
    updates: Partial<Omit<ProxyRule, 'id' | 'createdAt'>>
  ): Promise<ProxyRule | null> {
    await this.ensureInitialized()
    const rule = await this.getRuleById(id)
    if (!rule) {
      return null
    }

    // 合并更新
    const updatedRuleData = { ...rule, ...updates }

    // 检查循环引用（如果更新了 parentId）
    if (updates.parentId !== undefined && updates.parentId !== rule.parentId) {
      const allRules = Array.from(this.rules.values())
      if (this.checkCircularReference(id, updates.parentId, allRules)) {
        throw new Error('不能将规则设置为自己的父级或子级的父级，这会导致循环引用')
      }
    }

    // 如果是规则（非分组），需要验证
    if (updatedRuleData.type !== 'group') {
      // 验证规则
      const validation = await this.validateRule(updatedRuleData, id)
      if (!validation.valid) {
        const errorMessages = validation.errors.map(e => `${e.field}: ${e.message}`).join('; ')
        throw new Error(`规则验证失败: ${errorMessages}`)
      }
    }

    const updatedRule: ProxyRule = {
      ...updatedRuleData,
      updatedAt: new Date().toISOString(),
    }

    // 递归更新规则
    const updateInTree = (rules: ProxyRule[]): boolean => {
      for (let i = 0; i < rules.length; i++) {
        if (rules[i].id === id) {
          rules[i] = updatedRule
          return true
        }
        const children = rules[i].children
        if (children && children.length > 0) {
          if (updateInTree(children)) {
            return true
          }
        }
      }
      return false
    }

    const allRules = Array.from(this.rules.values())
    const updated = updateInTree(allRules)

    // 如果是根节点且不在树中找到，直接更新 Map
    if (!updated && !rule.parentId) {
      this.rules.set(id, updatedRule)
    } else if (updated) {
      // 更新后重新构建 Map（保持根节点引用）
      this.rules = new Map()
      for (const rootRule of allRules) {
        this.rules.set(rootRule.id, rootRule)
      }
    }

    await this.saveRules()
    return updatedRule
  }

  /**
   * 删除规则（递归删除，包括子规则）
   */
  async deleteRule(id: string): Promise<boolean> {
    await this.ensureInitialized()

    const deleteFromTree = (rules: ProxyRule[]): boolean => {
      for (let i = 0; i < rules.length; i++) {
        if (rules[i].id === id) {
          rules.splice(i, 1)
          return true
        }
        const children = rules[i].children
        if (children && children.length > 0) {
          if (deleteFromTree(children)) {
            return true
          }
        }
      }
      return false
    }

    const allRules = Array.from(this.rules.values())
    const deleted = deleteFromTree(allRules)

    // 如果不在树中找到，尝试从根节点删除
    if (!deleted) {
      const rootDeleted = this.rules.delete(id)
      if (rootDeleted) {
        await this.saveRules()
        return true
      }
      return false
    }

    // 重新构建规则映射（保持根节点引用）
    this.rules = new Map()
    for (const rootRule of allRules) {
      this.rules.set(rootRule.id, rootRule)
    }

    await this.saveRules()
    return deleted
  }

  /**
   * 匹配规则（用于代理服务查询，只匹配启用的规则）
   */
  async matchRule(hostname: string, url: string): Promise<ProxyRule | null> {
    await this.ensureInitialized()
    const enabledRules = this.flattenRules(Array.from(this.rules.values())).filter(
      rule => rule.enabled && rule.type !== 'group' && rule.source
    )

    // 按优先级排序：精确匹配 > 正则匹配 > 包含匹配
    const matchedRules: Array<{ rule: ProxyRule; priority: number }> = []

    for (const rule of enabledRules) {
      if (!rule.source) continue

      let priority = 0
      let matched = false

      // 1. 精确匹配（最高优先级）
      if (hostname === rule.source || url === rule.source) {
        priority = 3
        matched = true
      }
      // 2. 正则表达式匹配
      else {
        try {
          let pattern = rule.source
          // 如果源地址规则是标准正则表达式格式 /pattern/，提取 pattern
          if (pattern.startsWith('/') && pattern.endsWith('/')) {
            pattern = pattern.slice(1, -1)
          }

          const regex = new RegExp(pattern)
          if (regex.test(url) || regex.test(hostname)) {
            priority = 2
            matched = true
          }
        } catch {
          // 正则表达式无效，跳过正则匹配
        }

        // 3. 包含匹配（最低优先级）
        if (!matched) {
          if (url.includes(rule.source) || hostname.includes(rule.source)) {
            priority = 1
            matched = true
          }
        }
      }

      if (matched) {
        matchedRules.push({ rule, priority })
      }
    }

    // 按优先级排序，返回最高优先级的规则
    if (matchedRules.length === 0) {
      return null
    }

    matchedRules.sort((a, b) => b.priority - a.priority)
    return matchedRules[0].rule
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * 从存储策略加载规则（树形结构）
   */
  private async loadRules(): Promise<void> {
    try {
      if (!this.storageStrategy.isAvailable()) {
        console.error('Storage strategy is not available')
        this.rules = new Map()
        return
      }

      const rules = await this.storageStrategy.loadRules()
      // 存储树形结构，每个根节点作为一个 Map 条目
      this.rules = new Map()
      for (const rule of rules) {
        this.rules.set(rule.id, rule)
      }

      // 如果文件不存在且规则为空，初始化空数组
      if (this.rules.size === 0) {
        await this.saveRules()
      }
    } catch (error) {
      console.error('Failed to load rules:', error)
      this.rules = new Map()
    }
  }

  /**
   * 保存规则到存储策略（树形结构）
   */
  private async saveRules(): Promise<void> {
    try {
      if (!this.storageStrategy.isAvailable()) {
        console.error('Storage strategy is not available')
        return
      }

      const rules = Array.from(this.rules.values())
      await this.storageStrategy.saveRules(rules)
    } catch (error) {
      console.error('Failed to save rules:', error)
      throw error
    }
  }
}
