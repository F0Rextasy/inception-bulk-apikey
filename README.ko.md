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

**자동 생성된 API 키로 Inception Labs(Mercury) 계정을 대량 생성 — OpenAI 호환 추론 + 9Router 커넥터.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![OmniRoute](https://img.shields.io/badge/OmniRoute-connector-8B5CF6?style=for-the-badge)](#-connect-to-omniroute)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 빠른 시작](#-quick-start) · [🎁 무료 티어](#-free-tier--how-much-you-get) · [🤖 모델](#-models--all-3-of-them) · [🧪 API 사용하기](#-how-to-use-the-api) · [✅ 검증됨](#-verified-working--every-key-is-tested) · [🧭 작동 방식](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [🔌 OmniRoute](#-connect-to-omniroute) · [⚙️ 옵션](#️-cli-options) · [🛰️ 프록시](#️-behind-a-proxy) · [🐞 이슈](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ 이 도구가 존재하는 이유

Inception Labs는 **Mercury** — 디퓨전 LLM 라인(`mercury-2`, `mercury-2.5`, `mercury-decide`) — 을 `api.inceptionlabs.ai/v1`에서 OpenAI 호환 API로 제공합니다. 콘솔은 키를 **계정 아래에서** 발급하므로(`/dashboard/api-keys`), 유용한 단위는 *키당 하나의 계정* — 하나의 계정에서 여러 키를 만드는 것이 아닙니다.

이 도구는 실제 Chrome에서 전체 경로를 순회하며, 라이브 API가 응답한 뒤에만 키를 기록합니다:

```
proxies.txt ─▶ 출구 선택 + 사용 시점 프로브 (register 페이지 + challenges.cloudflare.com)
                   │
                   ▼
  격리된 Chrome 컨텍스트 ─▶ platform.inceptionlabs.ai/auth/register
                             └─ 가입 양식 ─▶ 제출
                                └─ POST /api/auth/register → 200 → /thank-you
                                   └─ 메일: "Verify your email address" (일회용 링크)
                                      └─ 링크 인증 ─▶ 로그인 ─▶ /dashboard/api-keys ─▶ Create API Key
                                                                                       │
       GET  api.inceptionlabs.ai/v1/models            200  ◀── 라이브 검증 ────┐ │
       POST api.inceptionlabs.ai/v1/chat/completions  200  ◀─────────────────────────┘ ▼
                                                                                    keys.txt
```

## 🎁 무료 티어 — 얼마나 받을 수 있나

모든 계정은 **1억 개의 무료 토큰이 제공되는 무료 티어**로 시작합니다 — 두 가지 방식으로 측정됩니다: 콘솔에는 *"You are on the Free Tier — you have used 0 of your 100,000,000 free tokens"*라고 표시되고, `GET /api/usage?quota=1`은 `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}`라고 응답합니다. 이 부여량은 **계정당**이며 만료되지 않으므로, 새 계정은 새로운 1억입니다.

| 항목 | 값 |
| --- | --- |
| 웰컴 부여량 | 계정당 **100,000,000 토큰** — 만료 없음 |
| 카드 필요 | **아니오** |
| 가입 | 실제 Chrome에서 `POST /api/auth/register` (브라우저 검사 + Turnstile) → 메일 인증 → 로그인 |
| 확장되는 단위 | **하나의 계정 = 하나의 키** → `--count N`은 N개의 1억 부여량 |

> 💡 무료 티어는 Inception Labs가 설정하며 변경될 수 있습니다. [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai)에서 실시간 수치를 확인하세요 — 그리고 도구 자체의 게이트가 판단하도록 하세요:

```bash
node src/cli.js verify --chat 30  # keys.txt의 모든 키가 실제 채팅 호출로 다시 테스트됩니다
```

## 🤖 모델 — 3개 전부

`models.json`은 발급된 키의 라이브 `GET /v1/models` 응답입니다 — **3개의 id**:

| id | 비고 |
| --- | --- |
| `mercury-2` | 최초의 디퓨전 LLM; 128k 컨텍스트, 최대 출력 50k; 도구 / JSON 모드 / 구조화 출력 |
| `mercury-2.5` | 260k 컨텍스트, 최대 출력 64k; **검증기의 기본 채팅 모델** |
| `mercury-decide` | 타입 지정 결정 프리뷰; `decisions` 엔드포인트 전용 — 채팅 아님 |

하나의 키에 대한 라이브 프로브 (검증기가 수행하는 것과 정확히 동일):

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 API 사용 방법

베이스 URL은 **`https://api.inceptionlabs.ai/v1`** — OpenAI 호환입니다. 무료 티어 키는 채팅에 바로 응답합니다.

**모든 SDK / curl**

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

**커스텀 베이스 URL을 지원하는 모든 에이전트** (Cursor, OpenCode, Kilo Code …): 베이스 URL을 `https://api.inceptionlabs.ai/v1`로 설정하고, 키를 붙여넣고, `mercury-2` 또는 `mercury-2.5`를 선택하세요.

## 🛠 빠른 시작

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

실행 중 디스크에 기록되는 항목:

| 경로 | 내용 |
| --- | --- |
| `keys.txt` | 키, **한 줄에 하나씩**, 키가 검증되는 즉시 추가됨 (git-ignored) |
| `%USERPROFILE%\\inception-keys.txt` | 동일 목록의 미러, 저장소 외부에 위치 |
| `accounts.json` | 시도당 하나의 레코드: 메일박스, 비밀번호, 가입 상태, 키 접두사 + 모델 id (git-ignored) |
| [`models.json`](models.json) | 발급된 키가 응답한 `GET /v1/models` |
| `out/` | 실행 로그 (`mint.log`), 출구 상태, 대기 큐, 단계별 DOM/네트워크/스크린샷 덤프 (git-ignored) |

### 🖱️ 런처

런처 `src/launcher.js`는 mint / finish / verify / screen (+ 9Router)을 구동하고 `count`/`conc`를 `launcher.config.json`에 저장합니다. 헤더에 `proxies.txt`와 `keys.txt` 카운터를 표시합니다. `node src/launcher.js --connect-9router`는 발급된 키를 로컬 9Router에 등록합니다.

## ✅ 검증된 작동 — 모든 키가 테스트됨

키는 라이브 API가 해당 키로 응답한 뒤에만 `keys.txt`에 기록됩니다:

| 검사 | 호출 | 예상 |
| --- | --- | --- |
| 인증 + 모델 목록 | `GET https://api.inceptionlabs.ai/v1/models` | `200` + 계정의 모델 id (`mercury-2`, `mercury-2.5`, `mercury-decide`) |
| 실제 생성 | `POST https://api.inceptionlabs.ai/v1/chat/completions` (`mercury-2.5`) | `200` |

검증기는 두 `200` 모두를 게이트로 삼습니다 — 둘 중 하나라도 `401`/`403`이면 해당 키는 즉시 실패하고, 그 외의 경우(네트워크, 기타 상태)는 다른 출구에서 최대 6회까지 재시도합니다.

```bash
node src/cli.js verify --chat 30    # 언제든지 자신의 파일에 대해 두 검사를 재현합니다
```

> **품질 게이트.** 여기의 모든 키는 `keys.txt`에 기록되기 전에 라이브 `chat-200`을 통과했습니다
> (죽은 키는 절대 배포되지 않습니다). 라우터 조합도 모델 수준에서 동일한 규칙을 따릅니다: 항목은
> **모델이 `chat-200`으로 응답하고 도구 호출이 가능한 경우에만** 추가됩니다 — 도구 지원이 없는 모델,
> 죽은 키 또는 죽은 제공자는 추가되지 않고 제거됩니다. 언제든지 검증 단계를 다시 실행하세요;
> 실패는 보고되며, 절대 숨겨지지 않습니다.

## 🧭 작동 방식

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: Inception Labs page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.inceptionlabs.ai/v1/chat/completions → real content = the key is live
```

계정당 하나의 격리된 Chrome 컨텍스트 (`openContext`는 각 컨텍스트에 자체 프록시와 스토리지를 부여합니다):

1. 브로커로부터 새 메일박스;
2. 지금 **두 프로브 레그 모두**에 응답하는 경우에만 출구가 할당됩니다 — register 페이지가 `2xx–4xx`로 응답해야 **하고** Turnstile 스크립트 호스트가 `200/301/302`로 응답해야 합니다 (위젯이 없으면 토큰이 없고, 토큰이 없으면 register POST가 거부됩니다);
3. 가입: 콘솔의 브라우저 검사가 통과되고, 양식이 채워지고, 보이지 않는 Turnstile이 토큰을 생성하고, `POST /api/auth/register`가 앱을 `/thank-you`로 라우팅합니다;
4. 인증 메일이 소비된 후 로그인 (캡차 없음; 속도 제한 사전 검사 적용);
5. `/dashboard/api-keys` → **Create API Key**: 평문 키가 일회성 공개와 create-key 와이어 응답에서 읽힙니다;
6. 라이브 검증 (`/v1/models` + 하나의 채팅 완성) → `keys.txt`.

## ⚙️ CLI 옵션

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat 30        # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| 작업 | 플래그 |
| --- | --- |
| `mint` | `--count N` (`30`) · `--workers N` (기본 `3`, 최대 `4`) · `--broker N` (`9700`) · `--fallback-broker N` (`9701`) · `--mail-wait N` ms (`300000`) · `--pending-total N` ms (`2400000`) · `--burst-wait N` ms (`75000`) · `--model <id>` (`mercury-2.5`) · `--stop-keys N` (`keys.txt`에 N개가 있으면 중지; `0` = 전체 카운트 실행) · `--exit-relay <url>` (모든 버스트를 하나의 고정 출구에 고정) · `--port N` (Chrome CDP 포트, `9930`) |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>` (먼저 인증 링크를 소비; 생략하면 바로 로그인으로) · `--tag <name>` (덤프 접두사, `f1`) · `--port N` (`9925`) |
| `verify` | `--model <id>` (`mercury-2.5`) · `--chat N` (처음 N개 키는 채팅 완성도 수행, `30`) · `--only <key>` (전체 파일 대신 하나의 키 확인) |
| `screen` | `--url <page>` (`https://platform.inceptionlabs.ai/login`) · `--out <file>` · `--concurrency N` (`8`) · `--timeout N` ms (`30000`) · `--limit N` (`1000`) · `--ok-min` / `--ok-max` (`200` / `399`) |

## 🛰️ 프록시 뒤에서

**선택 사항 — 대규모에서는 권장됨 (IP당 제한, 차단).** 이 도구는 프록시 없이도 작동합니다.

`proxies.txt`에 사용 가능한 줄이 없으면 브라우저는 터널 없이 열리고 HTTP 호출은 이 머신에서 직접 나갑니다 — 가입, 키 생성, 검증 모두 동일하게 실행됩니다. 풀은 확장을 위한 것이지, 도구가 요구하는 것이 아닙니다.

`proxies.txt`, 한 줄에 하나의 출구. 허용되는 형식 (빈 줄과 `#` / `//` 주석은 건너뜀; localhost/사설 대역은 거부됨):

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **사용 시점 프로브, 두 레그:** register 페이지와 Turnstile 스크립트 호스트. 프로브 결과는 `out/exit-state.json`에 저장되며, 알려진 불량 출구는 마지막에 정렬됩니다. 풀이 없으면 프로브할 것이 없습니다 — 직접 경로가 그대로 사용됩니다.
* **사설 프록시가 있으면 우선:** `RESIDENTIAL_PROXIES=<file>` (또는 도구의 `out/` 옆에 있는 `residential-proxies.txt`)이 파일이 존재하는 순간 register 단계에 우선 사용됩니다; api에 도달 가능한 출구라면 저렴한 HTTP 작업에는 아무거나 괜찮습니다.
* **자격 증명이 있는 HTTP 프록시는 어디서나 작동;** `socks5://user:pass@…` 줄은 브라우저 단계에 사용할 수 없지만 (Chrome은 SOCKS 인증 프롬프트에 응답할 수 없음), `screen`과 `verify`에는 여전히 작동합니다.

## 📄 파일

| 경로 | 내용 |
| --- | --- |
| `keys.txt` | 키, **한 줄에 하나씩**, 키가 검증되는 즉시 추가됨 — git-ignored |
| `accounts.json` | 계정당 하나의 레코드: 메일박스, 비밀번호, 가입 상태, 키 접두사 + 모델 id — git-ignored |
| [`models.json`](models.json) | 발급된 키가 응답한 `GET /v1/models` (3개의 id) |
| `out/` | 실행 로그 (`mint.log`), 출구 상태, 대기 큐, 단계별 DOM/네트워크/스크린샷 덤프 — git-ignored |
| `proxies.txt` | 출구 풀, 한 줄에 하나의 프록시 — git-ignored |

## 🔌 9Router에 연결

[9Router](https://9router.com)는 자체 호스팅되는 OpenAI 호환 라우터입니다. Inception은 OpenAI 호환 엔드포인트(`https://api.inceptionlabs.ai/v1`)를 제공하므로, 한 번 등록하면 발급한 모든 키가 하나의 provider-node 아래 연결이 됩니다 — 9Router가 이들 사이에서 로드 밸런싱합니다:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

`--api-key` 없이 실행하면 `keys.txt`의 **모든** 키를 등록합니다. 재실행은 멱등적입니다: 노드는 `--prefix inception`으로 매칭되고, 각 연결은 이름(`inception-001`, `inception-002`, …)으로 매칭되며, 이미 등록된 키는 그대로 둡니다. 기본값: `--base http://localhost:20128`, `--password 123456`, `--name "Inception Labs"`, `--prefix inception`, `--base-url https://api.inceptionlabs.ai/v1`, `--model mercury-2.5`.

9Router 내부에서 키는 다음과 같이 제공됩니다:

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router`는 `keys.txt`를 다시 확인하고 한 번에 등록하며, `node src/launcher.js`는 메뉴에서 동일한 흐름을 구동합니다.

## 🔌 OmniRoute에 연결

[OmniRoute](https://omniroute.online)는 자체 호스팅되는 OpenAI 호환 라우터입니다. Inception은 OpenAI 호환 엔드포인트(`https://api.inceptionlabs.ai/v1`)를 제공하므로, 한 번 등록하면 발급한 모든 키가 하나의 provider-node 아래 연결이 됩니다 — OmniRoute가 이들 사이에서 로드 밸런싱합니다:

```bash
node src/connect-omniroute.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

`--api-key` 없이 실행하면 `keys.txt`의 **모든** 키를 등록합니다. 재실행은 멱등적입니다: 노드는 `--prefix inception`으로 매칭되고, 각 연결은 이름(`inception-001`, `inception-002`, …)으로 매칭되며, 이미 등록된 키는 그대로 둡니다. 기본값: `--base http://localhost:20128`, `--password 123456`, `--name "Inception Labs"`, `--prefix inception`, `--base-url https://api.inceptionlabs.ai/v1`, `--model mercury-2.5`.

OmniRoute 내부에서 키는 다음과 같이 제공됩니다:

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-omniroute`는 `keys.txt`를 다시 확인하고 한 번에 등록하며, `node src/launcher.js`는 메뉴에서 동일한 흐름을 구동합니다.

## 🔑 키 하나로 얻는 것

| | |
| --- | --- |
| 🏢 제공자 | **Inception Labs** — [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 제공자가 주는 것 | Mercury 디퓨전 LLM — 모든 계정에 1억 무료 토큰, 만료 없음, 키당 하나의 계정 |
| 🔑 키 하나로 얻는 것 | 자체 계정에 범위가 지정된 하나의 API 키: 아래 엔드포인트의 3개 모델 id, 요금제 한도 내에서. 할당량은 **계정**에 있으므로, 이 도구가 키당 하나의 계정을 생성하는 것입니다 |
| 🌐 API 형태 | OpenAI 호환: `POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 데이터 | platform.inceptionlabs.ai와 구성한 inbox 백엔드만 접촉됩니다; 키는 사용자의 머신에 남습니다 |

## 🐞 이슈

Inception이 register 흐름, Turnstile 위젯, 인증 라우트 또는 api-keys 엔드포인트를 변경했나요? 도구는 해당 단계에서 멈추고 그렇게 알려줍니다. 실행한 명령과 정확한 출력을 포함하여 **[이슈를 열어주세요](../../issues)** — `out/`의 단계별 덤프(DOM + 스크린샷 + 와이어)는 키를 노출하지 않고 실패를 재현 가능하게 만듭니다. PR을 환영합니다.

## 📄 라이선스

MIT © 2026 — [LICENSE](LICENSE) 참조.

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey contributors

</div>