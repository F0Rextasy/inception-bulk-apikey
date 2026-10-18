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

**Bulk-create Inception Labs (Mercury) accounts with auto-generated API keys — OpenAI-compatible inference + 9Router connector.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Quick start](#-quick-start) · [🎁 Free tier](#-free-tier--how-much-you-get) · [🤖 Models](#-models--all-3-of-them) · [🧪 Use the API](#-how-to-use-the-api) · [✅ Verified](#-verified-working--every-key-is-tested) · [🧭 How it works](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Options](#️-cli-options) · [🛰️ Proxies](#️-behind-a-proxy) · [🐞 Issues](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Why this exists

Inception Labs serves **Mercury** — the diffusion LLM line (`mercury-2`, `mercury-2.5`, `mercury-decide`) — over an OpenAI-compatible API at `api.inceptionlabs.ai/v1`. The console mints keys **under an account** (`/dashboard/api-keys`), so the useful unit is *one account per key* — never many keys from one account.

The tool walks the entire path in a real Chrome and only records a key after the live API answers:

```
proxies.txt ─▶ exit pick + point-of-use probe (register page + challenges.cloudflare.com)
                   │
                   ▼
  isolated Chrome context ─▶ platform.inceptionlabs.ai/auth/register
                             └─ register form ─▶ submit
                                └─ POST /api/auth/register → 200 → /thank-you
                                   └─ mail: "Verify your email address" (single-use link)
                                      └─ verify link ─▶ sign-in ─▶ /dashboard/api-keys ─▶ Create API Key
                                                                                       │
       GET  api.inceptionlabs.ai/v1/models            200  ◀── live verification ────┐ │
       POST api.inceptionlabs.ai/v1/chat/completions  200  ◀─────────────────────────┘ ▼
                                                                                    keys.txt
```

## 🎁 Free tier — how much you get

Every account starts on the **Free Tier with 100,000,000 free tokens** — measured two ways: the console shows *"You are on the Free Tier — you have used 0 of your 100,000,000 free tokens"*, and `GET /api/usage?quota=1` answers `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}`. The grant is **per account** and does not expire, so a new account is a new 100M.

| What | Value |
| --- | --- |
| Welcome grant | **100,000,000 tokens** per account — no expiry |
| Card required | **No** |
| Sign-up | `POST /api/auth/register` in a real Chrome (browser check + Turnstile) → verify mail → sign-in |
| The unit that scales | **one account = one key** → `--count N` is N 100M grants |

> 💡 The free tier is set by Inception Labs and can change. Check the live numbers at [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) — and let the tool's own gate decide:

```bash
node src/cli.js verify --chat 30     # every key in keys.txt is re-tested (models + one chat call)
```

## 🤖 Models — all 3 of them

`models.json` is the live `GET /v1/models` answer of a minted key — **3 ids**:

|Model|✓|
|---|---|
|`mercury-2.5`|✓|

Live probe of one key (exactly what the verifier does):

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 How to use the API

The base URL is **`https://api.inceptionlabs.ai/v1`** — OpenAI-compatible. A free-tier key answers chat directly.

**Any SDK / curl**

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

**Any agent with a custom base URL** (Cursor, OpenCode, Kilo Code …): set base URL `https://api.inceptionlabs.ai/v1`, paste a key, pick `mercury-2` or `mercury-2.5`.

## 🛠 Quick start

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

What lands on disk while it runs:

| path | content |
| --- | --- |
| `keys.txt` | the keys, **one per line**, appended the moment a key verifies (git-ignored) |
| `%USERPROFILE%\\inception-keys.txt` | a mirror of the same list, outside the repo |
| `accounts.json` | one record per attempt: mailbox, password, register status, key prefix + model ids (git-ignored) |
| [`models.json`](models.json) | `GET /v1/models` as answered by a minted key |
| `out/` | run log (`mint.log`), exit state, the pending queue, per-step DOM/network/screenshot dumps (git-ignored) |

### 🖱️ The launcher

The launcher `src/launcher.js` drives mint / finish / verify / screen (+ 9Router) and stores `count`/`conc` in `launcher.config.json`. It shows `proxies.txt` and `keys.txt` counters in the header. `node src/launcher.js --connect-9router` registers the minted keys in a local 9Router.

## ✅ Verified working — every key is tested

A key is written to `keys.txt` only after the live API answers with it:

| check | call | expected |
| --- | --- |
| auth + model list | `GET https://api.inceptionlabs.ai/v1/models` | `200` + the account's model ids (`mercury-2`, `mercury-2.5`, `mercury-decide`) |
| real generation | `POST https://api.inceptionlabs.ai/v1/chat/completions` (`mercury-2.5`) | `200` |

The verifier gates on both `200`s — a `401`/`403` on either call fails the key immediately, and anything else (network, other statuses) retries on another exit, up to 6 attempts.

```bash
node src/cli.js verify --chat 30    # reproduces both checks for your own file at any time
```

## 🧭 How it works

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: Inception Labs page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.inceptionlabs.ai/v1/chat/completions → real content = the key is live
```

Per account, one isolated Chrome context (`openContext` gives each context its own proxy and storage):

1. a fresh mailbox from the broker;
2. an exit handed out only if it answers **both** probe legs right now — the register page must answer `2xx–4xx` **and** the Turnstile script host must answer `200/301/302` (without the widget there is no token, and without the token the register POST is rejected);
3. register: the console's browser check clears, the form fills, the invisible Turnstile produces its token, and `POST /api/auth/register` routes the app to `/thank-you`;
4. the verify mail is consumed, then sign-in (no captcha; a rate-limited pre-check applies);
5. `/dashboard/api-keys` → **Create API Key**: the plaintext key is read from the one-shot reveal and the create-key wire response;
6. live verification (`/v1/models` + one chat completion) → `keys.txt`.

## ⚙️ CLI options

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat 30        # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| task | flags |
| --- | --- |
| `mint` | `--count 30·--workers 3 (max 4)·--broker 9700·--fallback-broker 9701·--mail-wait 300000ms·--pending-total 2400000ms·--burst-wait 75000ms·--model mercury-2.5·--stop-keys N (0 = whole count)·--exit-relay (pins bursts to one exit)·--port 9930 (CDP)` |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>` (consume the verify link first; omit to go straight to sign-in) · `--tag <name>` (dump prefix, `f1`) · `--port N` (`9925`) |
| `verify` | `--model <id>` (`mercury-2.5`) · `--chat N` (the first N keys also get a chat completion, `30`) · `--only <key>` (check one key instead of the whole file) |
| `screen` | `--url <page>` (`https://platform.inceptionlabs.ai/login`) · `--out <file>` · `--concurrency N` (`8`) · `--timeout N` ms (`30000`) · `--limit N` (`1000`) · `--ok-min` / `--ok-max` (`200` / `399`) |

## 🛰️ Behind a proxy

`proxies.txt`, one exit per line. Accepted shapes (blank lines and `#` / `//` comments are skipped; localhost/private ranges are rejected):

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **Point-of-use probe, two legs:** the register page plus the Turnstile script host. Probe outcomes are persisted in `out/exit-state.json`, and known-bad exits sort last.
* **Private proxies first when they exist:** `RESIDENTIAL_PROXIES=<file>` (or a `residential-proxies.txt` beside the tool's `out/`) is preferred for the register phase the moment the file exists; any api-reachable exit is fine for the cheap HTTP work.
* **Credentialed HTTP proxies work everywhere;** a `socks5://user:pass@…` line cannot be used for the browser steps (Chrome cannot answer a SOCKS auth prompt), but it still works for `screen` and `verify`.

## 📄 Files

| Path | Contents |
| --- | --- |
| `keys.txt` | the keys, **one per line**, appended the moment a key verifies — git-ignored |
| `accounts.json` | one record per account: mailbox, password, register status, key prefix + model ids — git-ignored |
| [`models.json`](models.json) | `GET /v1/models` as answered by a minted key (3 ids) |
| `out/` | run log (`mint.log`), exit state, the pending queue, per-step DOM/network/screenshot dumps — git-ignored |
| `proxies.txt` | your exit pool, one proxy per line — git-ignored |

## 🔌 Connect to 9Router

[9Router](https://9router.com) is a self-hosted, OpenAI-compatible router. Inception serves an OpenAI-compatible endpoint (`https://api.inceptionlabs.ai/v1`), so register it once and every key you minted becomes a connection under one provider-node — 9Router load-balances across them:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

Run it without `--api-key` to register **every** key in `keys.txt`. Re-running is idempotent: the node is matched by `--prefix inception`, each connection is matched by name (`inception-001`, `inception-002`, …), and an already-registered key is left alone. Defaults: `--base http://localhost:20128`, `--password 123456`, `--name "Inception Labs"`, `--prefix inception`, `--base-url https://api.inceptionlabs.ai/v1`, `--model mercury-2.5`.

Inside 9Router the keys are served as:

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router` re-checks `keys.txt` and registers it in one pass, and `node src/launcher.js` drives the same flow from its menu.

## 🔑 What one key gets you

| | |
| --- | --- |
| 🏢 Provider | **Inception Labs** — [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 What the provider gives | Mercury diffusion LLMs — every account 100M free tokens, no expiry, one account per key |
| 🔑 What one key gets you | one API key scoped to its own account: the 3 model ids on the endpoint below, at your plan's limits. The quota lives on the **account**, which is exactly why this tool creates one account per key |
| 🌐 API shape | OpenAI-compatible: `POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 Your data | only platform.inceptionlabs.ai and the inbox backend you configure are contacted; keys stay on your machine |

## 🐞 Issues

Inception changed the register flow, the Turnstile widget, the auth routes or the api-keys endpoint? The tool stops at that step and says so. **[Open an issue](../../issues)** with the command you ran and the exact output — the per-step dumps in `out/` (DOM + screenshot + wire) make failures reproducible without leaking a key. PRs are welcome.

## 📄 License

MIT © 2026 — see [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey contributors

</div>
