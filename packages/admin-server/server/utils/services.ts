import { RuleService } from '../../src/services/rule-service.js'
import { SystemProxyManager } from '../../src/utils/system-proxy.js'
import { ProxyServerManager } from '../../src/utils/proxy-server-manager.js'

// 创建单例服务实例
export const ruleService = new RuleService()
export const systemProxyManager = new SystemProxyManager()
export const proxyServerManager = new ProxyServerManager()
