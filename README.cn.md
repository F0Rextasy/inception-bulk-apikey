<div align="center">

```
██╗███╗   ██╗ ██████╗███████╗██████╗ ████████╗██╗ ██████╗ ███╗   ██╗
██║████╗  ██║██╔════╝██╔════╝██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║
██║██╔██╗ ██║██║     █████╗  ██████╔╝   ██║   ██║██║   ██║██╔██╗ ██║
██║██║╚██╗██║██║     ██╔══╝  ██╔═══╝    ██║   ██║██║   ██║██║╚██╗██║
██║██║ ╚████║╚██████╗███████╗██║        ██║   ██║╚██████╔╝██║ ╚████║
╚═╝╚═╝  ╚═══╝ ╚═════╝╚══════╝╚═╝        ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
```

# inception-bulk-apikey

**批量创建 Inception Labs (Mercury) 账户并自动生成 API 密钥 — 兼容 OpenAI 的推理 + 9Router 连接器。**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 快速开始](#-quick-start) · [🎁 免费额度](#-free-tier--how-much-you-get) · [🤖 模型](#-models--all-3-of-them) · [🧪 使用 API](#-how-to-use-the-api) · [✅ 已验证](#-verified-working--every-key-is-tested) · [🧭 工作原理](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ 选项](#️-cli-options) · [🛰️ 代理](#️-behind-a-proxy) · [🐞 问题反馈](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ 为什么会有这个工具

Inception Labs 通过 `api.inceptionlabs.ai/v1` 上兼容 OpenAI 的 API 提供 **Mercury** —— 扩散式 LLM 系列（`mercury-2`、`mercury-2.5`、`mercury-decide`）。控制台在**账户之下**签发密钥（`/dashboard/api-keys`），因此有用的单位是*每个密钥一个账户* —— 而不是从一个账户生成多个密钥。

该工具在真实的 Chrome 中走完整个流程，并且只有在实时 API 应答之后才记录密钥：

```
proxies.txt ─▶ 出口挑选 + 使用点探测（注册页面 + challenges.cloudflare.com）
                   │
                   ▼
  隔离的 Chrome 上下文 ─▶ platform.inceptionlabs.ai/auth/register
                             └─ 注册表单 ─▶ 提交
                                └─ POST /api/auth/register → 200 → /thank-you
                                   └─ 邮件："Verify your email address"（一次性链接）
                                      └─ 验证链接 ─▶ 登录 ─▶ /dashboard/api-keys ─▶ Create API Key
                                                                                       │
       GET  api.inceptionlabs.ai/v1/models            200  ◀── 实时验证 ────┐ │
       POST api.inceptionlabs.ai/v1/chat/completions  200  ◀─────────────────────────┘ ▼
                                                                                    keys.txt
```

## 🎁 免费额度 —— 你能获得多少

每个账户都以 **免费层级，含 100,000,000 免费 token** 开始 —— 有两种衡量方式：控制台显示 *"You are on the Free Tier — you have used 0 of your 100,000,000 free tokens"*，并且 `GET /api/usage?quota=1` 返回 `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}`。该额度是**按账户**计算的，且不会过期，因此一个新账户就是新的 1 亿。

| 项目 | 值 |
| --- | --- |
| 欢迎额度 | **100,000,000 token** 每账户 —— 无过期 |
| 需要银行卡 | **否** |
| 注册 | 在真实 Chrome 中 `POST /api/auth/register`（浏览器检查 + Turnstile）→ 验证邮件 → 登录 |
| 可扩展的单位 | **一个账户 = 一个密钥** → `--count N` 即 N 个 1 亿额度 |

> 💡 免费层级由 Inception Labs 设定，可能会变化。请在 [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) 查看实时数字 —— 并让工具自身的关卡来判定：

```bash
node src/cli.js verify --chat 30     # keys.txt 中的每个密钥都会被重新测试（模型 + 一次聊天调用）
```

## 🤖 模型 —— 全部 3 个

`models.json` 是已签发密钥对 `GET /v1/models` 的实时应答 —— **3 个 id**：

|模型|✓|
|---|---|
|`mercury-2.5`|✓|

对一个密钥的实时探测（正是验证器所做的事）：

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 如何使用 API

基础 URL 是 **`https://api.inceptionlabs.ai/v1`** —— 兼容 OpenAI。免费层级的密钥可直接应答聊天。

**任意 SDK / curl**

```python
from openai import OpenAI
client = OpenAI(base_url="https://api.inceptionlabs.ai/v1", api_key="<your key>")
print(client.chat.completions.create(model="mercury-2.5",
      messages=[{"role":"user","content":"hi"}]).choices[0].message.content)
```

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <key>" -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}]}'
```

**任何支持自定义基础 URL 的 agent**（Cursor、OpenCode、Kilo Code 等）：设置基础 URL 为 `https://api.inceptionlabs.ai/v1`，粘贴一个密钥，选择 `mercury-2` 或 `mercury-2.5`。

## 🛠 快速开始

```bash
git clone https://github.com/F0Rextasy/inception-bulk-apikey.git
cd inception-bulk-apikey

# 1) your proxy list, one exit per line (http://, socks5://, socks4:// or bare host:port)
printf 'socks5://127.0.0.1:1080\n' > proxies.txt

# 2) a mailbox broker on loopback — default 127.0.0.1:9700, fallback :9701 (contract below)

# 3) go
node src/launcher.js                 # interactive menu: mint / finish / verify / screen / settings
# or drive it directly:
node src/cli.js mint   --count 30    # fresh accounts, one key each
node src/cli.js verify --chat 30     # re-verify keys.txt (models + one chat completion each)
node src/cli.js screen --limit 400   # keep only proxy exits that reach the provider right now
```

运行过程中写入磁盘的内容：

| 路径 | 内容 |
| --- | --- |
| `keys.txt` | 密钥，**每行一个**，在密钥验证通过的那一刻追加（已被 git 忽略） |
| `%USERPROFILE%\\inception-keys.txt` | 同一列表的镜像，位于仓库之外 |
| `accounts.json` | 每次尝试一条记录：邮箱、密码、注册状态、密钥前缀 + 模型 id（已被 git 忽略） |
| [`models.json`](models.json) | 已签发密钥对 `GET /v1/models` 的应答 |
| `out/` | 运行日志（`mint.log`）、出口状态、待处理队列、每步的 DOM/网络/截图转储（已被 git 忽略） |

### 🖱️ 启动器

启动器 `src/launcher.js` 驱动 mint / finish / verify / screen（+ 9Router），并将 `count`/`conc` 存储在 `launcher.config.json` 中。它在头部显示 `proxies.txt` 和 `keys.txt` 的计数器。`node src/launcher.js --connect-9router` 会将已签发的密钥注册到本地 9Router。

## ✅ 已验证可用 —— 每个密钥都经过测试

只有在实时 API 用它应答之后，密钥才会被写入 `keys.txt`：

| 检查 | 调用 | 预期 |
| --- | --- | --- |
| 认证 + 模型列表 | `GET https://api.inceptionlabs.ai/v1/models` | `200` + 该账户的模型 id（`mercury-2`、`mercury-2.5`、`mercury-decide`） |
| 真实生成 | `POST https://api.inceptionlabs.ai/v1/chat/completions`（`mercury-2.5`） | `200` |

验证器以两个 `200` 为关卡 —— 任一调用出现 `401`/`403` 会立即判定该密钥失败，其他任何情况（网络、其他状态码）会在另一个出口上重试，最多 6 次。

```bash
node src/cli.js verify --chat 30    # 随时为你自己的文件复现这两项检查
```

## 🧭 工作原理

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: Inception Labs page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.inceptionlabs.ai/v1/chat/completions → real content = the key is live
```

每个账户使用一个隔离的 Chrome 上下文（`openContext` 为每个上下文提供自己的代理和存储）：

1. 从 broker 获取一个新邮箱；
2. 只有当某个出口**此刻**能应答**两段**探测时才会被分配 —— 注册页面必须应答 `2xx–4xx`，**并且** Turnstile 脚本主机必须应答 `200/301/302`（没有该组件就没有 token，没有 token 注册 POST 就会被拒绝）；
3. 注册：控制台的浏览器检查通过，表单填写完成，不可见的 Turnstile 生成其 token，`POST /api/auth/register` 将应用路由到 `/thank-you`；
4. 消费验证邮件，然后登录（无验证码；适用一个限速的预检查）；
5. `/dashboard/api-keys` → **Create API Key**：从一次性展示和创建密钥的网络响应中读取明文密钥；
6. 实时验证（`/v1/models` + 一次聊天补全）→ `keys.txt`。

## ⚙️ CLI 选项

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat 30        # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| 任务 | 标志 |
| --- | --- |
| `mint` | `--count 30·--workers 3 (max 4)·--broker 9700·--fallback-broker 9701·--mail-wait 300000ms·--pending-total 2400000ms·--burst-wait 75000ms·--model mercury-2.5·--stop-keys N (0 = whole count)·--exit-relay (pins bursts to one exit)·--port 9930 (CDP)` |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>`（先消费验证链接；省略则直接登录） · `--tag <name>`（转储前缀，`f1`） · `--port N`（`9925`） |
| `verify` | `--model <id>`（`mercury-2.5`） · `--chat N`（前 N 个密钥还会获得一次聊天补全，`30`） · `--only <key>`（只检查一个密钥而非整个文件） |
| `screen` | `--url <page>`（`https://platform.inceptionlabs.ai/login`） · `--out <file>` · `--concurrency N`（`8`） · `--timeout N` ms（`30000`） · `--limit N`（`1000`） · `--ok-min` / `--ok-max`（`200` / `399`） |

## 🛰️ 在代理之后

`proxies.txt`，每行一个出口。接受的格式（空行和 `#` / `//` 注释会被跳过；localhost/私有网段会被拒绝）：

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **使用点探测，两段：** 注册页面加上 Turnstile 脚本主机。探测结果持久化在 `out/exit-state.json` 中，已知不良的出口排在最后。
* **存在私有代理时优先使用：** `RESIDENTIAL_PROXIES=<file>`（或工具 `out/` 旁的 `residential-proxies.txt`）在文件存在的那一刻起就优先用于注册阶段；任何可到达 api 的出口都可用于廉价的 HTTP 工作。
* **带凭据的 HTTP 代理在任何地方都可用；** `socks5://user:pass@…` 行不能用于浏览器步骤（Chrome 无法应答 SOCKS 认证提示），但它仍可用于 `screen` 和 `verify`。

## 📄 文件

| 路径 | 内容 |
| --- | --- |
| `keys.txt` | 密钥，**每行一个**，在密钥验证通过的那一刻追加 —— 已被 git 忽略 |
| `accounts.json` | 每个账户一条记录：邮箱、密码、注册状态、密钥前缀 + 模型 id —— 已被 git 忽略 |
| [`models.json`](models.json) | 已签发密钥对 `GET /v1/models` 的应答（3 个 id） |
| `out/` | 运行日志（`mint.log`）、出口状态、待处理队列、每步的 DOM/网络/截图转储 —— 已被 git 忽略 |
| `proxies.txt` | 你的出口池，每行一个代理 —— 已被 git 忽略 |

## 🔌 连接到 9Router

[9Router](https://9router.com) 是一个自托管、兼容 OpenAI 的路由器。Inception 提供兼容 OpenAI 的端点（`https://api.inceptionlabs.ai/v1`），因此只需注册一次，你签发的每个密钥都会成为一个 provider-node 下的连接 —— 9Router 会在它们之间做负载均衡：

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

不带 `--api-key` 运行它会注册 `keys.txt` 中的**每一个**密钥。重复运行是幂等的：节点通过 `--prefix inception` 匹配，每个连接通过名称匹配（`inception-001`、`inception-002`、……），已注册的密钥会被保留不动。默认值：`--base http://localhost:20128`、`--password 123456`、`--name "Inception Labs"`、`--prefix inception`、`--base-url https://api.inceptionlabs.ai/v1`、`--model mercury-2.5`。

在 9Router 内部，这些密钥以如下形式提供：

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router` 会重新检查 `keys.txt` 并在一次运行中完成注册，而 `node src/launcher.js` 会从其菜单驱动相同的流程。

## 🔑 一个密钥能给你什么

| | |
| --- | --- |
| 🏢 提供商 | **Inception Labs** —— [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 提供商提供什么 | Mercury 扩散式 LLM —— 每个账户 1 亿免费 token，无过期，每个密钥一个账户 |
| 🔑 一个密钥能给你什么 | 一个作用域为其自身账户的 API 密钥：下方端点上的 3 个模型 id，按你计划的限制。配额存在于**账户**上，这正是该工具为每个密钥创建一个账户的原因 |
| 🌐 API 形态 | 兼容 OpenAI：`POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 你的数据 | 只联系 platform.inceptionlabs.ai 和你配置的收件箱后端；密钥留在你的机器上 |

## 🐞 问题反馈

Inception 更改了注册流程、Turnstile 组件、认证路由或 api-keys 端点？工具会在那一步停止并说明。**[提交 issue](../../issues)**，附上你运行的命令和确切的输出 —— `out/` 中每步的转储（DOM + 截图 + 网络）让失败可复现且不会泄露密钥。欢迎 PR。

## 📄 许可证

MIT © 2026 —— 见 [LICENSE](LICENSE)。

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey contributors

</div>