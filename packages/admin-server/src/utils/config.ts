import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 加载环境变量
const envPath = join(__dirname, '../../.env')
if (existsSync(envPath)) {
  dotenv.config({ path: envPath })
} else {
  dotenv.config()
}

export interface AdminServerConfig {
  port: number
  host: string
  proxyPort: number
  proxyHost: string
  logLevel: string
  logDir: string
  logFile: string
  logMaxSize: string
  logMaxFiles: number
}

function getEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key]
  return value ? parseInt(value, 10) : defaultValue
}

// getEnvBoolean 暂时未使用，保留以备将来使用
// function getEnvBoolean(key: string, defaultValue: boolean): boolean {
//   const value = process.env[key]
//   if (value === undefined) return defaultValue
//   return value.toLowerCase() === 'true' || value === '1'
// }

export const config: AdminServerConfig = {
  port: getEnvNumber('PORT', 3000),
  host: getEnv('HOST', '127.0.0.1'),
  proxyPort: getEnvNumber('PROXY_PORT', 8080),
  proxyHost: getEnv('PROXY_HOST', '127.0.0.1'),
  logLevel: getEnv('LOG_LEVEL', 'info'),
  logDir: getEnv('LOG_DIR', join(__dirname, '../../logs')),
  logFile: getEnv('LOG_FILE', 'admin-server.log'),
  logMaxSize: getEnv('LOG_MAX_SIZE', '20m'),
  logMaxFiles: getEnvNumber('LOG_MAX_FILES', 14),
}
