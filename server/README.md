# ChisaTalk Server

轻量 Node ESM 服务端，负责账号登录、模型配置下发、会话和完整消息保存，并代理 OpenAI-compatible provider 与 Hermes Agent。移动端只访问 ChisaTalk Server，不直接访问 provider 或 Hermes API Server。

## 环境变量

- `PORT`: 监听端口，部署使用 `8789`
- `CHISATALK_DATABASE_PATH`: SQLite 文件路径
- `CHISATALK_MODELS_PATH`: 模型配置 JSON 路径
- `CHISATALK_SESSION_SECRET`: 登录 token hash 密钥
- `CHISATALK_ADMIN_USERNAME`: 初始化管理员账号
- `CHISATALK_ADMIN_PASSWORD`: 初始化管理员密码
- `CHISATALK_ADMIN_DISPLAY_NAME`: 初始化管理员显示名
- `CHISATALK_HERMES_API_BASE_URL`: Hermes Agent API Server 地址，默认建议 `http://127.0.0.1:8642/v1`
- `CHISATALK_HERMES_API_KEY`: Hermes Agent API Server 的 bearer token

## 本地运行

```bash
npm install
npm test
npm start
```

默认测试入口会运行所有 `*.test.mjs`，包括服务端模块边界测试和完整 HTTP/Hermes 回归测试。

## 模型配置

`openai-compatible` 模型由 ChisaTalk Server 代理请求 provider。移动端只接收可见模型信息，不下发 `chatCompletionsUrl` 或 `apiKey`。

`hermes-agent` 模型只下发可见模型信息，不下发 Hermes URL 或 key。移动端会调用 ChisaTalk Server 的流式接口，由服务端代理到 Hermes Agent。

```json
{
  "id": "hermes-agent",
  "label": "Hermes Agent",
  "provider": "hermes",
  "providerType": "hermes-agent",
  "model": "hermes-agent",
  "enabled": true,
  "supportsStreaming": true,
  "defaultParameters": {}
}
```

## Hermes Agent

Hermes API Server 建议和 ChisaTalk Server 部署在同一台机器或内网，并绑定到 `127.0.0.1`：

```bash
API_SERVER_ENABLED=true
API_SERVER_HOST=127.0.0.1
API_SERVER_PORT=8642
API_SERVER_KEY=replace-with-strong-secret
```

ChisaTalk Server 对应配置：

```bash
CHISATALK_HERMES_API_BASE_URL=http://127.0.0.1:8642/v1
CHISATALK_HERMES_API_KEY=replace-with-strong-secret
```

Hermes Agent 可能具备终端、文件、搜索、技能等高权限工具能力。不要让移动端或公网直接访问 Hermes API Server；公网入口只暴露 ChisaTalk Server。

## 模块边界

- `lib/config.mjs`: 读取并校验 `CHISATALK_*` 运行配置。
- `lib/database.mjs`: 封装 SQL.js 加载、查询、串行持久化写入。
- `lib/models.mjs`: 读取模型配置、校验模型存在、移除 provider secret 后下发给移动端。
- `lib/github-lookup.mjs`: 对 GitHub `owner/repo` 问题做服务端精确 API 查询，并注入 Hermes system context。

这些模块是内部边界，不改变移动端 API wire shape。
