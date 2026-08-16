# DSH 插件范围与上游 API Service 代码边界

## 上游审查结论

本仓库基于 `jlcodes99/cockpit-tools` fork。API Service 相关代码不是 GPT-only：

- Rust 协调层：`src-tauri/src/modules/codex_local_access.rs`、`src-tauri/src/models/codex_local_access.rs`、`src-tauri/src/commands/codex.rs`
- OpenAI 兼容网关：`sidecars/cockpit-cliproxy/main.go`
- CLIProxyAPI 协议与账号实现：`sidecars/cockpit-cliproxy/cdk/CLIProxyAPI/`
- 协议入口包括 OpenAI Chat Completions、Responses、Anthropic Messages、Gemini、Ollama，以及 Codex 专用 Responses 路径。

详细流向、端点、路由和安全边界见 [`CODEX_API_SERVICE_HANDOFF.md`](./CODEX_API_SERVICE_HANDOFF.md)。

## DSH 适配取舍

`dsh-plugin/` 没有把 Tauri 桌面 UI、Rust 生命周期和完整 CLIProxyAPI sidecar 强行塞进 Cordis。它提供同一服务目标的轻量 Host 适配层：

1. 从本机 JSON 配置加载多个 OpenAI-compatible 渠道；原生 Anthropic Messages 由 DSH 自带 `llm-pi-ai` 适配层负责。
2. API Key 只通过 `apiKeyEnv` 引用环境变量，配置文件可以安全提交和复制。
3. 每个模型按正常渠道优先级选择；全部正常渠道失败后才进入 `backup: true` 渠道。
4. 渠道失败进入短暂冷却；同一 session 默认保持亲和，但健康检查失败时自动换渠道。
5. Host 有 `webServer` 时暴露 `/v1/models`、`/v1/chat/completions` 和 `/v1/responses`，可以绑定 `127.0.0.1` 或 `0.0.0.0`。
6. 插件提供本地 OpenAI-compatible HTTP 网关；DSH 内置 `llm-pi-ai` 指向该网关后，可共同服务 GPT、Claude、DeepSeek、Gemini、Qwen、Kimi、Grok 等模型。工具调用、Reasoning 和模型消息转换由 DSH 正式 LLM 适配层处理。

这层适配不会复制或泄露上游账号凭据，也不会绕过上游服务条款。官方 OAuth/Codex 账号池仍应使用上游 Cockpit 的 sidecar 方案；本插件重点解决低价中转站和多个 API Key 的本地聚合。
