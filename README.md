# RabyRed 🐰

RabyRed (红兔) - A system-level HTTP proxy tool for Mac and Windows.

## Features

- 🔄 HTTP request forwarding with rule-based routing
- 🖥️ System-level proxy configuration (Mac & Windows)
- 🎨 Modern web interface built with Nuxt and Element Plus
- 📦 Monorepo structure with TypeScript
- 🚀 Zero-config setup

## Project Structure

```
raby-red/
├── packages/
│   ├── backend/      # Node.js proxy server
│   ├── frontend/     # Nuxt SSR application
│   └── client/       # Electron app (future)
├── package.json
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Installation

```bash
# 安装所有依赖
pnpm install
```

### Development

```bash
# 启动开发服务器（整合了前端和后端）
pnpm dev

# 访问地址：
# - 前端界面: http://localhost:3000/raby-red
# - 后端 API: http://localhost:3000/api
```

### Build

```bash
# 构建应用
pnpm build

# 预览生产版本
pnpm --filter frontend preview
```

### Lint & Format

```bash
# 检查代码规范
pnpm lint

# 格式化代码
pnpm format

# 类型检查
pnpm type-check
```

## 使用说明

1. **启动服务**: 运行 `pnpm dev` 启动开发服务器
2. **访问界面**: 打开浏览器访问 http://localhost:3000/raby-red
3. **添加规则**: 在界面中添加转发规则（源地址 → 目标地址）
4. **启动代理**: 点击"代理服务"开关启动代理服务器
5. **启用系统代理**: 点击"系统代理"开关，系统会自动配置代理设置

## 项目架构

- **前端页面**: `/raby-red` - Nuxt SSR 应用
- **后端 API**: `/api` - Nuxt Server API
- **代理服务器**: 独立运行在 `127.0.0.1:8080`

## 注意事项

- **macOS**: 设置系统代理可能需要管理员权限
- **Windows**: 设置系统代理通常不需要管理员权限
- 代理服务器默认监听 `127.0.0.1:8080`
- 系统代理启用后，所有支持系统代理的应用都会自动使用

## License

MIT
