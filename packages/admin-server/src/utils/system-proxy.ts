import { exec } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import type { SystemProxyStatus } from '../types/index.js'

const execAsync = promisify(exec)

export class SystemProxyManager {
  private readonly platform: NodeJS.Platform

  constructor() {
    this.platform = os.platform()
  }

  /**
   * 设置系统代理
   */
  async setProxy(host: string, port: number): Promise<void> {
    if (this.platform === 'darwin') {
      await this.setMacProxy(host, port)
    } else if (this.platform === 'win32') {
      await this.setWindowsProxy(host, port)
    } else {
      throw new Error(`Unsupported platform: ${this.platform}`)
    }
  }

  /**
   * 关闭系统代理
   */
  async unsetProxy(): Promise<void> {
    if (this.platform === 'darwin') {
      await this.unsetMacProxy()
    } else if (this.platform === 'win32') {
      await this.unsetWindowsProxy()
    } else {
      throw new Error(`Unsupported platform: ${this.platform}`)
    }
  }

  /**
   * 获取当前系统代理状态
   */
  async getProxyStatus(): Promise<SystemProxyStatus> {
    if (this.platform === 'darwin') {
      return this.getMacProxyStatus()
    } else if (this.platform === 'win32') {
      return this.getWindowsProxyStatus()
    } else {
      throw new Error(`Unsupported platform: ${this.platform}`)
    }
  }

  private async setMacProxy(host: string, port: number): Promise<void> {
    try {
      // 获取网络服务名称
      const { stdout: servicesOutput } = await execAsync('networksetup -listallnetworkservices')
      const services = servicesOutput
        .split('\n')
        .filter(s => s && !s.startsWith('*'))
        .map(s => s.trim())

      // 优先使用 Wi-Fi，否则使用第一个服务
      const service = services.find(s => s.includes('Wi-Fi')) || services[0]

      if (!service) {
        throw new Error('No network service found')
      }

      // 设置 HTTP 代理
      await execAsync(`networksetup -setwebproxy "${service}" ${host} ${port}`)
      await execAsync(`networksetup -setsecurewebproxy "${service}" ${host} ${port}`)
      await execAsync(`networksetup -setwebproxystate "${service}" on`)
      await execAsync(`networksetup -setsecurewebproxystate "${service}" on`)
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to set macOS proxy: ${err.message}`)
    }
  }

  private async unsetMacProxy(): Promise<void> {
    try {
      const { stdout: servicesOutput } = await execAsync('networksetup -listallnetworkservices')
      const services = servicesOutput
        .split('\n')
        .filter(s => s && !s.startsWith('*'))
        .map(s => s.trim())

      const service = services.find(s => s.includes('Wi-Fi')) || services[0]

      if (!service) {
        throw new Error('No network service found')
      }

      await execAsync(`networksetup -setwebproxystate "${service}" off`)
      await execAsync(`networksetup -setsecurewebproxystate "${service}" off`)
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to unset macOS proxy: ${err.message}`)
    }
  }

  private async getMacProxyStatus(): Promise<SystemProxyStatus> {
    try {
      const { stdout: servicesOutput } = await execAsync('networksetup -listallnetworkservices')
      const services = servicesOutput
        .split('\n')
        .filter(s => s && !s.startsWith('*'))
        .map(s => s.trim())

      const service = services.find(s => s.includes('Wi-Fi')) || services[0]

      if (!service) {
        return { enabled: false, host: '', port: 0 }
      }

      const { stdout: proxyOutput } = await execAsync(`networksetup -getwebproxy "${service}"`)
      const lines = proxyOutput.split('\n')
      const enabled = lines[0]?.includes('Yes') ?? false

      if (!enabled) {
        return { enabled: false, host: '', port: 0 }
      }

      const serverMatch = lines[1]?.match(/Server:\s*(.+)/)
      const portMatch = lines[2]?.match(/Port:\s*(\d+)/)

      const host = serverMatch?.[1]?.trim() ?? ''
      const port = portMatch?.[1] ? parseInt(portMatch[1], 10) : 0

      return { enabled, host, port }
    } catch {
      return { enabled: false, host: '', port: 0 }
    }
  }

  private async setWindowsProxy(host: string, port: number): Promise<void> {
    try {
      // 启用代理
      await execAsync(
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 1 /f`
      )

      // 设置代理服务器地址
      await execAsync(
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /t REG_SZ /d "${host}:${port}" /f`
      )

      // 设置例外列表（localhost 不走代理）
      await execAsync(
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyOverride /t REG_SZ /d "localhost;127.*;10.*;192.168.*;<local>" /f`
      )

      // 通知系统配置已更改
      await execAsync('rundll32.exe url.dll,FileProtocolHandler')
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to set Windows proxy: ${err.message}`)
    }
  }

  private async unsetWindowsProxy(): Promise<void> {
    try {
      await execAsync(
        `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f`
      )
    } catch (error) {
      const err = error as Error
      throw new Error(`Failed to unset Windows proxy: ${err.message}`)
    }
  }

  private async getWindowsProxyStatus(): Promise<SystemProxyStatus> {
    try {
      const { stdout: enableOutput } = await execAsync(
        `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable`
      )

      const enabledMatch = enableOutput.match(/ProxyEnable\s+REG_DWORD\s+0x(\d+)/)
      const enabled = enabledMatch?.[1] === '1'

      if (!enabled) {
        return { enabled: false, host: '', port: 0 }
      }

      const { stdout: serverOutput } = await execAsync(
        `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer`
      )

      const serverMatch = serverOutput.match(/ProxyServer\s+REG_SZ\s+(.+)/)
      const serverStr = serverMatch?.[1]?.trim() ?? ''

      if (!serverStr) {
        return { enabled: false, host: '', port: 0 }
      }

      const [host, portStr] = serverStr.split(':')
      const port = portStr ? parseInt(portStr, 10) : 0

      return { enabled, host, port }
    } catch {
      return { enabled: false, host: '', port: 0 }
    }
  }
}
