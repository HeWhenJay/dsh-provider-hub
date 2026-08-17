# DSH Provider Hub

`@hewhenjay/dsh-provider-hub` 是面向 DeepSeek Harness（DSH）的独立本地模型服务中心。它把 API Key 渠道、OpenAI-compatible 中转站和 Codex / Claude / Gemini 官方账号放进同一套路由、故障切换与日志界面中。

安装 Provider Hub 不要求安装 Cockpit Desktop，也不会读取、停止或接管已有 Cockpit 服务。官方账号能力由插件自行管理的 loopback sidecar 提供；sidecar 使用上游 CLIProxyAPI 的固定版本，并在首次安装时校验官方 SHA-256。

## 界面预览

![Provider Hub 服务总览](docs/images/provider-hub-dashboard.png)

页面顶部显示实际 Relay 地址、运行状态和 DSH 供应商同步状态；下方可在 **供应商**、**官方账号** 和 **日志** 之间切换。

## 夜间稳定代理：多 API 薅羊毛也有兜底

Provider Hub 可以同时代理多个 API 提供商、同一地址下的多个 API Key，以及每个 Key 支持的多个模型。适合把免费额度、活动额度或低成本渠道放在前面持续使用，同时保留一个稳定渠道作为最后兜底：

1. 为每个 API Key 建立独立渠道，设置容易识别的 Key 名称、模型白名单和优先级；同一 Base URL 可重复使用，不同 Key 互不覆盖。
2. 免费或低成本渠道设为普通渠道并提高优先级；稳定的付费渠道勾选为保底渠道。
3. 请求遇到限流、连接重置或 `408`、`409`、`425`、`429`、`5xx` 等瞬时故障时，当前渠道会进入冷却，Provider Hub 自动尝试下一个匹配模型的 Key。
4. 普通渠道全部不可用后才进入保底渠道，因此晚上可以一边消耗免费额度，一边依靠稳定 Key 防止单一 API 提供商宕机导致整条服务停止。
5. 会话粘性会优先复用已经成功的健康渠道；渠道失效后自动重选，无需守在电脑前手工切换。

故障切换无法保证第三方服务永不失败，但可以消除单一提供商或单一 Key 故障这一处明显单点。请遵守各 API 提供商的服务条款、限流政策和合理使用规则。

## 自动模型规格

渠道保存或官方账号发现新模型后，Provider Hub 会自动调用 DSH 的联网检索服务，并使用 Provider Hub 中第一个已配置 API Key 的第一个可用文本模型处理证据；生图、音频、嵌入、重排等模型会自动排除。若没有可用的 Provider Hub 文本模型，才回退到 DSH 当前默认模型。用户也可以在 **模型规格** 页选择具体 API Key 渠道与文本模型，并点击 **一键填写规格**。插件分别检索上下文、最大输出和思考档位，并把 DSH 搜索提供方返回的真实引用摘录标记为 `search-citation` 证据；对可直接访问的 HTTPS 来源还会在公网地址校验（含压缩/展开 IPv4-mapped IPv6 的数值规范化）、固定 DNS 解析、禁止重定向、端到端硬截止与大小限制下读取页面正文并标记为 `page-content`。URL、标题和抓取失败状态本身不能证明任何字段，私网或不安全来源会被直接淘汰。资料来源采用“厂商官方优先、平台官方补充、社区共识兜底”：

- 思考程度及其准确 API wire 值；
- 上下文窗口；
- 最大输出窗口；
- 兼容的思考格式与官方证据来源。

每个字段由所选 LLM 根据联网搜索和可读取来源整理；查到多少填写多少，部分结果允许保存并标记为“LLM 查询结果（可编辑）”。系统只做基础格式、数值和模型身份检查，不再要求同一句证据、多个社区域名一致或所有字段同时被官方证明。来源仍会展示供用户复核和手动修改；私网/不安全来源、密钥和凭据不会进入查询。**上下文窗口**区分“最大支持窗口”和“推荐运行窗口”：如果来源只证明最大值，Provider Hub 默认取最大值的四分之一作为压缩窗口，避免把 1M 上限直接当作实际运行窗口；若来源明确给出推荐值则优先使用推荐值。**模型规格**页会明确显示本次使用的 API Key 名称、渠道与文本模型，并按字段标注“厂商官方证据”“平台官方证据”或“社区共识”。配置页会逐模型展示已填写字段、待补全字段、实际支撑来源和失败原因；页面始终提供 **一键填写规格** 按钮，用户可随时重新检索并刷新已填写字段。验证通过的内容会热同步到 DSH 自动管理的 `provider-hub` 模型供应商，无需为单次补全重启 Web。

