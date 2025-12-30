export interface ProxyRule {
  id: string
  source: string // 源域名或 URL（支持正则表达式）
  target: string // 目标 URL（支持 $1, $2 等捕获组替换）
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface RuleMatchResult {
  rule: ProxyRule
  matches: RegExpMatchArray | null
  priority: number // 匹配优先级，数字越大优先级越高
}

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

export interface ProxyServerStatus {
  running: boolean
  port: number
  host: string
  requestCount: number
  errorCount: number
  totalResponseTime: number
  minResponseTime: number
  maxResponseTime: number
  averageResponseTime: number
  requestsPerSecond: number
  errorsPerSecond: number
  uptime: number
  startTime: number
  statusCodeCounts: Record<number, number>
  ruleStats: RequestStats[]
}
