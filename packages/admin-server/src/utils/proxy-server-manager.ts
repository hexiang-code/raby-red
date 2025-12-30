import { spawn, type ChildProcess } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export class ProxyServerManager {
  private process: ChildProcess | null = null
  private readonly proxyServerPath: string

  constructor() {
    // 获取 proxy-server 的路径（用于检查是否存在）
    // admin-server/src/utils -> ../../../proxy-server/src/index.ts
    // __dirname = packages/admin-server/src/utils
    // ../../.. = packages/
    const packagesDir = join(__dirname, '../../..')
    const proxyServerDir = join(packagesDir, 'proxy-server')
    this.proxyServerPath = join(proxyServerDir, 'src/index.ts')
  }

  /**
   * 启动代理服务器
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('Proxy server is already running')
    }

    // 检查 proxy-server 是否存在
    if (!existsSync(this.proxyServerPath)) {
      throw new Error(`Proxy server not found at ${this.proxyServerPath}`)
    }

    return new Promise((resolve, reject) => {
      // 使用 pnpm 来运行 proxy-server（在 monorepo 中更可靠）
      // 获取项目根目录
      const rootDir = join(__dirname, '../../../../..')
      const command = 'pnpm'
      const args = ['--filter', 'proxy-server', 'dev']

      this.process = spawn(command, args, {
        cwd: rootDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true, // 使用 shell 来运行 pnpm 命令
        env: {
          ...process.env,
          ADMIN_SERVER_URL: process.env.ADMIN_SERVER_URL || 'http://127.0.0.1:3000',
          PROXY_PORT: process.env.PROXY_PORT || '8080',
          PROXY_HOST: process.env.PROXY_HOST || '127.0.0.1',
        },
      })

      // 监听进程输出
      if (this.process.stdout) {
        this.process.stdout.on('data', (data: Buffer) => {
          console.log(`[proxy-server] ${data.toString()}`)
        })
      }

      if (this.process.stderr) {
        this.process.stderr.on('data', (data: Buffer) => {
          console.error(`[proxy-server] ${data.toString()}`)
        })
      }

      // 监听进程退出
      this.process.on('exit', (code, signal) => {
        console.log(`[proxy-server] Process exited with code ${code}, signal ${signal}`)
        this.process = null
      })

      // 监听进程错误
      this.process.on('error', error => {
        console.error('[proxy-server] Process error:', error)
        this.process = null
        reject(error)
      })

      // 等待一段时间确保进程启动成功
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          resolve()
        } else {
          reject(new Error('Failed to start proxy server'))
        }
      }, 1000)
    })
  }

  /**
   * 停止代理服务器
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return
    }

    return new Promise((resolve, reject) => {
      if (!this.process) {
        resolve()
        return
      }

      // 发送 SIGTERM 信号
      this.process.kill('SIGTERM')

      // 等待进程退出
      const timeout = setTimeout(() => {
        if (this.process) {
          // 如果进程没有退出，强制杀死
          this.process.kill('SIGKILL')
        }
        reject(new Error('Timeout waiting for proxy server to stop'))
      }, 5000)

      this.process.once('exit', () => {
        clearTimeout(timeout)
        this.process = null
        resolve()
      })
    })
  }

  /**
   * 检查代理服务器是否运行
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }

  /**
   * 获取进程 PID
   */
  getPid(): number | null {
    return this.process?.pid ?? null
  }
}