![逐模型查看完整、部分补全、缺少证据与失败状态](docs/images/provider-hub-model-specs.png)

## 能力概览

- DSH Web 独立入口：与任务看板、SSH、知识库同属左侧栏上方的应用入口，点击后进入专用中心页面。
- 内置官方账号服务：OpenAI / Codex、Anthropic / Claude、Google / Gemini 官方 OAuth。
- API Key 渠道：官方 API、中转站、本地网关或其他 OpenAI-compatible 服务；同一 Base URL 可配置多个独立命名的 Key。
- 每 Key 模型白名单：留空允许该 Key 的全部上游支持模型，填写后只允许精确列出的模型进入该 Key。
- 模型发现：优先复用 DSH 自带的一键模型发现，失败时直接读取供应商 `/models`。
- 聚合 OpenAI-compatible API：`/v1/models`、`/v1/chat/completions`、`/v1/responses`。
- 自动接入 DSH Models：服务启动后按实际监听端口创建 `provider-hub` 供应商，并同步每个 Key 白名单过滤后的聚合模型目录。
- 路由控制：优先级、普通/保底渠道、瞬时故障冷却、最大尝试次数、会话粘性和模型别名。
- 安全凭据：首次启动自动生成以 `Provider-Hub-` 开头的 Relay 客户端 API Key，一次性展示给用户复制；实际密钥写入 DSH credentials，JSON 配置仅保存凭据引用，用户可在服务设置中替换。
- 脱敏日志与计费：规格研究调用会单独标记 `purpose: model-spec-research`，并记录其路由 Key、模型、状态、Token、思考程度、耗时和费用，但不记录研究提示词或完整响应。Provider Hub 为每次请求生成自己的 UUID（不持久化调用方 `X-Request-ID`），逐次尝试展示请求 ID、Key 名称、模型与上游模型、协议、重试、HTTP 状态、finish reason、输入/缓存/输出/推理/总 Token、首 Token 与完整耗时。客户端断开会取消上游请求并标记失败，Relay 遵守写入背压；合法的多行 SSE 事件也能正确解析 usage。Token 优先采用供应商 usage，部分 usage 帧只覆盖实际存在的字段，不会清除早先记录；缺失时明确标记本地估算；费用优先采用供应商报告，其次按渠道配置的每百万 Token 单价估算，再其次使用模型规格研究得到的官方参考价；来源分别标记为 `provider-reported`、`route-pricing`、`model-spec-pricing`；只有本次实际使用的普通输入、缓存输入、普通输出和推理 Token 类别都存在明确单价时才计算总费用，任一实际类别缺价就显示“未配置”，绝不把未知价格默认为免费。Anthropic 风格的 `cache_read_input_tokens` 作为附加输入累计，而不是误当成 `input_tokens` 的子集。日志不记录提示词、完整响应、密钥、凭据引用或完整上游 URL。
- 非侵入端口避让：端口被占用时只选择后续空闲端口，绝不按端口结束其他进程。

![请求级 Token、性能与计费日志](docs/images/provider-hub-logs.png)

## 安装

要求：DSH `0.1.0-rc.6` 或兼容版本、Node.js 20+，以及首次安装内置账号服务时可访问 GitHub Releases。

从 GitHub tag 安装：

```bash
dsh plugin --profile web add github:HeWhenJay/dsh-provider-hub#v0.6.16
```

也可以下载 GitHub release 中的 `hewhenjay-dsh-provider-hub-0.6.16.tgz` 后安装：

```bash
dsh plugin --profile web add ./hewhenjay-dsh-provider-hub-0.6.16.tgz
```

