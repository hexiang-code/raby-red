// 从共享类型定义导入
export type { ProxyRule, SystemProxyStatus } from '../../src/types/index.js'

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
