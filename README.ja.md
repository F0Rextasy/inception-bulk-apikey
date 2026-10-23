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

**Inception Labs (Mercury) のアカウントを自動生成された API キーとともに一括作成 — OpenAI 互換の推論 + 9Router コネクタ。**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![OmniRoute](https://img.shields.io/badge/OmniRoute-connector-8B5CF6?style=for-the-badge)](#-connect-to-omniroute)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 クイックスタート](#-quick-start) · [🎁 無料枠](#-free-tier--how-much-you-get) · [🤖 モデル](#-models--all-3-of-them) · [🧪 API の使い方](#-how-to-use-the-api) · [✅ 検証済み](#-verified-working--every-key-is-tested) · [🧭 仕組み](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [🔌 OmniRoute](#-connect-to-omniroute) · [⚙️ オプション](#️-cli-options) · [🛰️ プロキシ](#️-behind-a-proxy) · [🐞 問題報告](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ なぜこれが存在するのか

Inception Labs は **Mercury** — 拡散型 LLM シリーズ（`mercury-2`、`mercury-2.5`、`mercury-decide`）— を `api.inceptionlabs.ai/v1` の OpenAI 互換 API 経由で提供しています。コンソールはキーを**アカウント配下で**発行する（`/dashboard/api-keys`）ため、有用な単位は*キーごとに 1 アカウント*です — 1 つのアカウントから多数のキーを発行することは決してありません。

このツールは実際の Chrome で全経路をたどり、ライブ API が応答した後にのみキーを記録します：

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

すべてのアカウントは **100,000,000 無料トークン付きの Free Tier** から始まります — 2 通りの方法で測定されます：コンソールには *"You are on the Free Tier — you have used 0 of your 100,000,000 free tokens"* と表示され、`GET /api/usage?quota=1` は `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}` と応答します。付与は**アカウントごと**で失効しないため、新しいアカウントは新たな 100M です。

| 項目 | 値 |
| --- | --- |
| ウェルカム付与 | **100,000,000 トークン** アカウントごと — 失効なし |
| カード要否 | **不要** |
| サインアップ | 実際の Chrome で `POST /api/auth/register`（ブラウザチェック + Turnstile）→ メール検証 → サインイン |
| スケールする単位 | **1 アカウント = 1 キー** → `--count N` は N 個の 100M 付与 |

> 💡 無料枠は Inception Labs によって設定されており、変更される可能性があります。最新の数値は [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) で確認してください — そしてツール自身のゲートに判断を委ねてください：

```bash
node src/cli.js verify --chat 30  # every key in keys.txt is re-tested with a real chat call
```

## 🤖 モデル — 3 つすべて

`models.json` は発行されたキーのライブな `GET /v1/models` 応答です — **3 つの id**：

| id | 備考 |
| --- | --- |
| `mercury-2` | 最初の拡散型 LLM；128k コンテキスト、最大出力 50k；tools / JSON モード / 構造化出力 |
| `mercury-2.5` | 260k コンテキスト、最大出力 64k；**検証ツールのデフォルトチャットモデル** |
| `mercury-decide` | 型付き意思決定プレビュー；`decisions` エンドポイント専用 — チャット不可 |

1 つのキーのライブプローブ（検証ツールが実際に行うこと）：

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 API の使い方

ベース URL は **`https://api.inceptionlabs.ai/v1`** です — OpenAI 互換。無料枠のキーはチャットに直接応答します。

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

**カスタムベース URL を持つ任意のエージェント**（Cursor、OpenCode、Kilo Code など）：ベース URL を `https://api.inceptionlabs.ai/v1` に設定し、キーを貼り付け、`mercury-2` または `mercury-2.5` を選択します。

## 🛠 クイックスタート

```bash
git clone https://github.com/F0Rextasy/inception-bulk-apikey.git
cd inception-bulk-apikey

# 1) your proxy list, one exit per line (http://, socks5://, socks4:// or bare host:port)
printf 'socks5://127.0.0.1:1080\n' > proxies.txt   # optional — without it the tool runs direct

# 2) a mailbox broker on loopback — default 127.0.0.1:9700, fallback :9701 (contract below)

# 3) go
node src/launcher.js                 # interactive menu: mint / finish / verify / screen / settings

# or drive it directly:
node src/cli.js mint   --count 30    # fresh accounts, one key each
node src/cli.js verify --chat 30     # re-verify keys.txt (models + one chat completion each)
node src/cli.js screen --limit 400   # keep only proxy exits that reach the provider right now
```

実行中にディスクに書き込まれるもの：

| パス | 内容 |
| --- | --- |
| `keys.txt` | キー、**1 行に 1 つ**、キーが検証された瞬間に追記（git 管理外） |
| `%USERPROFILE%\\inception-keys.txt` | 同じリストのミラー、リポジトリ外 |
| `accounts.json` | 試行ごとに 1 レコード：メールボックス、パスワード、登録ステータス、キープレフィックス + モデル id（git 管理外） |
| [`models.json`](models.json) | 発行されたキーが応答した `GET /v1/models` |
| `out/` | 実行ログ（`mint.log`）、exit 状態、保留キュー、ステップごとの DOM/ネットワーク/スクリーンショットダンプ（git 管理外） |

### 🖱️ ランチャー

ランチャー `src/launcher.js` は mint / finish / verify / screen（+ 9Router）を操作し、`count`/`conc` を `launcher.config.json` に保存します。ヘッダーに `proxies.txt` と `keys.txt` のカウンターを表示します。`node src/launcher.js --connect-9router` は発行されたキーをローカルの 9Router に登録します。

## ✅ 動作検証済み — すべてのキーがテストされます

キーは、ライブ API がそのキーで応答した後にのみ `keys.txt` に書き込まれます：

| チェック | 呼び出し | 期待値 |
| --- | --- | --- |
| 認証 + モデル一覧 | `GET https://api.inceptionlabs.ai/v1/models` | `200` + アカウントのモデル id（`mercury-2`、`mercury-2.5`、`mercury-decide`） |
| 実際の生成 | `POST https://api.inceptionlabs.ai/v1/chat/completions`（`mercury-2.5`） | `200` |

検証ツールは両方の `200` をゲートにします — どちらかの呼び出しで `401`/`403` が出ればそのキーは即座に失敗となり、それ以外（ネットワーク、その他のステータス）は別の exit で最大 6 回まで再試行します。

```bash
node src/cli.js verify --chat 30    # reproduces both checks for your own file at any time
```

> **品質ゲート。** ここにあるすべてのキーは、`keys.txt` に書き込まれる前にライブな `chat-200` を通過しています
> （死んだキーは決して出荷されません）。ルーターのコンボもモデルレベルで同じルールに従います：エントリは
> **モデルが `chat-200` で応答し、ツールを呼び出せる場合にのみ**追加されます — ツールサポートのないモデル、
> 死んだキー、死んだプロバイダは追加されずに破棄されます。検証ステップはいつでも再実行できます；
> 失敗は報告され、決して隠されません。

## 🧭 仕組み

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: Inception Labs page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.inceptionlabs.ai/v1/chat/completions → real content = the key is live
```

アカウントごとに、1 つの分離された Chrome コンテキスト（`openContext` は各コンテキストに独自のプロキシとストレージを与えます）：

1. ブローカーからの新しいメールボックス；
2. exit は、**両方**のプローブレッグに今すぐ応答した場合にのみ割り当てられます — 登録ページが `2xx–4xx` を返し、**かつ** Turnstile スクリプトホストが `200/301/302` を返す必要があります（ウィジェットがなければトークンは得られず、トークンがなければ登録 POST は拒否されます）；
3. 登録：コンソールのブラウザチェックが通過し、フォームが入力され、不可視の Turnstile がトークンを生成し、`POST /api/auth/register` がアプリを `/thank-you` にルーティングします；
4. 検証メールが消費され、その後サインイン（キャプチャなし；レート制限された事前チェックが適用されます）；
5. `/dashboard/api-keys` → **Create API Key**：プレーンテキストのキーはワンショットの表示と create-key のワイヤ応答から読み取られます；
6. ライブ検証（`/v1/models` + 1 回のチャット補完）→ `keys.txt`。

## ⚙️ CLI オプション

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat 30        # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| タスク | フラグ |
| --- | --- |
| `mint` | `--count N`（`30`） · `--workers N`（デフォルト `3`、最大 `4`） · `--broker N`（`9700`） · `--fallback-broker N`（`9701`） · `--mail-wait N` ms（`300000`） · `--pending-total N` ms（`2400000`） · `--burst-wait N` ms（`75000`） · `--model <id>`（`mercury-2.5`） · `--stop-keys N`（`keys.txt` が N になったら停止；`0` = カウント全体を実行） · `--exit-relay <url>`（すべてのバーストを 1 つの固定 exit に固定） · `--port N`（Chrome CDP ポート、`9930`） |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>`（最初に検証リンクを消費；省略すると直接サインインへ） · `--tag <name>`（ダンププレフィックス、`f1`） · `--port N`（`9925`） |
| `verify` | `--model <id>`（`mercury-2.5`） · `--chat N`（最初の N 個のキーはチャット補完も受ける、`30`） · `--only <key>`（ファイル全体ではなく 1 つのキーをチェック） |
| `screen` | `--url <page>`（`https://platform.inceptionlabs.ai/login`） · `--out <file>` · `--concurrency N`（`8`） · `--timeout N` ms（`30000`） · `--limit N`（`1000`） · `--ok-min` / `--ok-max`（`200` / `399`） |

## 🛰️ プロキシの背後で

**任意 — 大規模時には推奨（IP ごとの制限、BAN）。** このツールはプロキシなしでも動作します。

`proxies.txt` に使用可能な行がない場合、ブラウザはトンネルなしで開き、HTTP 呼び出しはこのマシンから直接出ていきます — サインアップ、キー作成、検証はすべて同じように実行されます。プールはスケールするためのものであり、ツールが要求するものではありません。

`proxies.txt`、1 行に 1 つの exit。受け入れられる形式（空行と `#` / `//` コメントはスキップ；localhost/プライベート範囲は拒否）：

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **使用時点のプローブ、2 レッグ：** 登録ページと Turnstile スクリプトホスト。プローブ結果は `out/exit-state.json` に永続化され、既知の不良 exit は最後にソートされます。プールがなければプローブするものはありません — 直接ルートがそのまま使用されます。
* **プライベートプロキシが存在する場合は優先：** `RESIDENTIAL_PROXIES=<file>`（またはツールの `out/` の隣にある `residential-proxies.txt`）は、ファイルが存在する瞬間から登録フェーズで優先されます；api に到達可能な任意の exit は安価な HTTP 作業に適しています。
* **認証情報付き HTTP プロキシはどこでも動作します；** `socks5://user:pass@…` の行はブラウザステップには使用できません（Chrome は SOCKS 認証プロンプトに応答できません）が、`screen` と `verify` では引き続き動作します。

## 📄 ファイル

| パス | 内容 |
| --- | --- |
| `keys.txt` | キー、**1 行に 1 つ**、キーが検証された瞬間に追記 — git 管理外 |
| `accounts.json` | アカウントごとに 1 レコード：メールボックス、パスワード、登録ステータス、キープレフィックス + モデル id — git 管理外 |
| [`models.json`](models.json) | 発行されたキーが応答した `GET /v1/models`（3 つの id） |
| `out/` | 実行ログ（`mint.log`）、exit 状態、保留キュー、ステップごとの DOM/ネットワーク/スクリーンショットダンプ — git 管理外 |
| `proxies.txt` | あなたの exit プール、1 行に 1 プロキシ — git 管理外 |

## 🔌 9Router に接続

[9Router](https://9router.com) はセルフホスト型の OpenAI 互換ルーターです。Inception は OpenAI 互換エンドポイント（`https://api.inceptionlabs.ai/v1`）を提供するため、一度登録すれば発行したすべてのキーが 1 つのプロバイダノード配下の接続となり — 9Router がそれらをロードバランスします：

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

`--api-key` なしで実行すると、`keys.txt` の**すべて**のキーを登録します。再実行は冪等です：ノードは `--prefix inception` で照合され、各接続は名前（`inception-001`、`inception-002`、…）で照合され、すでに登録済みのキーはそのままにされます。デフォルト：`--base http://localhost:20128`、`--password 123456`、`--name "Inception Labs"`、`--prefix inception`、`--base-url https://api.inceptionlabs.ai/v1`、`--model mercury-2.5`。

9Router 内ではキーは次のように提供されます：

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router` は `keys.txt` を再チェックし、1 回のパスで登録し、`node src/launcher.js` はそのメニューから同じフローを操作します。

## 🔌 OmniRoute に接続

[OmniRoute](https://omniroute.online) はセルフホスト型の OpenAI 互換ルーターです。Inception は OpenAI 互換エンドポイント（`https://api.inceptionlabs.ai/v1`）を提供するため、一度登録すれば発行したすべてのキーが 1 つのプロバイダノード配下の接続となり — OmniRoute がそれらをロードバランスします：

```bash
node src/connect-omniroute.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

`--api-key` なしで実行すると、`keys.txt` の**すべて**のキーを登録します。再実行は冪等です：ノードは `--prefix inception` で照合され、各接続は名前（`inception-001`、`inception-002`、…）で照合され、すでに登録済みのキーはそのままにされます。デフォルト：`--base http://localhost:20128`、`--password 123456`、`--name "Inception Labs"`、`--prefix inception`、`--base-url https://api.inceptionlabs.ai/v1`、`--model mercury-2.5`。

OmniRoute 内ではキーは次のように提供されます：

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-omniroute` は `keys.txt` を再チェックし、1 回のパスで登録し、`node src/launcher.js` はそのメニューから同じフローを操作します。

## 🔑 1 つのキーで得られるもの

| | |
| --- | --- |
| 🏢 プロバイダ | **Inception Labs** — [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 プロバイダが提供するもの | Mercury 拡散型 LLM — すべてのアカウントに 100M 無料トークン、失効なし、キーごとに 1 アカウント |
| 🔑 1 つのキーで得られるもの | 自身のアカウントにスコープされた 1 つの API キー：下記エンドポイントの 3 つのモデル id、あなたのプランの制限で。クォータは**アカウント**に存在し、まさにそれがこのツールがキーごとに 1 アカウントを作成する理由です |
| 🌐 API 形式 | OpenAI 互換：`POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 あなたのデータ | platform.inceptionlabs.ai と、あなたが設定した受信トレイバックエンドのみが接触されます；キーはあなたのマシンに留まります |

## 🐞 問題報告

Inception が登録フロー、Turnstile ウィジェット、認証ルート、または api-keys エンドポイントを変更しましたか？ツールはそのステップで停止し、そう告げます。実行したコマンドと正確な出力を添えて **[issue を開いてください](../../issues)** — `out/` のステップごとのダンプ（DOM + スクリーンショット + ワイヤ）により、キーを漏らすことなく失敗を再現できます。PR を歓迎します。

## 📄 ライセンス

MIT © 2026 — [LICENSE](LICENSE) を参照。

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey contributors

</div>