npm 包名已预留为 `@hewhenjay/dsh-provider-hub`，但 v0.6.16 当前以 GitHub tag 和 release 资产为正式发布渠道。Host 与 Web Client 通常在下次安全重启 `dsh web` 后加载。不要为了安装插件停止当前正在承载会话或模型调用的服务；可在方便时重启并刷新 DSH Web 页面。

安装后可从左侧栏上方的 **Provider Hub** 应用入口进入。它位于任务看板之后，点击后在中间区域打开独立页面；旧的侧栏底部入口和 Settings 页面入口已移除。

![从 DSH 左侧栏打开 Provider Hub 独立页面](docs/images/provider-hub-entry.png)

### 首次启动生成的客户端 Key

全新安装第一次启动 Relay 时，如果 `listen.apiKeyEnv` 对应凭据不存在，Provider Hub 会生成 `Provider-Hub-<安全随机值>` 并写入 DSH credentials。独立页面顶部会一次性显示完整 Key：

1. 点击 **复制 Key** 并保存到可信密码管理器；
2. 点击 **我已保存** 后，页面立即清除内存中的明文，后续只显示“已配置”；
3. JSON 配置与请求日志均不保存或输出完整 Key；
4. 需要轮换时打开 **服务设置 → 新的客户端访问密钥**，输入自定义值并保存。手动值不强制使用自动前缀，避免破坏已有客户端配置。

该 Key 用于访问 Provider Hub 自己的 Relay，不是供应商 API Key。DSH 自动管理的 `provider-hub` 模型供应商会使用对应凭据引用，不需要把明文复制进配置文件。

## 新用户快速上手

安装并安全重启 `dsh web` 后，按下面两种方式任选一种接入模型。已有 Cockpit 或其他 DSH 供应商不会被关闭或替换。

### 方式一：添加 API Key 或中转渠道

1. 点击左侧栏的 **Provider Hub**，确认页面顶部显示“Provider Hub 运行中”。
2. 保持在 **供应商** 标签，点击右上角的 **添加供应商**。
3. 填写渠道 ID、渠道显示名称、API Key 名称和 Base URL。API Key 名称用于区分同一 Base URL 下的多个 Key，也会显示在请求日志中；不会发送给上游。
4. API Key 输入实际密钥；“凭据变量名”会随渠道 ID 自动生成。密钥只写入 DSH credentials，不会保存在 `provider-hub.json`。
5. 选择 Chat Completions 或 Responses 协议，点击 **获取全部模型**。确认上游支持模型后，可填写当前 Key 的 **白名单模型路由**；支持逗号或换行分隔，留空表示允许该 Key 的全部上游支持模型。
6. 设置当前 Key 的优先级；需要最后兜底时勾选保底渠道。若同一 Base URL 还要使用另一个 Key，请创建一个不同渠道 ID 的新渠道，并为它设置独立的 Key 名称、凭据、优先级和白名单。
7. 点击 **保存渠道**，回到供应商卡片后点击 **测试**。

![为渠道设置 API Key 名称和 Base URL](docs/images/provider-hub-add-route.png)

![为当前 API Key 设置模型白名单](docs/images/provider-hub-route-allowlist.png)

图中 API Key 保持为空，仅演示安全的字段填写方式。新渠道的默认凭据引用是 `DSH_PROVIDER_HUB_<CHANNEL_ID>_KEY`：渠道 ID 会转成大写，所有非字母数字字符替换为下划线，例如 `openai-official` → `DSH_PROVIDER_HUB_OPENAI_OFFICIAL_KEY`。

### 方式二：登录官方账号

1. 打开 **Provider Hub → 官方账号**。
2. 如账号服务尚未安装，点击 **安装并启动**；首次安装会下载固定版本并验证官方 SHA-256。
3. 选择 **登录 OpenAI / Codex**、**登录 Anthropic / Claude** 或 **登录 Google / Gemini**。
4. 在浏览器完成官方 OAuth 授权。
5. 返回 DSH；页面会轮询授权状态并自动刷新账号与模型。

![登录 Codex、Claude 或 Gemini 官方账号](docs/images/provider-hub-accounts.png)

