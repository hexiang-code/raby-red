import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { ProxyRule } from '../../types/index.js'
import type { RuleStorageStrategy } from './rule-storage-strategy.js'

/**
 * 文件存储策略
 * 将规则存储在 JSON 文件中
 */
export class FileStorageStrategy implements RuleStorageStrategy {
  private readonly rulesFilePath: string

  constructor(dataDir: string) {
    // 确保目录存在
    const dataDirPath = join(dataDir, 'data')
    if (!existsSync(dataDirPath)) {
      mkdirSync(dataDirPath, { recursive: true })
    }
    this.rulesFilePath = join(dataDirPath, 'rules.json')
  }

  /**
   * 扁平化规则（移除 children，用于存储）
   */
  private flattenRules(rules: ProxyRule[]): ProxyRule[] {
    const result: ProxyRule[] = []
    for (const rule of rules) {
      const { children, ...ruleWithoutChildren } = rule
      result.push(ruleWithoutChildren)
      if (children && children.length > 0) {
        result.push(...this.flattenRules(children))
      }
    }
    return result
  }

  /**
   * 构建层级结构（从扁平数据构建树形结构）
   */
  private buildTree(rules: ProxyRule[]): ProxyRule[] {
    const ruleMap = new Map<string, ProxyRule>()
    const rootRules: ProxyRule[] = []

    // 创建所有规则的映射（移除 children，因为我们要重新构建）
    for (const rule of rules) {
      const { children, ...ruleWithoutChildren } = rule
      ruleMap.set(rule.id, { ...ruleWithoutChildren, children: [] })
    }

    // 构建树形结构
    for (const rule of rules) {
      const ruleWithChildren = ruleMap.get(rule.id)!
      if (rule.parentId) {
        const parent = ruleMap.get(rule.parentId)
        if (parent) {
          if (!parent.children) {
            parent.children = []
          }
          parent.children.push(ruleWithChildren)
        } else {
          // 父节点不存在，作为根节点
          rootRules.push(ruleWithChildren)
        }
      } else {
        rootRules.push(ruleWithChildren)
      }
    }

    return rootRules
  }

  /**
   * 检查数据是否已经是树形结构
   */
  private isTreeStructure(rules: ProxyRule[]): boolean {
    // 如果数组中的任何元素有 children 属性，则认为是树形结构
    return rules.some(rule => rule.children && rule.children.length > 0)
  }

  /**
   * 加载所有规则（构建层级结构）
   */
  async loadRules(): Promise<ProxyRule[]> {
    try {
      if (existsSync(this.rulesFilePath)) {
        const data = readFileSync(this.rulesFilePath, 'utf-8')
        const rules: ProxyRule[] = JSON.parse(data)
        if (!Array.isArray(rules)) {
          return []
        }
        // 如果已经是树形结构，直接返回；否则构建层级结构
        if (this.isTreeStructure(rules)) {
          return rules
        }
        // 构建层级结构
        return this.buildTree(rules)
      }
      return []
    } catch (error) {
      console.error('Failed to load rules from file:', error)
      return []
    }
  }

  /**
   * 保存所有规则（保持树形结构）
   */
  async saveRules(rules: ProxyRule[]): Promise<void> {
    try {
      // 确保目录存在
      const dir = dirname(this.rulesFilePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      // 保持树形结构存储
      writeFileSync(this.rulesFilePath, JSON.stringify(rules, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to save rules to file:', error)
      throw error
    }
  }

  /**
   * 检查存储是否可用
   */
  isAvailable(): boolean {
    try {
      const dir = dirname(this.rulesFilePath)
      // 检查目录是否可写
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      return true
    } catch (error) {
      console.error('Storage directory is not available:', error)
      return false
    }
  }

  /**
   * 获取规则文件路径（用于调试）
   */
  getRulesFilePath(): string {
    return this.rulesFilePath
  }
}
