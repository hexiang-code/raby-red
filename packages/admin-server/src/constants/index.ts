/**
 * 规则类型枚举
 */
export enum RULE_TYPE {
  RULE = 'rule',
  GROUP = 'group',
}

/**
 * 规则类型映射（用于显示）
 */
export const RULE_TYPE_MAP = {
  [RULE_TYPE.RULE]: '规则',
  [RULE_TYPE.GROUP]: '分组',
} as const
