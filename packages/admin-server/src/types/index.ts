export interface ProxyRule {
  id: string
  source?: string // 源域名或 URL（支持正则表达式），分组时可为空
  target?: string // 目标 URL（支持 $1, $2 等捕获组替换），分组时可为空
  enabled: boolean
  name?: string // 规则名称或分组名称
  type?: 'rule' | 'group' // 类型：规则或分组
  parentId?: string // 父级 ID，用于构建层级结构
  children?: ProxyRule[] // 子规则（仅用于前端展示）
  createdAt: string
  updatedAt: string
  loading?: boolean // UI 状态：是否正在加载（仅用于前端）
}

export interface SystemProxyStatus {
  enabled: boolean
  host: string
  port: number
}
