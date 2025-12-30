export interface ProxyRule {
  id: string
  source: string // 源域名或 URL（支持正则表达式）
  target: string // 目标 URL（支持 $1, $2 等捕获组替换）
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface SystemProxyStatus {
  enabled: boolean
  host: string
  port: number
}
