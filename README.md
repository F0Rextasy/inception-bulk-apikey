<div align="center">

```
██╗███╗   ██╗ ██████╗███████╗██████╗ ████████╗██╗ ██████╗ ███╗   ██╗
██║████╗  ██║██╔════╝██╔════╝██╔══██╗╚══██╔══╝██║██╔═══██╗████╗  ██║
██║██╔██╗ ██║██║     █████╗  ██████╔╝   ██║   ██║██║   ██║██╔██╗ ██║
██║██║╚██╗██║██║     ██╔══╝  ██╔═══╝    ██║   ██║██║   ██║██║╚██╗██║
██║██║ ╚████║╚██████╗███████╗██║        ██║   ██║╚██████╔╝██║ ╚████║
╚═╝╚═╝  ╚═══╝ ╚═════╝╚══════╝╚═╝        ╚═╝   ╚═╝ ╚═════╝ ╚═╝  ╚═══╝
 ┌────────────────────────────────────────────────────────────────────────┐
 │ inception-bulk-apikey contributors   ·   one account → one key          │
 └────────────────────────────────────────────────────────────────────────┘
```

# inception-bulk-apikey

**Bulk-create [Inception Labs](https://platform.inceptionlabs.ai) (Mercury) accounts with auto-generated API keys — OpenAI-compatible inference + [9Router](https://9router.com) connector.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](models.json)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)

[🛠 Quick start](#-quick-start) · [📬 Mailbox broker](#-mailbox-broker) · [✅ Verified](#-verified-working--every-key-is-tested) · [🧭 How it works](#-how-it-works) · [🤖 Models & free tier](#-models--free-tier) · [⚙️ Options](#️-options) · [🛰️ Proxies](#️-behind-a-proxy) · [🔌 9Router](#-connect-to-9router) · [🐞 Issues](#-issues)

</div>

---

> **Mint as many accounts/keys as you need — there is no cap.** `--count N` (default `30`) accepts any N;
> N accounts, N keys, one account per key, every key verified live before it lands in `keys.txt`.

## ✨ Why this exists

Inception Labs serves **Mercury** — the diffusion LLM line (`mercury-2`, `mercury-2.5`,
`mercury-decide`) — over an OpenAI-compatible API at `api.inceptionlabs.ai/v1`. The console mints
keys **under an account** (`/dashboard/api-keys`), so the useful unit is *one account per key* — never
many keys from one account.

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

The sign-up is a browser flow (the console's own pages load a browser check and a Turnstile widget),
so the register/finish steps need **a real Chrome and a clean exit class**; the API host itself
(`api.inceptionlabs.ai`) has no such wall, so verification is a plain HTTP call on any
api-reachable exit.

## 🤖 Models & free tier

`models.json` is the live `GET /v1/models` answer of a minted key — **3 ids**:

| id | note |
| --- | --- |
| `mercury-2` | the first diffusion LLM; 128k context, 50k max output; tools / JSON mode / structured outputs |
| `mercury-2.5` | 260k context, 64k max output; the verifier's default chat model |
| `mercury-decide` | typed-decision preview; `decisions` endpoint only — not chat |

**How much is free:** every account starts on the **Free Tier with 100,000,000 free tokens** —
measured two ways: the console shows *“You are on the Free Tier — you have used 0 of your
100,000,000 free tokens”*, and `GET /api/usage?quota=1` answers
`{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}`.
The grant is **per account** and does not expire, so a new account is a new 100M — mint as many as
you need.

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🛠 Quick start

```bash
# clone or fork this repository, then:
cd inception-bulk-apikey

# 1) your proxy list, one exit per line (http://, socks5://, socks4:// or bare host:port)
printf 'socks5://127.0.0.1:1080\n' > proxies.txt

# 2) a mailbox broker on loopback — default 127.0.0.1:9700, fallback :9701 (contract below)

# 3) go
node src/launcher.js                 # interactive menu: mint / finish / verify / screen / settings
# or drive it directly:
node src/cli.js mint   --count 30    # fresh accounts, one key each
node src/cli.js verify --chat        # re-verify keys.txt (models + one chat completion each)
node src/cli.js screen --limit 400   # keep only proxy exits that reach the provider right now
```

What lands on disk while it runs:

| path | content |
| --- | --- |
| `keys.txt` | the keys, **one per line**, appended the moment a key verifies (git-ignored) |
| `%USERPROFILE%\inception-keys.txt` | a mirror of the same list, outside the repo |
| `accounts.json` | one record per attempt: mailbox, password, register status, key prefix + model ids (git-ignored) |
| [`models.json`](models.json) | `GET /v1/models` as answered by a minted key |
| `out/` | run log (`mint.log`), exit state, the pending queue, per-step DOM/network/screenshot dumps (git-ignored) |

## 📬 Mailbox broker

Sign-up needs a mailbox the tool can read. The tool talks to a tiny loopback service — it takes any
provider behind it and owns your mail credentials, so the repo never does. Default port `9700`
(fallback `9701`), three calls:

| call | answer |
| --- | --- |
| `POST http://127.0.0.1:9700/create` | body `{"folder":"inception-bulk"}` → `{ address, token }` — a fresh inbox |
| `GET /list?token=<token>` | the inbox's message list (`[{id, subject, from, created_at, …}]`) |
| `GET /read?token=<token>&id=<id>` | one message — `{ subject, text, html }` |

Verification mail arrives in **1–2 minutes** (single-use link, valid 24 h); the tool consumes it and
finishes the account on its own. An account whose mail has not arrived yet is queued in
`out/pending.json` and finished by the sweeper, in-run or after a restart — the mailbox is the
source of truth, so nothing is lost.

## ✅ Verified working — every key is tested

A key is written to `keys.txt` only after the live API answers with it:

| check | call | expected |
| --- | --- | --- |
| auth + model list | `GET https://api.inceptionlabs.ai/v1/models` | `200` + the account's model ids (`mercury-2`, `mercury-2.5`, `mercury-decide`) |
| real generation | `POST https://api.inceptionlabs.ai/v1/chat/completions` (`mercury-2.5`) | `200` |

The verifier gates on both `200`s — a `401`/`403` on either call fails the key immediately, and
anything else (network, other statuses) retries on another exit, up to 6 attempts. `node src/cli.js
verify --chat` reproduces exactly that check for your own file at any time.

### Finishing or rescuing an account by hand

```bash
# drive the key half for one already-created account (verify link → sign-in → /dashboard/api-keys →
# create key), dumping each step's DOM + screenshot + wire log into out/ — the create-key response
# carries the plaintext key
node src/cli.js finish --email <addr> --password <pw> [--verify "<link>"]

# the password-reset rescue for an account whose password was lost mid-flow:
# forgot-password → mail → single-use reset link → new password → sign-in → create key
node src/rescue-reset.js --email <addr> --box <broker box> [--exit "<line>"] [--port 9967]

# attach a second CDP client to the still-open mint browser and finish "Create API Key" on it
node src/rescue-ui.js --port <mint port> [--create]
```

## 🧭 How it works

Per account, one isolated Chrome context (`openContext` gives each context its own proxy and storage):

1. a fresh mailbox from the broker;
2. an exit handed out only if it answers **both** probe legs right now — the register page must answer
   `2xx–4xx` **and** the Turnstile script host must answer `200/301/302` (without the widget there is
   no token, and without the token the register POST is rejected);
3. register: the console's browser check clears, the form fills, the invisible Turnstile produces its
   token, and `POST /api/auth/register` routes the app to `/thank-you`;
4. the verify mail is consumed, then sign-in (no captcha; a rate-limited pre-check applies);
5. `/dashboard/api-keys` → **Create API Key**: the plaintext key is read from the one-shot reveal and
   the create-key wire response;
6. live verification (`/v1/models` + one chat completion) → `keys.txt`.

Operational notes:

* **Every browser step has a hard ceiling** (`--burst-wait`, 75 s): a register burst that produces no
  token in ~70 s is dropped, so a dying exit costs one burst, never the batch.
* **Nothing is pinned across a mail wait** — the exit is re-probed and reused for a bounded number of
  accounts (`INCEPTION_REUSE_MAX`, default 3), and is dropped the moment a burst fails on it.
* **A key is appended to `keys.txt` the moment it verifies**, and `--stop-keys N` ends the batch once
  the file holds N keys.

## ⚙️ Options

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat           # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| task | flags |
| --- | --- |
| `mint` | `--count N` (`30`) · `--workers N` (default `3`, max `4`) · `--broker N` (`9700`) · `--fallback-broker N` (`9701`) · `--mail-wait N` ms — combined-path mail wait (`300000`) · `--pending-total N` ms — pending write-off (`2400000`) · `--burst-wait N` ms — per-step browser ceiling (`75000`) · `--model <id>` (`mercury-2.5`) · `--stop-keys N` (stop once `keys.txt` holds N; `0` = run the whole count) · `--exit-relay <url>` (pin every burst on one fixed exit) · `--port N` (Chrome CDP port, `9930`) |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>` (consume the verify link first; omit to go straight to sign-in) · `--tag <name>` (dump prefix, `f1`) · `--port N` (`9925`) |
| `verify` | `--model <id>` (`mercury-2.5`) · `--chat N` (the first N keys also get a chat completion, `30`) · `--only <key>` (check one key instead of the whole file) |
| `screen` | `--url <page>` (`https://platform.inceptionlabs.ai/login`) · `--out <file>` · `--concurrency N` (`8`) · `--timeout N` ms (`30000`) · `--limit N` (`1000`) · `--ok-min` / `--ok-max` (`200` / `399`) |

Every task prints its own flags — ask it directly: `node src/mint.js --help`. `node src/launcher.js` drives
the same tasks with a menu and stores what you answer in `launcher.config.json`.

Any task also takes `--connect-9router`: when it finishes, every key in `keys.txt` is registered
into a running 9Router (`node src/connect-9router.js --help`).

## 🛰️ Behind a proxy

`proxies.txt`, one exit per line. Accepted shapes (blank lines and `#` / `//` comments are skipped;
localhost/private ranges are rejected):

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **Point-of-use probe, two legs:** the register page plus the Turnstile script host (see *How it
  works*). Probe outcomes are persisted in `out/exit-state.json`, and known-bad exits sort last.
* **Private proxies first when they exist:** `RESIDENTIAL_PROXIES=<file>` (or a `residential-proxies.txt`
  beside the tool's `out/`) is preferred for the register phase the moment the file exists; any
  api-reachable exit is fine for the cheap HTTP work. Use exits you are allowed to use.
* **Reach lists are just files:** whatever the screens wrote (`out/token-capable.txt`,
  `out/platform-*.txt`, `out/api-live.txt`) is picked up automatically as extra candidates.
* **Credentialed HTTP proxies work everywhere;** a `socks5://user:pass@…` line cannot be used for the
  browser steps (Chrome cannot answer a SOCKS auth prompt), but it still works for `screen` and
  `verify`.

## 🔌 Connect to 9Router

[9Router](https://9router.com) is a self-hosted, OpenAI-compatible router. Inception serves an
OpenAI-compatible endpoint (`https://api.inceptionlabs.ai/v1`), so register it once and every key
you minted becomes a connection under one provider-node — 9Router load-balances across them:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

Run it without `--api-key` to register **every** key in `keys.txt`. Re-running is idempotent: the
node is matched by `--prefix inception`, each connection is matched by name (`inception-001`,
`inception-002`, …), and an already-registered key is left alone. Defaults:
`--base http://localhost:20128`, `--password 123456`, `--name "Inception Labs"`,
`--prefix inception`, `--base-url https://api.inceptionlabs.ai/v1`, `--model mercury-2.5`.

Inside 9Router the keys are served as:

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat --connect-9router` re-checks `keys.txt` and registers it in one pass, and
`node src/launcher.js` drives the same flow from its menu. Registering a key does not touch the account,
the mailbox or the exit — the connector only talks to 9Router.

## 🐞 Issues

Inception changed the register flow, the Turnstile widget, the auth routes or the api-keys endpoint?
The tool stops at that step and says so. **[Open an issue](../../issues)**
with the command you ran and the exact output — the per-step dumps in `out/` (DOM + screenshot + wire)
make failures reproducible without leaking a key. PRs are welcome.

## 📄 License

MIT — see [LICENSE](LICENSE). Use it on accounts you are allowed to create.

---

<div align="center">

**[MIT](LICENSE) © 2026 inception-bulk-apikey contributors**

</div>
