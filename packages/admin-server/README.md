# Admin Server

管理服务 - 提供 SSR Web 应用和 API 用于管理代理规则。

## 功能

- SSR Web 界面：使用 Nuxt 3 构建的管理界面
- 规则管理 API：提供 RESTful API 管理代理规则
- JSON 文件存储：规则存储在 `data/rules.json` 文件中
- 系统代理管理：管理操作系统的代理设置

## 开发

```bash
pnpm dev
```

服务将在 http://localhost:3000 启动

## API 端点

- `GET /api/rules` - 获取所有规则
- `GET /api/rules?enabled=true` - 获取启用的规则（供 proxy-server 使用）
- `POST /api/rules` - 创建新规则
- `PUT /api/rules/:id` - 更新规则
- `DELETE /api/rules/:id` - 删除规则
- `GET /api/system-proxy/status` - 获取系统代理状态
- `POST /api/system-proxy/enable` - 启用系统代理
- `POST /api/system-proxy/disable` - 禁用系统代理
