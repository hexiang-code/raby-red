import { app, BrowserWindow, Tray, Menu, nativeImage, shell, ipcMain } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import log from 'electron-log'
import { ProcessManager } from './process-manager.js'

// ES 模块兼容
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 配置日志
log.transports.file.level = 'info'
log.transports.console.level = 'debug'

let mainWindow: BrowserWindow | null = null
let loadingWindow: BrowserWindow | null = null
let tray: Tray | null = null
const processManager = new ProcessManager()

// 标记应用是否正在退出
let isQuitting = false

// 启动状态
let servicesStarted = false

// 确保只有一个实例运行
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  log.info('Another instance is already running, quitting...')
  app.exit(0)
}

// 当试图打开第二个实例时，聚焦到第一个实例的窗口
app.on('second-instance', () => {
  log.info('Second instance detected, focusing main window')
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
    mainWindow.show()
  }
})

/**
 * 创建加载窗口
 */
function createLoadingWindow(): void {
  log.info('Creating loading window...')

  loadingWindow = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  loadingWindow.loadFile(path.join(__dirname, '../renderer/loading.html'))
  loadingWindow.show()

  loadingWindow.on('closed', () => {
    loadingWindow = null
  })
}

/**
 * 关闭加载窗口
 */
function closeLoadingWindow(): void {
  if (loadingWindow) {
    loadingWindow.close()
    loadingWindow = null
  }
}

/**
 * 发送加载进度
 */
function sendLoadingProgress(message: string, progress: number): void {
  log.info(`Loading progress: ${message} (${progress}%)`)
  if (loadingWindow) {
    loadingWindow.webContents.send('loading-progress', { message, progress })
  }
}

/**
 * 发送加载错误
 */
function sendLoadingError(message: string): void {
  log.error(`Loading error: ${message}`)
  if (loadingWindow) {
    loadingWindow.webContents.send('loading-error', { message })
  }
}

/**
 * 创建主窗口
 */
async function createWindow(): Promise<void> {
  log.info('Creating main window...')

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'RabyRed',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
    show: false, // 先不显示，等服务启动后再显示
  })

  // 加载 admin-server
  const adminUrl = processManager.getAdminServerUrl()
  log.info(`Loading admin server: ${adminUrl}`)

  try {
    await mainWindow.loadURL(adminUrl)
    log.info('Admin server loaded successfully')
  } catch (error) {
    log.error('Failed to load admin server:', error)
    throw error
  }

  mainWindow.once('ready-to-show', () => {
    log.info('Window ready to show')
    closeLoadingWindow()
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    log.info('Window closed')
    mainWindow = null
  })

  // 最小化到托盘而不是关闭
  mainWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
      log.info('Window hidden to tray')
    }
  })

  // 在默认浏览器中打开外部链接
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 开发工具
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools()
  }
}

/**
 * 启动服务
 */
async function startServices(): Promise<boolean> {
  const isDev = !app.isPackaged

  if (isDev) {
    // 开发模式：不自动启动服务
    log.info('Development mode: Services should be started manually')
    sendLoadingProgress('开发模式：请手动启动服务', 100)
    return true
  }

  try {
    // 生产模式：自动启动服务
    sendLoadingProgress('正在启动代理服务...', 30)
    log.info('Production mode: Starting background services...')

    const started = await processManager.startAll()

    if (!started) {
      throw new Error('服务启动失败：端口可能被占用或服务无法正常启动')
    }

    sendLoadingProgress('服务启动成功！', 100)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    log.error('Failed to start services:', error)
    sendLoadingError(`服务启动失败：${message}`)
    return false
  }
}

/**
 * 创建系统托盘
 */
function createTray(): void {
  log.info('Creating system tray...')

  // 创建托盘图标（临时使用系统默认图标）
  // TODO: 替换为自定义图标
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png')
  let icon: Electron.NativeImage

  try {
    icon = nativeImage.createFromPath(iconPath)
    if (icon.isEmpty()) {
      throw new Error('Icon is empty')
    }
  } catch {
    // 如果图标文件不存在，创建一个简单的图标
    icon = nativeImage.createEmpty()
    log.warn('Tray icon not found, using empty icon')
  }

  tray = new Tray(icon)

  updateTrayMenu()

  tray.setToolTip('RabyRed Proxy')

  // 双击托盘图标显示窗口
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
      }
    }
  })

  log.info('System tray created')
}

