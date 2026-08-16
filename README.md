# DSH Cockpit Relay

`@hewhenjay/dsh-cockpit-relay` 是 DeepSeek Harness 的本地 OpenAI-compatible 网关。v0.2 增加原生 DSH Web 管理界面：安装后可从左侧栏 **Cockpit Relay** 按钮或 Settings 的 **Cockpit Relay** 页面管理服务、账号/API 渠道和脱敏请求日志。

它让上游 API Key 留在运行 DSH 的本机，并向 DSH、可信局域网客户端和其他 OpenAI-compatible 应用提供一个稳定入口。

## v0.2 功能

- API 服务默认开启，首选 `http://127.0.0.1:19529/v1`，可在 Web 中热关闭或重启。
- 目标端口若已被原 Cockpit 或其他服务占用，会向后寻找空闲端口；不会终止、替换或接管占用进程。UI 显示实际 Base URL。
- DSH 风格的侧栏按钮、快速管理 Modal 和 Settings 独立页面。
- 从 Web 添加、编辑、删除和测试中转站/API-key 渠道。
- API Key 由 DSH credentials 服务持久化；普通配置只保存凭据引用名。
- 普通渠道按优先级路由，官方/正常价格账号可标记为保底渠道。
- 429、常见 5xx 和网络故障冷却、自动切换、模型别名和会话亲和。
- 内存脱敏日志：时间、模型、选中渠道、HTTP 状态、延迟和安全错误摘要。
- LAN 监听必须配置独立客户端访问密钥。
- `/v1/chat/completions`、`/v1/responses`、`/v1/models`、`/health`。

## 安装

```powershell
dsh plugin --profile web add @hewhenjay/dsh-cockpit-relay
```

也可传 GitHub 或本地 `.tgz` 包。首次安装后在方便时重启 `dsh web` 并刷新 `http://127.0.0.1:3080`。不要为了安装插件强制停止正在承载会话或模型调用的 DSH/Cockpit 服务。

Host 入口和浏览器产物刻意分离为 `index.js` 与 `web-client.js`，避免服务端模块和 Web bundle 使用同名构建产物而互相覆盖。包同时显式导出 `./package.json`，供 DSH Client Module Registry 读取 `dsh.client` 声明。

## 添加账号和 API 服务

从 DSH 左侧栏打开 **Cockpit Relay**，点击 **添加账号**。每个渠道可配置：

- **渠道 ID**：稳定标识，例如 `cheap-a`、`official-openai`。
- **显示名称**：状态卡和日志中的名称。
- **Base URL**：上游 OpenAI-compatible `/v1` 地址。
- **凭据变量名**：例如 `CHEAP_A_API_KEY`；留空时自动生成。
- **API Key**：保存到 DSH 本机 credentials，保存后不会返回浏览器。
- **模型列表**：上游接受的客户端模型 ID，逗号分隔；留空表示接受任意模型名。
- **优先级**：普通渠道中数值越大越先使用。
- **保底渠道**：仅当普通渠道均不可用时使用。
- **模型别名**：本地模型 ID 到上游实际模型 ID 的 JSON 映射。

点击 **测试** 会通过该渠道发送一个很小的非流式请求，会消耗上游额度。

### 官方 API Key

OpenAI、DeepSeek 以及提供 OpenAI-compatible Chat Completions/Responses 的 Claude、Gemini、Qwen、Kimi、Grok、GLM、MiniMax、Mistral、Llama 等渠道均可添加。官方渠道可设为普通渠道，也可标记为正常价格保底。

### 登录 / OAuth 账号

轻量 relay 不直接执行 ChatGPT Plus、Claude Pro 或 Google OAuth 登录。需要账号池时，先由完整 Cockpit sidecar 管理浏览器登录、Cookie、refresh token 和原生协议，再把 sidecar 的本地 OpenAI-compatible URL 添加为一个 Cockpit Relay 渠道。

这样 UI 不会误导用户以为轻量插件本身持有 OAuth 会话。

## 在 DSH 中使用

在 DSH Models 中添加 OpenAI-compatible provider，Base URL 使用管理台显示的实际地址，例如：

```text
Base URL: http://127.0.0.1:19529/v1
API Key: 仅当 Cockpit Relay 配置了客户端访问密钥时填写
```

如果 `19529` 已被原 Cockpit 服务占用，插件会显示类似 `http://127.0.0.1:19530/v1` 的实际地址。请使用该地址，不要关闭原服务。

Relay 负责上游路由和故障切换；DSH 内置 `llm-pi-ai` 继续负责消息、工具调用、reasoning 事件和模型协议适配。安装插件不会自动替换现有 DSH 模型 provider 或当前 Cockpit 上游配置。

## 服务与 LAN 设置

API 服务默认开启。点击 **服务设置** 可修改：

- `127.0.0.1`：默认，仅本机访问。
- `0.0.0.0`：可信局域网访问。
- 首选监听端口：默认 `19529`；占用时自动避让至后续空闲端口。
- 客户端访问密钥的凭据引用和值。

LAN 模式在没有客户端密钥时拒绝启动。LAN 客户端请求需携带：

```http
Authorization: Bearer <client-key>
```

不要把 relay 直接暴露到公网。远程使用请配合防火墙、VPN 或带认证的反向代理。

## 日志与隐私

管理台最多保留 500 条请求尝试记录，仅驻留内存，重启 DSH 后清空。日志不记录提示词、响应正文、Authorization、API Key、自定义上游 headers 或完整上游 URL；错误文本在送到浏览器前还会再次移除 URL 和 secret-shaped 字符串。

## 文件配置

默认配置位于 `$DSH_HOME/cockpit-relay.json`。启动 DSH 前设置 `DSH_COCKPIT_CONFIG` 可改用其他文件。`config.example.json` 展示完整结构。

```json
{
  "listen": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 19529,
    "apiKeyEnv": "DSH_COCKPIT_CLIENT_KEY"
  },
  "maxAttempts": 6,
  "cooldownMs": 30000,
  "sessionAffinity": true,
  "routes": [
    {
      "id": "cheap-a",
      "displayName": "Cheap relay A",
      "baseURL": "https://relay-a.example/v1",
      "api": "openai-completions",
      "apiKeyEnv": "CHEAP_A_API_KEY",
      "priority": 100,
      "backup": false,
      "models": ["gpt-4o-mini", "deepseek-chat"]
    },
    {
      "id": "official-backup",
      "displayName": "Official backup",
      "baseURL": "https://api.openai.com/v1",
      "apiKeyEnv": "OPENAI_API_KEY",
      "priority": 0,
      "backup": true,
      "models": ["gpt-4o-mini"]
    }
  ]
}
```

## 模型范围

插件不限制 GPT。只要至少一个渠道接受本地模型 ID，或通过 `modelAliases` 映射到上游模型，就可以使用。原生 Anthropic Messages、Gemini native API、图片生成、OAuth 生命周期和账号池仍由完整 sidecar 或专用 DSH provider 插件负责。

## 开发验证

```powershell
npm test
npm pack --dry-run
```

回归测试覆盖优先/保底路由、故障冷却、凭据不写入配置、服务热启停、LAN 防护、占用端口非侵入式避让、日志脱敏、Host 在无浏览器全局时独立导入、Host/Web 产物路径隔离、`./package.json` 导出和浏览器 loader 注册。

## 许可

上游 Cockpit Tools 默认使用 CC BY-NC-SA 4.0。本适配层保留署名并以相同许可发布，仅用于非商业学习、研究和个人使用。使用中转站或多个账号时，请遵守对应平台服务条款、账号规则和当地法律。
