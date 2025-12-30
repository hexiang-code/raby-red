# Proxy Server

纯代理服务 - 通过 HTTP API 从 admin-server 查询规则并执行代理。

## 功能

- 纯代理功能：不管理规则，只执行代理
- 规则查询：通过 HTTP API 从 admin-server 查询规则
- 规则缓存：5秒缓存规则，减少 API 调用
- 独立运行：可以独立于 admin-server 运行

## 环境变量

- `ADMIN_SERVER_URL` - admin-server 的 URL（默认：http://127.0.0.1:3000）
- `PROXY_PORT` - 代理服务器端口（默认：8080）
- `PROXY_HOST` - 代理服务器主机（默认：127.0.0.1）

## 开发

```bash
pnpm dev
```

## 生产

```bash
pnpm build
pnpm start
```

## 使用

1. 确保 admin-server 正在运行
2. 启动 proxy-server
3. 配置系统代理指向 proxy-server 的地址和端口