/**
 * 更新托盘菜单
 */
function updateTrayMenu(): void {
  if (!tray) return

  const status = processManager.getStatus()

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'RabyRed',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '显示主窗口',
      click: () => {
        mainWindow?.show()
      },
    },
    {
      label: '隐藏主窗口',
      click: () => {
        mainWindow?.hide()
      },
    },
    { type: 'separator' },
    {
      label: '服务状态',
      submenu: [
        {
          label: `Proxy Server: ${status.proxyServer ? '✓ 运行中' : '✗ 已停止'}`,
          enabled: false,
        },
        {
          label: `Admin Server: ${status.adminServer ? '✓ 运行中' : '✗ 已停止'}`,
          enabled: false,
        },
      ],
    },
    { type: 'separator' },
    {
      label: '在浏览器中打开',
      click: () => {
        shell.openExternal(processManager.getAdminServerUrl())
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)
}

/**
 * 应用启动
 */
app.whenReady().then(async () => {
  log.info('Electron app is ready')
  log.info(`App version: ${app.getVersion()}`)
  log.info(`Electron version: ${process.versions.electron}`)
  log.info(`Node version: ${process.versions.node}`)
  log.info(`Is packaged: ${app.isPackaged}`)

  // 注册 IPC 处理器
  registerIpcHandlers()

  // 显示加载窗口
  createLoadingWindow()

  // 启动服务
  await tryStartServices()
})

/**
 * 尝试启动服务
 */
async function tryStartServices(): Promise<void> {
  try {
    const started = await startServices()

    if (started) {
      servicesStarted = true
      // 创建主窗口
      await createWindow()

      // 创建托盘
      createTray()

      // 定期更新托盘菜单
      setInterval(() => {
        updateTrayMenu()
      }, 5000)

      log.info('Application initialized successfully')
    }
    // 如果失败，加载窗口会显示错误和重试按钮，不退出应用
  } catch (error) {
    log.error('Failed to initialize application:', error)
    sendLoadingError(`初始化失败：${error instanceof Error ? error.message : '未知错误'}`)
    // 不退出应用，等待用户重试或手动退出
  }
}

/**
 * 注册 IPC 处理器
 */
function registerIpcHandlers(): void {
  // 重试启动
  ipcMain.on('retry-startup', async () => {
    log.info('User requested retry startup')
    sendLoadingProgress('正在重试...', 0)
    await tryStartServices()
  })

  // 退出应用
  ipcMain.on('quit-app', () => {
    log.info('User requested quit')
    isQuitting = true
    app.quit()
  })
}

/**
 * 应用退出前
 */
app.on('before-quit', () => {
  log.info('App is quitting...')
  isQuitting = true
  // 只在生产模式下停止服务（开发模式下服务是手动启动的）
  if (app.isPackaged) {
    log.info('Stopping services...')
    processManager.stopAll()
  }
})

/**
 * 所有窗口关闭
 */
app.on('window-all-closed', () => {
  // macOS 上保持应用运行，只关闭窗口
  if (process.platform !== 'darwin') {
    if (!isQuitting) {
      // 如果不是正在退出，保持托盘运行
      log.info('All windows closed, running in tray')
    } else {
      app.quit()
    }
  }
})

/**
 * macOS 激活（点击 Dock 图标）
 */
app.on('activate', async () => {
  if (mainWindow === null) {
    await createWindow()
  } else {
    mainWindow.show()
  }
})

/**
 * 未捕获的异常 - 必须退出避免不稳定状态
 */
process.on('uncaughtException', error => {
  log.error('Uncaught exception:', error)
  log.error('Application will exit to prevent unstable state')
  if (app.isPackaged) {
    processManager.stopAll()
  }
  setTimeout(() => app.exit(1), 1000)
})

process.on('unhandledRejection', reason => {
  log.error('Unhandled rejection:', reason)
  log.error('Application will exit to prevent unstable state')
  if (app.isPackaged) {
    processManager.stopAll()
  }
  setTimeout(() => app.exit(1), 1000)
})

/**
 * 优雅退出
 */
function gracefulShutdown(signal: string): void {
  log.info(`Received ${signal}, shutting down gracefully...`)
  isQuitting = true
  if (app.isPackaged) {
    processManager.stopAll()
    setTimeout(() => {
      process.exit(0)
    }, 3000) // 给服务 3 秒时间关闭
  } else {
    process.exit(0)
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
