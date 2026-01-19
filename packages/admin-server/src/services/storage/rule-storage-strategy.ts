import type { ProxyRule } from '../../types/index.js'

/**
 * 规则存储策略接口
 */
export interface RuleStorageStrategy {
  /**
   * 加载所有规则
   */
  loadRules(): Promise<ProxyRule[]>

  /**
   * 保存所有规则
   */
  saveRules(rules: ProxyRule[]): Promise<void>

  /**
   * 检查存储是否可用
   */
  isAvailable(): boolean
}
