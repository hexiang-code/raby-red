import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { app } from 'electron'
import net from 'net'
import log from 'electron-log'

export interface ServiceStatus {
  proxyServer: boolean
  adminServer: boolean
}

export class ProcessManager {
  private proxyServerProcess: ChildProcess | null = null
  private adminServerProcess: ChildProcess | null = null

  private readonly PROXY_PORT = parseInt(process.env.PROXY_PORT || '8080', 10)
  private readonly ADMIN_PORT = parseInt(process.env.ADMIN_PORT || '3000', 10)
  private readonly PROXY_HOST = process.env.PROXY_HOST || '127.0.0.1'
  private readonly ADMIN_HOST = process.env.ADMIN_HOST || '127.0.0.1'

  constructor() {
    log.info('ProcessManager initialized')
  }

  /**
   * 检查端口是否可用（未被占用）
   */
  private async isPortAvailable(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    return new Promise(resolve => {
      const server = net.createServer()

      server.once('error', () => {
        resolve(false) // 端口被占用
      })

      server.once('listening', () => {
        server.close()
        resolve(true) // 端口可用
      })

      server.listen(port, host)
    })
  }

  /**
   * 等待端口就绪（被占用 = 服务已启动）
   */
  private async waitForPort(
    port: number,
    host: string = '127.0.0.1',
    maxRetries = 30,
    interval = 1000
  ): Promise<boolean> {
    log.info(`Waiting for port ${port} to be ready...`)

    for (let i = 0; i < maxRetries; i++) {
      const available = await this.isPortAvailable(port, host)
      if (!available) {
        log.info(`Port ${port} is ready`)
        return true // 端口被占用 = 服务已启动
      }
      await new Promise(resolve => setTimeout(resolve, interval))
    }

    log.error(`Timeout waiting for port ${port}`)
    return false
  }

  /**
   * 获取应用路径（开发模式 vs 生产模式）
   */
  private getAppPath(): string {
    const isDev = !app.isPackaged
    if (isDev) {
      // 开发模式：client/src/main -> ../../..
      return path.resolve(app.getAppPath(), '../..')
    } else {
      // 生产模式：app.asar/dist/main -> resources/app
      return path.join(process.resourcesPath, 'app')
    }
  }

  /**
   * 获取 Node 可执行文件路径
   */
  private getNodeExecutable(): string {
    // 使用 process.execPath 并设置 ELECTRON_RUN_AS_NODE 环境变量
    // 这样 Electron 会以 Node.js 模式运行
    return process.execPath
  }

