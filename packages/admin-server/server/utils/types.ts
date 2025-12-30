export interface ProxyRule {
  id: string
  source: string // 源域名或 URL
  target: string // 目标 URL
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface SystemProxyStatus {
  enabled: boolean
  host: string
  port: number
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

export interface ProxyStatus {
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
