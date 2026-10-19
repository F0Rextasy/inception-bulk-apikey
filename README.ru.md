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

**Массовое создание аккаунтов Inception Labs (Mercury) с автоматически сгенерированными API-ключами — вывод, совместимый с OpenAI, + коннектор 9Router.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Быстрый старт](#-quick-start) · [🎁 Бесплатный тариф](#-free-tier--how-much-you-get) · [🤖 Модели](#-models--all-3-of-them) · [🧪 Использование API](#-how-to-use-the-api) · [✅ Проверено](#-verified-working--every-key-is-tested) · [🧭 Как это работает](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Опции](#️-cli-options) · [🛰️ Прокси](#️-behind-a-proxy) · [🐞 Проблемы](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Зачем это нужно

Inception Labs предоставляет **Mercury** — линейку диффузионных LLM (`mercury-2`, `mercury-2.5`, `mercury-decide`) — через API, совместимый с OpenAI, по адресу `api.inceptionlabs.ai/v1`. Консоль выдаёт ключи **в рамках аккаунта** (`/dashboard/api-keys`), поэтому полезная единица — это *один аккаунт на ключ*, а не много ключей из одного аккаунта.

Инструмент проходит весь путь в реальном Chrome и записывает ключ только после того, как живой API ответит:

```
proxies.txt ─▶ выбор выхода + проверка в точке использования (страница регистрации + challenges.cloudflare.com)
                   │
                   ▼
  изолированный контекст Chrome ─▶ platform.inceptionlabs.ai/auth/register
                             └─ форма регистрации ─▶ отправка
                                └─ POST /api/auth/register → 200 → /thank-you
                                   └─ письмо: "Verify your email address" (одноразовая ссылка)
                                      └─ ссылка подтверждения ─▶ вход ─▶ /dashboard/api-keys ─▶ Create API Key
                                                                                       │
       GET  api.inceptionlabs.ai/v1/models            200  ◀── живая проверка ────┐ │
       POST api.inceptionlabs.ai/v1/chat/completions  200  ◀─────────────────────────┘ ▼
                                                                                    keys.txt
```

## 🎁 Бесплатный тариф — сколько вы получаете

Каждый аккаунт начинается с **бесплатного тарифа со 100 000 000 бесплатных токенов** — это измеряется двумя способами: консоль показывает *"You are on the Free Tier — you have used 0 of your 100,000,000 free tokens"*, а `GET /api/usage?quota=1` отвечает `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}`. Грант выдаётся **на аккаунт** и не истекает, поэтому новый аккаунт — это новые 100M.

| Что | Значение |
| --- | --- |
| Приветственный грант | **100 000 000 токенов** на аккаунт — без срока действия |
| Требуется карта | **Нет** |
| Регистрация | `POST /api/auth/register` в реальном Chrome (проверка браузера + Turnstile) → подтверждение почты → вход |
| Единица масштабирования | **один аккаунт = один ключ** → `--count N` — это N грантов по 100M |

> 💡 Бесплатный тариф устанавливается Inception Labs и может измениться. Проверяйте актуальные цифры на [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) — и пусть решает собственный контроль инструмента:

```bash
node src/cli.js verify --chat 30     # каждый ключ в keys.txt перепроверяется (модели + один вызов чата)
```

## 🤖 Модели — все 3

`models.json` — это живой ответ `GET /v1/models` для созданного ключа — **3 идентификатора**:

|Модель|✓|
|---|---|
|`mercury-2.5`|✓|

Живая проверка одного ключа (именно то, что делает верификатор):

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 Как использовать API

Базовый URL — **`https://api.inceptionlabs.ai/v1`** — совместим с OpenAI. Ключ бесплатного тарифа отвечает на чат напрямую.

**Любой SDK / curl**

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

**Любой агент с настраиваемым базовым URL** (Cursor, OpenCode, Kilo Code …): задайте базовый URL `https://api.inceptionlabs.ai/v1`, вставьте ключ, выберите `mercury-2` или `mercury-2.5`.

## 🛠 Быстрый старт

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

Что появляется на диске во время работы:

| путь | содержимое |
| --- | --- |
| `keys.txt` | ключи, **по одному в строке**, добавляются в момент проверки ключа (игнорируется git) |
| `%USERPROFILE%\\inception-keys.txt` | зеркало того же списка, вне репозитория |
| `accounts.json` | одна запись на попытку: почтовый ящик, пароль, статус регистрации, префикс ключа + идентификаторы моделей (игнорируется git) |
| [`models.json`](models.json) | `GET /v1/models` в том виде, как отвечает созданный ключ |
| `out/` | журнал запуска (`mint.log`), состояние выходов, очередь ожидания, пошаговые дампы DOM/сети/скриншотов (игнорируется git) |

### 🖱️ Лаунчер

Лаунчер `src/launcher.js` управляет mint / finish / verify / screen (+ 9Router) и хранит `count`/`conc` в `launcher.config.json`. Он показывает счётчики `proxies.txt` и `keys.txt` в заголовке. `node src/launcher.js --connect-9router` регистрирует созданные ключи в локальном 9Router.

## ✅ Проверено в работе — каждый ключ протестирован

Ключ записывается в `keys.txt` только после того, как живой API ответит с ним:

| проверка | вызов | ожидается |
| --- | --- | --- |
| аутентификация + список моделей | `GET https://api.inceptionlabs.ai/v1/models` | `200` + идентификаторы моделей аккаунта (`mercury-2`, `mercury-2.5`, `mercury-decide`) |
| реальная генерация | `POST https://api.inceptionlabs.ai/v1/chat/completions` (`mercury-2.5`) | `200` |

Верификатор требует оба `200` — `401`/`403` на любом из вызовов немедленно проваливает ключ, а всё остальное (сеть, другие статусы) повторяется на другом выходе, до 6 попыток.

```bash
node src/cli.js verify --chat 30    # воспроизводит обе проверки для вашего файла в любой момент
```

## 🧭 Как это работает

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: Inception Labs page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.inceptionlabs.ai/v1/chat/completions → real content = the key is live
```

На каждый аккаунт — один изолированный контекст Chrome (`openContext` даёт каждому контексту собственный прокси и хранилище):

1. свежий почтовый ящик от брокера;
2. выход выдаётся только если он отвечает **обеим** проверкам прямо сейчас — страница регистрации должна ответить `2xx–4xx` **и** хост скрипта Turnstile должен ответить `200/301/302` (без виджета нет токена, а без токена POST регистрации отклоняется);
3. регистрация: проверка браузера в консоли проходит, форма заполняется, невидимый Turnstile выдаёт свой токен, и `POST /api/auth/register` переводит приложение на `/thank-you`;
4. письмо с подтверждением используется, затем вход (без капчи; применяется предварительная проверка с ограничением частоты);
5. `/dashboard/api-keys` → **Create API Key**: открытый ключ считывается из одноразового показа и из сетевого ответа создания ключа;
6. живая проверка (`/v1/models` + один вызов чата) → `keys.txt`.

## ⚙️ Опции CLI

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat 30        # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| задача | флаги |
| --- | --- |
| `mint` | `--count 30·--workers 3 (max 4)·--broker 9700·--fallback-broker 9701·--mail-wait 300000ms·--pending-total 2400000ms·--burst-wait 75000ms·--model mercury-2.5·--stop-keys N (0 = whole count)·--exit-relay (pins bursts to one exit)·--port 9930 (CDP)` |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>` (сначала использовать ссылку подтверждения; пропустите, чтобы сразу перейти к входу) · `--tag <name>` (префикс дампа, `f1`) · `--port N` (`9925`) |
| `verify` | `--model <id>` (`mercury-2.5`) · `--chat N` (первые N ключей также получают вызов чата, `30`) · `--only <key>` (проверить один ключ вместо всего файла) |
| `screen` | `--url <page>` (`https://platform.inceptionlabs.ai/login`) · `--out <file>` · `--concurrency N` (`8`) · `--timeout N` ms (`30000`) · `--limit N` (`1000`) · `--ok-min` / `--ok-max` (`200` / `399`) |

## 🛰️ За прокси

`proxies.txt`, по одному выходу в строке. Принимаемые форматы (пустые строки и комментарии `#` / `//` пропускаются; localhost/частные диапазоны отклоняются):

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **Проверка в точке использования, две части:** страница регистрации плюс хост скрипта Turnstile. Результаты проверки сохраняются в `out/exit-state.json`, а известные плохие выходы сортируются в конец.
* **Частные прокси в первую очередь, когда они есть:** `RESIDENTIAL_PROXIES=<file>` (или `residential-proxies.txt` рядом с `out/` инструмента) предпочитается для фазы регистрации, как только файл существует; для дешёвой HTTP-работы подойдёт любой выход, доступный по API.
* **HTTP-прокси с учётными данными работают везде;** строку `socks5://user:pass@…` нельзя использовать для шагов в браузере (Chrome не может ответить на запрос аутентификации SOCKS), но она по-прежнему работает для `screen` и `verify`.

## 📄 Файлы

| Путь | Содержимое |
| --- | --- |
| `keys.txt` | ключи, **по одному в строке**, добавляются в момент проверки ключа — игнорируется git |
| `accounts.json` | одна запись на аккаунт: почтовый ящик, пароль, статус регистрации, префикс ключа + идентификаторы моделей — игнорируется git |
| [`models.json`](models.json) | `GET /v1/models` в том виде, как отвечает созданный ключ (3 идентификатора) |
| `out/` | журнал запуска (`mint.log`), состояние выходов, очередь ожидания, пошаговые дампы DOM/сети/скриншотов — игнорируется git |
| `proxies.txt` | ваш пул выходов, по одному прокси в строке — игнорируется git |

## 🔌 Подключение к 9Router

[9Router](https://9router.com) — это самостоятельно размещаемый маршрутизатор, совместимый с OpenAI. Inception предоставляет совместимую с OpenAI конечную точку (`https://api.inceptionlabs.ai/v1`), поэтому зарегистрируйте её один раз, и каждый созданный вами ключ станет соединением под одним узлом провайдера — 9Router балансирует нагрузку между ними:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

Запустите без `--api-key`, чтобы зарегистрировать **каждый** ключ из `keys.txt`. Повторный запуск идемпотентен: узел сопоставляется по `--prefix inception`, каждое соединение сопоставляется по имени (`inception-001`, `inception-002`, …), а уже зарегистрированный ключ не трогается. Значения по умолчанию: `--base http://localhost:20128`, `--password 123456`, `--name "Inception Labs"`, `--prefix inception`, `--base-url https://api.inceptionlabs.ai/v1`, `--model mercury-2.5`.

Внутри 9Router ключи предоставляются как:

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router` перепроверяет `keys.txt` и регистрирует его за один проход, а `node src/launcher.js` управляет тем же процессом из своего меню.

## 🔑 Что даёт один ключ

| | |
| --- | --- |
| 🏢 Провайдер | **Inception Labs** — [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 Что даёт провайдер | Диффузионные LLM Mercury — каждому аккаунту 100M бесплатных токенов, без срока действия, один аккаунт на ключ |
| 🔑 Что даёт один ключ | один API-ключ, привязанный к своему аккаунту: 3 идентификатора моделей на конечной точке ниже, в пределах вашего тарифа. Квота привязана к **аккаунту**, именно поэтому этот инструмент создаёт один аккаунт на ключ |
| 🌐 Форма API | Совместим с OpenAI: `POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 Ваши данные | устанавливается связь только с platform.inceptionlabs.ai и настроенным вами почтовым бэкендом; ключи остаются на вашей машине |

## 🐞 Проблемы

Inception изменил процесс регистрации, виджет Turnstile, маршруты аутентификации или конечную точку api-keys? Инструмент останавливается на этом шаге и сообщает об этом. **[Откройте issue](../../issues)** с командой, которую вы запускали, и точным выводом — пошаговые дампы в `out/` (DOM + скриншот + сеть) делают сбои воспроизводимыми без утечки ключа. PR приветствуются.

## 📄 Лицензия

MIT © 2026 — см. [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey contributors

</div>