账号服务启动后，Provider Hub 会生成一个只存在于运行时的内部渠道。它使用 sidecar 返回的模型目录和账号服务优先级参与统一路由，不会把内部访问密钥返回浏览器，也不会把内部渠道写进 `routes` 配置。

OAuth 使用官方固定的 localhost 回调端口：

| 供应商 | 回调端口 |
|---|---:|
| OpenAI / Codex | 1455 |
| Anthropic / Claude | 54545 |
| Google / Gemini | 8085 |

Provider Hub 只在 `127.0.0.1` 上临时监听对应端口并校验 OAuth state。若端口已被占用，登录会明确失败；插件不会关闭占用者。释放端口后重新发起登录即可。

### 自动补全官方模型规格

渠道保存或官方账号提供新模型列表后，Provider Hub 会自动在后台逐个处理尚未配置的可识别模型；无需用户手动启动：

1. 通过 DSH 的联网检索服务分别查询上下文窗口、最大输出与思考档位，官方来源优先，同时保留社区候选；
2. 合并每次查询的引用摘要，并在安全约束下读取可访问来源的页面正文，再交给用户选定的 Provider Hub API Key 与文本模型生成严格 JSON；
3. 只接受明确关联精确模型 ID 与字段的证据；厂商官方来源可直接证明字段，厂商页面不可访问时成功抓取的可信平台官方模型卡/目录可作为平台官方证据，没有官方资料时必须由两个独立注册域达成一致。`thinkingFormat` 还必须与已识别厂商匹配，否则省略该兼容字段；
4. 对最大上下文、推荐运行上下文、`maxTokens` 和 `reasoningEfforts` 分别验证；只有最大上下文时按最大值四分之一派生推荐压缩窗口，查到的字段写入，没查到的字段保持空白；
5. 将验证通过的字段、兼容配置和来源 URL 写入 `provider-hub.json`，再热同步到自动管理的 `llm-pi-ai.providers.provider-hub`。

任务会静默在 Host 后台运行，页面显示当前模型和进度，可以关闭 Provider Hub 页面后继续使用 DSH。再次打开页面可在 **模型规格** 区域逐模型查看推荐上下文窗口、最大支持窗口、最大输出窗口、思考程度、待补全字段、厂商/平台官方来源和失败原因。单次最多处理 100 个模型；超长模型 ID、无法识别厂商、没有官方证据或模型输出不符合结构时，对应字段保持空白，插件不会用模型记忆猜测规格。用户可随时点击 **一键填写规格** 重新检索并刷新字段。渠道删除模型时会清理对应的孤立规格，研究期间被删除的模型不会写回配置。

这项功能会消耗 DSH 联网检索与当前默认模型的调用额度；每个新模型在一次自动补全中只尝试一次，不会因保存或刷新形成无限循环。手动重试由用户明确触发。执行补全和配置热同步本身不需要重启 Web。

### 确认模型已自动接入 DSH

保存渠道、完成官方账号登录或自动补全模型规格后，页面顶部会显示 `DSH 供应商已同步（N 个模型）`。此时打开 DSH 的模型选择器即可看到 `Provider Hub` 提供的模型，无需再手工创建模型供应商。

如果仍显示“等待可用模型”，请先确认渠道的模型列表不为空，或在 **官方账号** 标签点击 **刷新账号**。插件不会自动切换当前会话或默认模型，用户可在模型选择器中自行选择。

## 自动接入 DSH Models 的规则

Provider Hub 默认在 `127.0.0.1:19529` 提供统一接口。服务成功启动且聚合目录至少包含一个模型后，插件会通过 DSH 官方 settings 服务自动创建或更新 `llm-pi-ai.providers.provider-hub`：

- Base URL 使用页面显示的实际地址，包括端口冲突后的自动避让端口；
- API 固定为 OpenAI Chat Completions；
- 模型从 Provider Hub 的聚合 `/v1/models` 目录读取、去重；每个 Key 非空白名单之外的模型不会进入聚合目录，并尽可能保留名称、上下文窗口和最大输出长度；
- 首次启动会自动生成客户端访问密钥；只要凭据已经配置，自动管理的供应商在本机与 LAN 模式下都会声明对应 `apiKeyEnv`，使 `llm-pi-ai` 能在请求前解析 Relay Key。Relay 的 loopback 兼容规则仍允许受控的本机无 Origin 请求，但 DSH 正常模型调用会携带该 Key；
- 渠道、官方账号或 sidecar 模型变化后会自动重新同步。

