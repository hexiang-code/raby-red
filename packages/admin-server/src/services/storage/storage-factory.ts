import type { RuleStorageStrategy } from './rule-storage-strategy.js'
import { FileStorageStrategy } from './file-storage-strategy.js'

/**
 * 存储策略工厂
 * 根据环境变量和运行环境选择合适的存储策略
 */
export const StorageFactory = {
  /**
   * 创建存储策略实例
   */
  createStrategy(): RuleStorageStrategy {
    // 优先使用环境变量指定的用户数据目录（Electron 生产环境）
    const userDataDir = process.env.USER_DATA_DIR

    if (userDataDir) {
      // 策略1：使用用户数据目录（Electron 生产环境）
      return new FileStorageStrategy(userDataDir)
    }

    // 策略2：使用项目目录（开发环境）
    const projectDataDir = process.cwd()
    return new FileStorageStrategy(projectDataDir)
  },

  /**
   * 获取当前使用的数据目录路径（用于调试）
   */
  getDataDir(): string {
    return process.env.USER_DATA_DIR || process.cwd()
  },
}
