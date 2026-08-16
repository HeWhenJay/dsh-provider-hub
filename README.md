# DSH Cockpit Relay

这是一个 DSH Host 插件，将 Cockpit Tools API Service 的“多渠道、优先/保底、健康故障转移、本地/LAN 共享”思路提取为轻量网关。

它不把 API Key 写进仓库、日志或接口响应；渠道只保存环境变量名。默认仅监听 `127.0.0.1`。切换到 `0.0.0.0` 时必须配置客户端访问密钥，否则插件拒绝启动。

## 安装

```powershell
dsh plugin --profile web add https://github.com/HeWhenJay/dsh-cockpit-relay.git
```

把 `cordis.patch.yml` 加入 profile patch/bundle。配置文件路径默认是启动目录下的 `cockpit-relay.json`，也可指定：

```powershell
$env:DSH_COCKPIT_CONFIG = 'C:\Users\me\.dsh\cockpit-relay.json'
```

## 配置多个渠道

复制 `config.example.json` 为 `cockpit-relay.json`。每个 route 配置：

- `id` / `displayName`：渠道标识和显示名。
- `baseURL`：通常填到 `/v1`。
- `api`：`openai-completions` 或 `openai-responses`。
- `apiKeyEnv`：保存真实 Key 的环境变量名；不要写真实 Key。
- `models`：渠道能服务的客户端模型 ID。留空表示接受任意模型名。
- `modelAliases`：客户端模型名到该渠道真实模型名的映射。
- `priority`：越大越优先。
- `backup: true`：只在所有普通渠道不可用时使用，适合官方或正常价格保底。

```powershell
$env:CHEAP_OPENAI_A_KEY = '渠道 A 密钥'
$env:CHEAP_OPENAI_B_KEY = '渠道 B 密钥'
$env:OPENAI_API_KEY = '官方保底密钥'
```

同一个模型出现在多条 route 中，就形成故障转移池。429、常见 5xx 和网络连接故障会让渠道进入短暂冷却；请求会继续尝试下一条健康渠道。会话亲和默认开启，但不会把请求重新绑回冷却渠道。

## 在 DSH 中使用

本插件负责 HTTP 路由，DSH 的模型消息、工具调用、Reasoning 和协议适配交给内置 `llm-pi-ai`。在 `$DSH_HOME/settings.yaml` 添加：

```yaml
llm-pi-ai:
  providers:
    cockpit-relay:
      displayName: Cockpit Relay
      api: openai-completions
      baseURL: http://127.0.0.1:19529/v1
      apiKeyEnv: DSH_COCKPIT_CLIENT_KEY
      models:
        - id: gpt-4o-mini
          name: GPT-4o mini
          contextWindow: 128000
          maxTokens: 16384
        - id: deepseek-chat
          name: DeepSeek Chat
          contextWindow: 128000
          maxTokens: 8192
        - id: claude-3-7-sonnet
          name: Claude 3.7 Sonnet via Relay
          contextWindow: 200000
          maxTokens: 8192
```

本机模式可以不设置客户端 Key；若 `llm-pi-ai` 要发送 Authorization，则让 `DSH_COCKPIT_CLIENT_KEY` 与网关配置一致。局域网模式必须设置：

```powershell
$env:DSH_COCKPIT_CLIENT_KEY = '一条单独生成的局域网访问密钥'
```

客户端 Base URL：

- 本机：`http://127.0.0.1:19529/v1`
- 局域网：`http://<本机局域网IP>:19529/v1`

支持 `/v1/models`、`/v1/chat/completions`、`/v1/responses`、`/health` 和 CORS 预检。

## 模型范围

插件不限制 GPT。只要上游提供 OpenAI-compatible Chat Completions 或 Responses，就能配置：

- OpenAI / Codex / GPT
- Claude 的 OpenAI-compatible 中转入口
- Gemini 的 OpenAI-compatible 入口
- DeepSeek、Qwen、Kimi、Grok、GLM、MiniMax、Mistral、Llama 等

原生 Anthropic Messages 不由该轻量网关转换；DSH 自带 `llm-pi-ai` 已支持 `anthropic-messages`，可单独直连原生 Claude 渠道。原 Cockpit sidecar 还支持 Anthropic、Gemini、Ollama、图片、Codex OAuth/Agent Identity 等更完整协议，源码边界见 `CODEX_API_SERVICE_HANDOFF.md` 和 `DSH_PLUGIN_SCOPE.md`。

## 安全说明

- API Key 只从环境变量读取，不提交到 GitHub。
- LAN 模式必须启用客户端 Key，但仍建议只在可信局域网/VPN中使用。
- 此插件不提供 TLS、用户级 ACL 或公网防护；不要把端口直接暴露到公网。
- 使用中转站或多个账号时，请遵守对应平台服务条款、账号规则和当地法律。

## 许可

上游 Cockpit Tools 默认使用 CC BY-NC-SA 4.0。本适配层保留署名并以相同许可发布，仅用于非商业学习、研究和个人使用。