插件只管理 `provider-hub` 这一条供应商，不修改其他供应商，也不会切换 `agent-default-model`。如果用户已经手工创建了同名条目，插件会报告冲突并保持原配置不变。旧版本所有权快照仅缺少后来加入的 Relay `apiKeyEnv`，且当前条目的其他字段逐项完全一致、凭据引用也精确等于当前 Relay 配置时，插件会安全迁移快照；任何其他字段或凭据引用差异仍保持冲突。Relay 停止、禁用或聚合模型为空时，插件只删除经自身确认创建的条目；模型为空时状态显示为等待，不写入 DSH 无法使用的空模型供应商。

实际 Base URL 仍会显示在页面顶部，例如：

```text
http://127.0.0.1:19529/v1
```

## 路由规则

对每次请求，Provider Hub 按以下顺序选择渠道：

1. 先按当前 API Key 的 `modelAllowlist` 过滤：空白名单允许该 Key 的全部上游支持模型；非空白名单只接受精确列出的请求模型 ID，模型别名不能绕过白名单。
2. 再验证请求模型是否存在于渠道的上游支持模型目录；上游目录为空时视为不额外限制。
3. 普通渠道按优先级从高到低排序。
4. 保底渠道按优先级从高到低排在普通渠道之后。
5. 遇到 `408`、`409`、`425`、`429`、`500`、`502`、`503`、`504` 或连接重置时，将当前 Key 渠道暂时冷却。
6. 在 `maxAttempts` 范围内尝试后续渠道；相同 Base URL 的另一个 Key 只要是独立渠道且匹配模型，也可成为后续候选。
7. 启用会话粘性时，同一 session 优先复用已成功的健康渠道；失效时自动重选。

内置官方账号渠道默认优先级为 `1000`，可在账号服务设置中修改。它与自定义 API 渠道使用相同排序规则。自定义渠道可标记为保底。

模型别名是“Provider Hub 对外模型 ID → 供应商真实模型 ID”的映射，例如：

```json
{
  "gpt-main": "vendor-gpt-2026-01"
}
```

客户端请求 `gpt-main` 时，该渠道会把模型名改写为 `vendor-gpt-2026-01`。

## 内置账号 sidecar

Provider Hub 当前固定使用：

