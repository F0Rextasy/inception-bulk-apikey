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

**Inception Labs (Mercury) のアカウントを一括作成し、API キーを自動生成 — OpenAI 互換の推論 + 9Router コネクタ。**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 クイックスタート](#-quick-start) · [🎁 無料枠](#-free-tier--how-much-you-get) · [🤖 モデル](#-models--all-3-of-them) · [🧪 API の使い方](#-how-to-use-the-api) · [✅ 検証済み](#-verified-working--every-key-is-tested) · [🧭 仕組み](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ オプション](#️-cli-options) · [🛰️ プロキシ](#️-behind-a-proxy) · [🐞 問題報告](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ なぜこれが存在するのか

Inception Labs は **Mercury** — 拡散 LLM シリーズ（`mercury-2`、`mercury-2.5`、`mercury-decide`）— を `api.inceptionlabs.ai/v1` の OpenAI 互換 API で提供しています。コンソールはキーを**アカウント配下で**発行する（`/dashboard/api-keys`）ため、有用な単位は*キーごとに 1 アカウント*です — 1 つのアカウントから多数のキーを取得することは決してありません。

このツールは実際の Chrome で全経路をたどり、ライブ API が応答した後にのみキーを記録します:

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

## 🎁 無料枠 — どれだけ得られるか

すべてのアカウントは **100,000,000 無料トークンの無料枠** から始まります — 2 通りの方法で確認できます: コンソールには *"You are on the Free Tier — you have used 0 of your 100,000,000 free tokens"* と表示され、`GET /api/usage?quota=1` は `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}` と応答します。付与は**アカウントごと**で有効期限はないため、新しいアカウントは新たな 100M となります。

| 項目 | 値 |
| --- | --- |
| ウェルカム付与 | **100,000,000 トークン** アカウントごと — 有効期限なし |
| カード必須 | **いいえ** |
| サインアップ | 実際の Chrome で `POST /api/auth/register`（ブラウザチェック + Turnstile）→ メール認証 → サインイン |
| スケールする単位 | **1 アカウント = 1 キー** → `--count N` は N 個の 100M 付与 |

> 💡 無料枠は Inception Labs が設定するもので、変更される可能性があります。最新の数値は [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) で確認してください — そしてツール自身のゲートに判断させましょう:

```bash
node src/cli.js verify --chat 30     # every key in keys.txt is re-tested (models + one chat call)
```

## 🤖 モデル — 3 つすべて

`models.json` は発行済みキーのライブな `GET /v1/models` 応答です — **3 つの id**:

|Model|✓|
|---|---|
|`mercury-2.5`|✓|

1 つのキーのライブプローブ（検証ツールが実行する内容そのもの）:

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 API の使い方

ベース URL は **`https://api.inceptionlabs.ai/v1`** — OpenAI 互換です。無料枠のキーはチャットに直接応答します。

**任意の SDK / curl**

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

**カスタムベース URL を使う任意のエージェント**（Cursor、OpenCode、Kilo Code など）: ベース URL に `https://api.inceptionlabs.ai/v1` を設定し、キーを貼り付け、`mercury-2` または `mercury-2.5` を選択します。

## 🛠 クイックスタート

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

実行中にディスクへ書き込まれるもの:

| path | content |
| --- | --- |
| `keys.txt` | キー、**1 行に 1 つ**、キーが検証された瞬間に追記（git 管理外） |
| `%USERPROFILE%\\inception-keys.txt` | 同じリストのミラー、リポジトリ外 |
| `accounts.json` | 試行ごとに 1 レコード: メールボックス、パスワード、登録ステータス、キープレフィックス + モデル id（git 管理外） |
| [`models.json`](models.json) | 発行済みキーが応答した `GET /v1/models` |
| `out/` | 実行ログ（`mint.log`）、exit 状態、保留キュー、ステップごとの DOM/ネットワーク/スクリーンショットダンプ（git 管理外） |

### 🖱️ ランチャー

ランチャー `src/launcher.js` は mint / finish / verify / screen（+ 9Router）を操作し、`count`/`conc` を `launcher.config.json` に保存します。ヘッダーに `proxies.txt` と `keys.txt` のカウンターを表示します。`node src/launcher.js --connect-9router` は発行済みキーをローカルの 9Router に登録します。

## ✅ 動作検証済み — すべてのキーがテストされる

キーは、ライブ API がそのキーで応答した後にのみ `keys.txt` に書き込まれます:

| check | call | expected |
| --- | --- | --- |
| 認証 + モデル一覧 | `GET https://api.inceptionlabs.ai/v1/models` | `200` + アカウントのモデル id（`mercury-2`、`mercury-2.5`、`mercury-decide`） |
| 実際の生成 | `POST https://api.inceptionlabs.ai/v1/chat/completions`（`mercury-2.5`） | `200` |

検証ツールは両方の `200` をゲートとします — どちらかの呼び出しで `401`/`403` が出ればそのキーは即座に失敗となり、それ以外（ネットワーク、その他のステータス）は別の exit で再試行し、最大 6 回まで試行します。

```bash
node src/cli.js verify --chat 30    # reproduces both checks for your own file at any time
```

## 🧭 仕組み

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: Inception Labs page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.inceptionlabs.ai/v1/chat/completions → real content = the key is live
```

アカウントごとに、1 つの分離された Chrome コンテキスト（`openContext` は各コンテキストに独自のプロキシとストレージを与えます）:

1. ブローカーから新しいメールボックスを取得;
2. exit は、**両方**のプローブレッグに今すぐ応答した場合にのみ割り当てられます — 登録ページが `2xx–4xx` を返し、**かつ** Turnstile スクリプトホストが `200/301/302` を返す必要があります（ウィジェットがなければトークンは生成されず、トークンがなければ登録 POST は拒否されます）;
3. 登録: コンソールのブラウザチェックが通過し、フォームが入力され、不可視の Turnstile がトークンを生成し、`POST /api/auth/register` がアプリを `/thank-you` へルーティングします;
4. 認証メールを消費し、サインイン（キャプチャなし; レート制限された事前チェックが適用されます）;
5. `/dashboard/api-keys` → **Create API Key**: 平文キーは一度きりの表示と create-key のワイヤ応答から読み取られます;
6. ライブ検証（`/v1/models` + 1 回のチャット補完）→ `keys.txt`。

## ⚙️ CLI オプション

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
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>`（最初に認証リンクを消費; 省略するとサインインへ直行） · `--tag <name>`（ダンププレフィックス、`f1`） · `--port N`（`9925`） |
| `verify` | `--model <id>`（`mercury-2.5`） · `--chat N`（最初の N 個のキーはチャット補完も実行、`30`） · `--only <key>`（ファイル全体ではなく 1 つのキーをチェック） |
| `screen` | `--url <page>`（`https://platform.inceptionlabs.ai/login`） · `--out <file>` · `--concurrency N`（`8`） · `--timeout N` ms（`30000`） · `--limit N`（`1000`） · `--ok-min` / `--ok-max`（`200` / `399`） |

## 🛰️ プロキシの背後で

`proxies.txt`、1 行に 1 つの exit。受け入れられる形式（空行と `#` / `//` コメントはスキップ; localhost/プライベートレンジは拒否）:

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **使用時点のプローブ、2 レッグ:** 登録ページと Turnstile スクリプトホスト。プローブ結果は `out/exit-state.json` に永続化され、既知の不良 exit は最後にソートされます。
* **プライベートプロキシが存在する場合は優先:** `RESIDENTIAL_PROXIES=<file>`（またはツールの `out/` の隣にある `residential-proxies.txt`）は、ファイルが存在する瞬間から登録フェーズで優先されます; 安価な HTTP 処理には api 到達可能な任意の exit で十分です。
* **認証付き HTTP プロキシはどこでも動作します;** `socks5://user:pass@…` の行はブラウザステップには使用できません（Chrome は SOCKS 認証プロンプトに応答できません）が、`screen` と `verify` では引き続き動作します。

## 📄 ファイル

| Path | Contents |
| --- | --- |
| `keys.txt` | キー、**1 行に 1 つ**、キーが検証された瞬間に追記 — git 管理外 |
| `accounts.json` | アカウントごとに 1 レコード: メールボックス、パスワード、登録ステータス、キープレフィックス + モデル id — git 管理外 |
| [`models.json`](models.json) | 発行済みキーが応答した `GET /v1/models`（3 つの id） |
| `out/` | 実行ログ（`mint.log`）、exit 状態、保留キュー、ステップごとの DOM/ネットワーク/スクリーンショットダンプ — git 管理外 |
| `proxies.txt` | あなたの exit プール、1 行に 1 プロキシ — git 管理外 |

## 🔌 9Router に接続

[9Router](https://9router.com) はセルフホスト型の OpenAI 互換ルーターです。Inception は OpenAI 互換エンドポイント（`https://api.inceptionlabs.ai/v1`）を提供するため、一度登録すれば発行したすべてのキーが 1 つのプロバイダーノード配下の接続となり — 9Router がそれらをロードバランスします:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

`--api-key` なしで実行すると、`keys.txt` 内の**すべて**のキーを登録します。再実行は冪等です: ノードは `--prefix inception` で照合され、各接続は名前（`inception-001`、`inception-002`、…）で照合され、すでに登録済みのキーはそのままにされます。デフォルト: `--base http://localhost:20128`、`--password 123456`、`--name "Inception Labs"`、`--prefix inception`、`--base-url https://api.inceptionlabs.ai/v1`、`--model mercury-2.5`。

9Router 内ではキーは次のように提供されます:

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router` は `keys.txt` を再チェックし、1 回のパスで登録し、`node src/launcher.js` はそのメニューから同じフローを操作します。

## 🔑 1 つのキーで得られるもの

| | |
| --- | --- |
| 🏢 プロバイダー | **Inception Labs** — [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 プロバイダーが提供するもの | Mercury 拡散 LLM — すべてのアカウントに 100M 無料トークン、有効期限なし、キーごとに 1 アカウント |
| 🔑 1 つのキーで得られるもの | 自身のアカウントにスコープされた 1 つの API キー: 下記エンドポイントの 3 つのモデル id、あなたのプランの制限内で。クォータは**アカウント**に存在するため、このツールがキーごとに 1 アカウントを作成するのはまさにそのためです |
| 🌐 API の形式 | OpenAI 互換: `POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 あなたのデータ | 接触するのは platform.inceptionlabs.ai と、あなたが設定した受信箱バックエンドのみです; キーはあなたのマシンに留まります |

## 🐞 問題報告

Inception が登録フロー、Turnstile ウィジェット、認証ルート、または api-keys エンドポイントを変更しましたか？ ツールはそのステップで停止し、その旨を伝えます。実行したコマンドと正確な出力を添えて **[issue を作成](../../issues)** してください — `out/` 内のステップごとのダンプ（DOM + スクリーンショット + ワイヤ）により、キーを漏らすことなく失敗を再現できます。PR を歓迎します。

## 📄 ライセンス

MIT © 2026 — [LICENSE](LICENSE) を参照。

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey contributors

</div>