  /**
   * 启动 proxy-server
   */
  async startProxyServer(): Promise<boolean> {
    if (this.proxyServerProcess) {
      log.warn('Proxy server is already running')
      return true
    }

    log.info('Starting proxy-server...')

    const isDev = !app.isPackaged
    const appPath = this.getAppPath()
    const proxyServerPath = path.join(appPath, 'proxy-server')

    // 检查端口是否已被占用
    const portAvailable = await this.isPortAvailable(this.PROXY_PORT, this.PROXY_HOST)
    if (!portAvailable) {
      log.error(`Port ${this.PROXY_PORT} is already in use`)
      return false
    }

    try {
      const nodeExecutable = this.getNodeExecutable()
      const entryFile = isDev
        ? path.join(proxyServerPath, 'src/index.ts')
        : path.join(proxyServerPath, 'dist/index.js')

      const command = isDev ? 'tsx' : nodeExecutable
      const args = isDev ? [entryFile] : [entryFile]

      log.info(`Executing: ${command} ${args.join(' ')}`)
      log.info(`Working directory: ${proxyServerPath}`)

      this.proxyServerProcess = spawn(command, args, {
        cwd: proxyServerPath,
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: isDev ? 'development' : 'production',
          PROXY_PORT: String(this.PROXY_PORT),
          PROXY_HOST: this.PROXY_HOST,
          // 关键：让 Electron 以 Node.js 模式运行
          ELECTRON_RUN_AS_NODE: '1',
        },
      })

      // 日志输出
      this.proxyServerProcess.stdout?.on('data', data => {
        const message = data.toString().trim()
        if (message) {
          log.info(`[Proxy Server] ${message}`)
        }
      })

      this.proxyServerProcess.stderr?.on('data', data => {
        const message = data.toString().trim()
        if (message) {
          log.error(`[Proxy Server Error] ${message}`)
        }
      })

      this.proxyServerProcess.on('exit', (code, signal) => {
        log.info(`Proxy server exited with code ${code}, signal ${signal}`)
        this.proxyServerProcess = null
      })

      this.proxyServerProcess.on('error', error => {
        log.error(`Proxy server process error: ${error.message}`)
        this.proxyServerProcess = null
      })

      // 等待服务启动
      const started = await this.waitForPort(this.PROXY_PORT, this.PROXY_HOST)
      if (started) {
        log.info('Proxy server started successfully')
        return true
      } else {
        log.error('Proxy server failed to start within timeout')
        this.stopProxyServer()
        return false
      }
    } catch (error) {
      log.error('Failed to start proxy server:', error)
      return false
    }
  }

  /**
   * 启动 admin-server
   */
  async startAdminServer(): Promise<boolean> {
    if (this.adminServerProcess) {
      log.warn('Admin server is already running')
      return true
    }

    log.info('Starting admin-server...')

    const isDev = !app.isPackaged
    const appPath = this.getAppPath()
    const adminServerPath = path.join(appPath, 'admin-server')

    // 检查端口是否已被占用
    const portAvailable = await this.isPortAvailable(this.ADMIN_PORT, this.ADMIN_HOST)
    if (!portAvailable) {
      log.error(`Port ${this.ADMIN_PORT} is already in use`)
      return false
    }

    try {
      const nodeExecutable = this.getNodeExecutable()

      let command: string
      let args: string[]
      let cwd: string

      if (isDev) {
        // 开发模式：使用 nuxt dev
        command = 'pnpm'
        args = ['dev']
        cwd = adminServerPath
      } else {
        // 生产模式：运行构建后的服务器
        command = nodeExecutable
        args = ['.output/server/index.mjs']
        cwd = adminServerPath
      }

      log.info(`Executing: ${command} ${args.join(' ')}`)
      log.info(`Working directory: ${cwd}`)

      // 获取用户数据目录（Electron 标准路径）
      const userDataDir = app.getPath('userData')

      this.adminServerProcess = spawn(command, args, {
        cwd,
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: isDev ? 'development' : 'production',
          PORT: String(this.ADMIN_PORT),
          HOST: this.ADMIN_HOST,
          PROXY_PORT: String(this.PROXY_PORT),
          PROXY_HOST: this.PROXY_HOST,
          // 关键：让 Electron 以 Node.js 模式运行
          ELECTRON_RUN_AS_NODE: '1',
          // 传递用户数据目录，用于存储规则数据（避免打包时泄露用户数据）
          USER_DATA_DIR: userDataDir,
        },
      })

      // 日志输出
      this.adminServerProcess.stdout?.on('data', data => {
        const message = data.toString().trim()
        if (message) {
          log.info(`[Admin Server] ${message}`)
        }
      })

      this.adminServerProcess.stderr?.on('data', data => {
        const message = data.toString().trim()
        if (message) {
          log.error(`[Admin Server Error] ${message}`)
        }
      })

      this.adminServerProcess.on('exit', (code, signal) => {
        log.info(`Admin server exited with code ${code}, signal ${signal}`)
        this.adminServerProcess = null
      })

      this.adminServerProcess.on('error', error => {
        log.error(`Admin server process error: ${error.message}`)
        this.adminServerProcess = null
      })

      // 等待服务启动（Nuxt 启动较慢）
      const started = await this.waitForPort(this.ADMIN_PORT, this.ADMIN_HOST, 60, 1000)
      if (started) {
        log.info('Admin server started successfully')
        return true
      } else {
        log.error('Admin server failed to start within timeout')
        this.stopAdminServer()
        return false
      }
    } catch (error) {
      log.error('Failed to start admin server:', error)
      return false
    }
  }

  /**
   * 启动所有服务
   */
  async startAll(): Promise<boolean> {
    log.info('Starting all services...')

    // 先启动 proxy-server
    const proxyStarted = await this.startProxyServer()
    if (!proxyStarted) {
      log.error('Failed to start proxy server')
      return false
    }

    // 再启动 admin-server
    const adminStarted = await this.startAdminServer()
    if (!adminStarted) {
      log.error('Failed to start admin server')
      this.stopProxyServer() // 如果 admin 启动失败，也停止 proxy
      return false
    }

    log.info('All services started successfully')
    return true
  }

  /**
   * 停止 proxy-server
   */
  stopProxyServer(): void {
    if (this.proxyServerProcess) {
      log.info('Stopping proxy server...')
      this.proxyServerProcess.kill('SIGTERM')
      this.proxyServerProcess = null
    }
  }

  /**
   * 停止 admin-server
   */
  stopAdminServer(): void {
    if (this.adminServerProcess) {
      log.info('Stopping admin server...')
      this.adminServerProcess.kill('SIGTERM')
      this.adminServerProcess = null
    }
  }

  /**
   * 停止所有服务
   */
  stopAll(): void {
    log.info('Stopping all services...')
    this.stopAdminServer()
    this.stopProxyServer()
  }

  /**
   * 获取服务状态
   */
  getStatus(): ServiceStatus {
    return {
      proxyServer: this.proxyServerProcess !== null,
      adminServer: this.adminServerProcess !== null,
    }
  }

  /**
   * 获取 Admin Server URL
   */
  getAdminServerUrl(): string {
    return `http://${this.ADMIN_HOST}:${this.ADMIN_PORT}`
  }
}