- 上游项目：[`router-for-me/CLIProxyAPI`](https://github.com/router-for-me/CLIProxyAPI)
- 版本：`v7.2.133`
- 许可证：MIT
- 下载源：该项目的官方 GitHub Release
- 完整性：先下载 `checksums.txt`，再按精确资源名校验 SHA-256

支持 Windows、macOS 和 Linux 的 x64 / arm64。文件位于 `$DSH_HOME/provider-hub/sidecar`：

```text
provider-hub/sidecar/
├─ auth/                  # 官方账号授权文件
├─ bin/7.2.133/           # 已校验的 sidecar 可执行文件
├─ downloads/             # 临时下载目录（成功后清理）
└─ config.yaml            # 仅本机配置
```

安全与生命周期边界：

- 固定监听 `127.0.0.1`；
- 首选端口 `19629`，被占用时最多向后搜索 49 个端口；
- Management API 禁止远程访问，内置控制面板关闭；
- client key 与 management key 随机生成并写入 DSH credentials；
- 插件只保存并终止自己启动的子进程，绝不根据端口查杀进程；
- 下载、安装或启动失败只影响官方账号渠道，不妨碍自定义 API 渠道和 Provider Hub relay 启动。

关闭“未安装时自动下载”后，启动缺失的 sidecar 会显示“未安装”，不会访问网络。仍可在页面中手动点击 **安装并启动**。

## 配置

默认配置文件是 `$DSH_HOME/provider-hub.json`。完整示例见 `config.example.json`：

```json
{
  "provider": "provider-hub",
  "maxAttempts": 6,
  "cooldownMs": 30000,
  "sessionAffinity": true,
  "listen": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 19529,
    "apiKeyEnv": "DSH_PROVIDER_HUB_CLIENT_KEY"
  },
  "accountService": {
    "enabled": true,
    "autoInstall": true,
    "port": 19629,
    "priority": 1000
  },
  "managedProvider": {
    "enabled": true,
    "id": "provider-hub",
    "displayName": "Provider Hub"
  },
  "routes": [
    {
      "id": "shared-prod",
      "displayName": "Shared API",
      "keyName": "Production Key",
      "baseURL": "https://relay.example/v1",
      "api": "openai-completions",
      "apiKeyEnv": "DSH_PROVIDER_HUB_SHARED_PROD_KEY",
      "priority": 100,
      "backup": false,
      "models": ["gpt-main", "gpt-fast"],
      "modelAllowlist": ["gpt-main"]
    },
    {
      "id": "shared-backup",
      "displayName": "Shared API",
      "keyName": "Backup Key",
      "baseURL": "https://relay.example/v1",
      "api": "openai-completions",
      "apiKeyEnv": "DSH_PROVIDER_HUB_SHARED_BACKUP_KEY",
      "priority": 10,
      "backup": true,
      "models": ["gpt-main", "gpt-fast"],
      "modelAllowlist": []
    }
  ]
}
```

环境变量 `DSH_PROVIDER_HUB_CONFIG` 可指定其他配置路径。渠道 ID 必须唯一；Base URL 不要求唯一，因此同一地址可以配置多个使用不同凭据引用的 Key。`keyName` 是可进入日志的显示名称；`modelAllowlist: []` 表示允许该渠道 `models` 中的全部模型，非空时只发布和路由其中精确列出的模型。

### 端口与监听安全

- Relay 默认只监听 `127.0.0.1:19529`。
- sidecar 始终只监听 `127.0.0.1`，首选 `19629`。
- 两者发生端口冲突时都会向后寻找空闲端口，不会关闭原监听器。
- 首次启动会自动生成以 `Provider-Hub-` 开头的客户端访问密钥；改为 `0.0.0.0` 时继续使用该密钥认证。
- 不要把 relay 直接暴露到公网；远程使用应配合防火墙、VPN 或带认证的反向代理。

## HTTP 接口

统一 relay：

```text
GET  /health
GET  /v1/models
POST /v1/chat/completions
POST /v1/responses
```

DSH Host 管理接口（供插件 Web UI 使用）。`GET /logs` 返回 `{ logs, summary }`：明细按渠道尝试记录 usage、性能和计费依据；summary 按 Provider Hub 生成的 requestId 聚合客户端请求，同时分别给出请求数、渠道尝试数、故障切换数与失败尝试数。成功/失败和平均耗时按完整客户端请求计算，Token 与费用按所有实际渠道尝试累计，因为失败尝试也可能产生真实用量：

```text
GET    /api/provider-hub/state
GET    /api/provider-hub/logs
DELETE /api/provider-hub/logs
PUT    /api/provider-hub/service
POST   /api/provider-hub/models/discover
GET    /api/provider-hub/models/research
POST   /api/provider-hub/models/research
POST   /api/provider-hub/routes
DELETE /api/provider-hub/routes/:id
POST   /api/provider-hub/routes/:id/test

GET    /api/provider-hub/account-service
PUT    /api/provider-hub/account-service
POST   /api/provider-hub/account-service/install
POST   /api/provider-hub/account-service/start
POST   /api/provider-hub/account-service/stop
POST   /api/provider-hub/account-service/refresh
POST   /api/provider-hub/account-service/oauth/:provider/start
GET    /api/provider-hub/account-service/oauth/status?state=...
PATCH  /api/provider-hub/account-service/accounts/:id/status
DELETE /api/provider-hub/account-service/accounts/:id
```

管理响应只返回脱敏状态。sidecar client key、management key、供应商 API Key、OAuth token 和账号文件内容不会返回 Web Client。

## 从 DSH Cockpit Relay 迁移

v0.3 更名为 DSH Provider Hub，并从“桥接外部 Cockpit”迁移为独立内置账号服务。

1. 如果 `$DSH_HOME/provider-hub.json` 已存在，直接使用新文件。
2. 否则若 `$DSH_HOME/cockpit-relay.json` 存在，读取旧配置、按新结构规范化并写入 `provider-hub.json`。
3. 旧文件保留，不删除、不覆盖。
4. 旧渠道的凭据引用（例如 `COCKPIT_RELAY_*`）原样保留，因此不会丢失已有 DSH credential。
5. 新建渠道使用 `DSH_PROVIDER_HUB_*` 命名。
6. `/api/cockpit-relay` 暂时作为管理 API 兼容别名保留；新 Web Client 只调用 `/api/provider-hub`。

迁移不会修改当前 DSH 默认模型，也不会接管任何已经监听的 Cockpit 端口。Provider Hub 自 v0.4 起只会新增并管理独立的 `provider-hub` 模型供应商；其他 DSH Models 条目保持不变。

## 故障排查

- **Provider Hub 显示不同端口**：首选端口已占用。使用页面显示的实际 Base URL，不要关闭未知监听器。
- **账号服务安装失败**：确认 GitHub Releases 可访问、DSH Home 可写、系统架构受支持。SHA-256 不匹配时插件会删除下载并拒绝执行。
- **OAuth 无法开始**：固定 localhost 回调端口可能已占用。插件不会抢占；释放相应端口后重试。
- **OAuth 完成后没有模型**：点击 **刷新账号**，检查账号是否停用或暂不可用；也可保留 API Key 渠道作为普通或保底路径。
- **DSH 中没有自动出现 Provider Hub**：确认 relay 正在运行且至少有一个可用模型；零模型时插件会等待，不创建无效供应商。
- **模型规格没有自动补全**：确认 DSH 已配置可用的默认模型和联网检索服务，并且 Provider Hub 至少有一个可安全识别厂商的新模型。
- **日志费用显示“未配置”**：上游没有返回 cost，或当前渠道没有为本次实际使用的每一种 Token 类别配置每百万 Token 单价。只配置输入价但请求产生了输出，不会把输出误算为免费。在渠道编辑器填写“模型价格 JSON”后，新请求会按输入、缓存输入、输出与推理 Token 分别估算；历史日志不会追溯重算。
- **部分字段仍显示“待补全”**：搜索引用与可访问正文都没有证明该字段，或思考程度缺少准确 API wire 值。其他已被证据证明的字段仍会保留；插件不会猜测空白字段。
- **需要再次尝试**：打开 **模型规格** 标签并点击 **一键填写规格**；可先选择具体 API Key 与文本模型。
- **补全后是否需要重启**：不需要。规格写入后由 DSH settings 热更新；只有安装或升级 Provider Hub 插件本身时，才需要用户在方便时自行重启 `dsh web`。
- **显示同名供应商冲突**：DSH 已存在非插件创建的 `provider-hub` 条目。插件不会覆盖它；请先在 Models 中改名或删除该条目再刷新 Provider Hub。
- **DSH 无法访问 relay**：使用实际 Base URL；检查 relay 开关和 `DSH_PROVIDER_HUB_CLIENT_KEY` 凭据。首次自动生成的 Key 可在页面一次性复制，之后也可在服务设置中替换。

## 开发与验证

```bash
npm test
npm pack --dry-run
```

测试覆盖路由优先级、每 Key 模型白名单、同 URL 多 Key、别名绕过防护、保底与冷却、流式响应、端口避让、凭据不落盘、Key 名称日志与脱敏、模型发现、官方来源模型规格补全与拒绝边界、DSH 供应商同步与冲突保护、账号管理契约、OAuth state 限制、sidecar 资源映射与 checksum 解析、打包边界和浏览器模块注册。

## 许可与第三方组件

Provider Hub 插件代码按仓库 `LICENSE`（CC BY-NC-SA 4.0）发布。左侧应用入口中的 Network 图标来自 [Lucide](https://lucide.dev/icons/network)，按 ISC License 使用。内置账号服务二进制不打进 npm 包；首次使用时从 CLIProxyAPI 官方 Release 下载。CLIProxyAPI 由其作者按 MIT License 发布。使用官方账号、API Key、中转服务和多账号路由时，请遵守对应平台服务条款、账号政策和当地法律。
