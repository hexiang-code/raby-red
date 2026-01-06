# RabyRed Electron Client

RabyRed 的桌面客户端，Electron 作为容器管理 proxy-server 和 admin-server。

## 架构

```
Electron App (Container)
├── 主进程：启动和管理子进程
│   ├── proxy-server (8080)
│   └── admin-server (3000)
└── 渲染进程：加载 http://localhost:3000
```

## 使用

### 开发模式

需要在 3 个独立终端运行：

```bash
# Terminal 1: 启动 proxy-server
cd packages/proxy-server
pnpm dev

# Terminal 2: 启动 admin-server
cd packages/admin-server
pnpm dev

# Terminal 3: 启动 Electron（首次需要编译）
cd packages/client
./node_modules/.bin/tsc  # 首次运行需要编译
pnpm dev                 # 启动 Electron
```

**说明**：

- 开发模式下 Electron 只负责显示窗口，不会自动启动子服务
- 需要手动在其他终端启动 proxy-server 和 admin-server
- 修改代码后需要重新编译：`./node_modules/.bin/tsc`

### 构建打包

```bash
# 构建
pnpm run client:build

# 打包（macOS）
pnpm run client:dist:mac

# 打包（Windows）
pnpm run client:dist:win
```

## 日志位置

应用日志保存在：

- **macOS**: `~/Library/Logs/@raby-red/client/main.log`
- **Windows**: `%USERPROFILE%\AppData\Roaming\@raby-red\client\logs\main.log`
- **Linux**: `~/.config/@raby-red/client/logs/main.log`

## 说明

- Electron 通过 `spawn` 启动 proxy-server 和 admin-server 子进程
- 打包时通过 `extraResources` 将服务代码复制到应用包中
- 保持原有架构不变，零代码改造
