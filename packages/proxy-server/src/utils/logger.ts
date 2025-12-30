import winston from 'winston'
import { existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { config } from './config.js'

// 确保日志目录存在
if (!existsSync(config.logDir)) {
  mkdirSync(config.logDir, { recursive: true })
}

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
)

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const timestampStr =
      typeof timestamp === 'string' ? timestamp : timestamp ? JSON.stringify(timestamp) : ''
    const levelStr = typeof level === 'string' ? level : level ? JSON.stringify(level) : ''
    const messageStr =
      typeof message === 'string' ? message : message ? JSON.stringify(message) : ''
    let msg = `${timestampStr} [${levelStr}]: ${messageStr}`
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`
    }
    return msg
  })
)

export const logger = winston.createLogger({
  level: config.logLevel,
  format: logFormat,
  defaultMeta: { service: 'proxy-server' },
  transports: [
    // 错误日志文件
    new winston.transports.File({
      filename: join(config.logDir, 'error.log'),
      level: 'error',
      maxsize: parseSize(config.logMaxSize),
      maxFiles: config.logMaxFiles,
    }),
    // 所有日志文件
    new winston.transports.File({
      filename: join(config.logDir, config.logFile),
      maxsize: parseSize(config.logMaxSize),
      maxFiles: config.logMaxFiles,
    }),
  ],
})

// 开发环境添加控制台输出
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
    })
  )
}

/**
 * 解析大小字符串（如 '20m', '1g'）为字节数
 */
function parseSize(sizeStr: string): number {
  const match = sizeStr.match(/^(\d+)([kmg]?)$/i)
  if (!match) return 20 * 1024 * 1024 // 默认 20MB

  const value = parseInt(match[1], 10)
  const unit = match[2].toLowerCase()

  switch (unit) {
    case 'k':
      return value * 1024
    case 'm':
      return value * 1024 * 1024
    case 'g':
      return value * 1024 * 1024 * 1024
    default:
      return value
  }
}
