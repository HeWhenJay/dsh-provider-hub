# DSH Cockpit Relay

将 Cockpit Tools API Service 的核心思路适配为一个 DSH Host 插件：本机保存多条低价中转渠道，按优先级调用，健康渠道失败时自动切换；正常价格渠道可作为保底。API Key 只在本机环境变量中读取，配置文件和 GitHub 仓库不包含密钥。

## 安装

在 DSH profile 中安装本目录（或 GitHub package）并将 bundle patch 加入 profile：

```powershell
dsh plugin --profile web add C:\path\to\dsh-plugin
```

把 `dsh-plugin/cordis.patch.yml` 的内容加入 profile 的 `cordis.patch.yml`，或复制该文件作为 bundle patch。插件也可以仅作为 LLM adapter 使用；有 Web profile 时会额外提供本地 HTTP API。

## 配置账号/渠道

复制 `config.example.json` 为 `cockpit-relay.json`。每个 `routes` 条目配置：

- `id` / `displayName`：渠道标识和展示名。
- `baseURL`：OpenAI-compatible 通常填到 `/v1`。原生 Anthropic endpoint 请在 DSH 自带 `llm-pi-ai` 中配置。
- `api`：`openai-completions` 或 `openai-responses`。原生 Anthropic Messages 请使用 DSH 自带的 `llm-pi-ai` 配置；大多数中转站仍提供 OpenAI 兼容入口。
- `apiKeyEnv`：环境变量名，不是实际密钥。
- `models`：该渠道实际允许的模型 ID；相同模型可配置在多个渠道形成故障转移池。
- `priority`：数字越大越优先。
- `backup`：`true` 只在所有普通渠道不可用时使用，适合正常价格官方账号。
- `modelAliases`：客户端模型名到上游模型名的映射。

例如 PowerShell：

```powershell
$env:CHEAP_OPENAI_A_KEY = '只在当前进程可见的密钥'
$env:CHEAP_OPENAI_B_KEY = '另一个渠道密钥'
$env:OPENAI_API_KEY = '保底密钥'
$env:DSH_COCKPIT_CLIENT_KEY = '给局域网客户端的访问密钥'
$env:DSH_COCKPIT_CONFIG = 'C:\Users\me\.dsh\cockpit-relay.json'
```

建议把密钥写入 DSH 的本机凭据/启动环境，不要写进 JSON、shell 历史、issue 或截图。

## 本地与局域网服务

默认只监听 `127.0.0.1:19529`。需要局域网共享时，将配置改为：

```json
"listen": {
  "enabled": true,
  "host": "0.0.0.0",
  "port": 19529,
  "apiKeyEnv": "DSH_COCKPIT_CLIENT_KEY"
}
```

然后使用 `http://<局域网IP>:19529/v1`，客户端访问密钥放在 `Authorization: Bearer <DSH_COCKPIT_CLIENT_KEY>`。局域网模式只适合可信网络；插件没有替代 TLS、ACL、VPN 或防火墙，勿直接暴露到公网。

## 模型支持

插件不把模型写死为 GPT。只要渠道提供下列协议之一即可：

- OpenAI Chat Completions：GPT、DeepSeek、Qwen、Kimi、Grok、Gemini OpenAI 兼容入口，以及各种中转模型。
- OpenAI Responses：支持 Responses 的 GPT/Codex 或兼容网关。
- Anthropic Messages：Claude 及兼容 Anthropic 协议的渠道，可通过 DSH 自带 `llm-pi-ai` 适配层接入。

同一个模型名只要出现在多个渠道的 `models` 中，就会自动组成一个故障转移池。模型目录是显式配置的，避免把上游私有模型错误宣传成一定可用。

## 与原 Cockpit API Service 的关系

原项目还包含 Rust/Tauri 管理、OAuth、Codex Agent Identity、配额同步、CLIProxyAPI Go sidecar、图片和 Gemini/Ollama 专用协议。完整边界和源码映射见根目录 [`docs/CODEX_API_SERVICE_HANDOFF.md`](../docs/CODEX_API_SERVICE_HANDOFF.md) 与 [`docs/DSH_PLUGIN_SCOPE.md`](../docs/DSH_PLUGIN_SCOPE.md)。本插件优先提供适合 DSH 的多渠道 LLM 路由；官方 OAuth 账号池仍建议使用上游桌面端生成的 sidecar。

## 许可与责任

上游项目默认为 CC BY-NC-SA 4.0，并有自己的贡献者和免责声明；本适配层保留署名并遵循非商业、相同方式共享要求。使用中转站、账号和模型时请遵守对应服务条款、当地法律及网络安全规则。
