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

**Crie contas em massa na Inception Labs (Mercury) com chaves de API geradas automaticamente — inferência compatível com OpenAI + conector 9Router.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Início rápido](#-quick-start) · [🎁 Plano gratuito](#-free-tier--how-much-you-get) · [🤖 Modelos](#-models--all-3-of-them) · [🧪 Use a API](#-how-to-use-the-api) · [✅ Verificado](#-verified-working--every-key-is-tested) · [🧭 Como funciona](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Opções](#️-cli-options) · [🛰️ Proxies](#️-behind-a-proxy) · [🐞 Problemas](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Por que isso existe

A Inception Labs serve o **Mercury** — a linha de LLMs de difusão (`mercury-2`, `mercury-2.5`, `mercury-decide`) — por meio de uma API compatível com OpenAI em `api.inceptionlabs.ai/v1`. O console emite chaves **vinculadas a uma conta** (`/dashboard/api-keys`), então a unidade útil é *uma conta por chave* — nunca muitas chaves de uma só conta.

A ferramenta percorre todo o caminho em um Chrome real e só registra uma chave depois que a API ao vivo responde:

```
proxies.txt ─▶ escolha de saída + sondagem no ponto de uso (página de registro + challenges.cloudflare.com)
                   │
                   ▼
  contexto isolado do Chrome ─▶ platform.inceptionlabs.ai/auth/register
                             └─ formulário de registro ─▶ enviar
                                └─ POST /api/auth/register → 200 → /thank-you
                                   └─ e-mail: "Verify your email address" (link de uso único)
                                      └─ link de verificação ─▶ login ─▶ /dashboard/api-keys ─▶ Create API Key
                                                                                       │
       GET  api.inceptionlabs.ai/v1/models            200  ◀── verificação ao vivo ────┐ │
       POST api.inceptionlabs.ai/v1/chat/completions  200  ◀─────────────────────────┘ ▼
                                                                                    keys.txt
```

## 🎁 Plano gratuito — quanto você recebe

Toda conta começa no **Plano Gratuito com 100.000.000 de tokens grátis** — medido de duas formas: o console mostra *"You are on the Free Tier — you have used 0 of your 100,000,000 free tokens"*, e `GET /api/usage?quota=1` responde `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}`. A concessão é **por conta** e não expira, então uma nova conta é uma nova cota de 100M.

| O quê | Valor |
| --- | --- |
| Concessão de boas-vindas | **100.000.000 de tokens** por conta — sem expiração |
| Cartão exigido | **Não** |
| Cadastro | `POST /api/auth/register` em um Chrome real (verificação de navegador + Turnstile) → e-mail de verificação → login |
| A unidade que escala | **uma conta = uma chave** → `--count N` são N concessões de 100M |

> 💡 O plano gratuito é definido pela Inception Labs e pode mudar. Confira os números ao vivo em [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) — e deixe o próprio gate da ferramenta decidir:

```bash
node src/cli.js verify --chat 30     # every key in keys.txt is re-tested (models + one chat call)
```

## 🤖 Modelos — todos os 3

`models.json` é a resposta ao vivo de `GET /v1/models` de uma chave emitida — **3 ids**:

|Model|✓|
|---|---|
|`mercury-2.5`|✓|

Sondagem ao vivo de uma chave (exatamente o que o verificador faz):

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 Como usar a API

A URL base é **`https://api.inceptionlabs.ai/v1`** — compatível com OpenAI. Uma chave do plano gratuito responde ao chat diretamente.

**Qualquer SDK / curl**

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

**Qualquer agente com URL base personalizada** (Cursor, OpenCode, Kilo Code …): defina a URL base `https://api.inceptionlabs.ai/v1`, cole uma chave, escolha `mercury-2` ou `mercury-2.5`.

## 🛠 Início rápido

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

O que fica no disco enquanto ele roda:

| caminho | conteúdo |
| --- | --- |
| `keys.txt` | as chaves, **uma por linha**, anexadas no momento em que uma chave é verificada (ignorado pelo git) |
| `%USERPROFILE%\\inception-keys.txt` | um espelho da mesma lista, fora do repositório |
| `accounts.json` | um registro por tentativa: caixa de correio, senha, status de registro, prefixo da chave + ids de modelo (ignorado pelo git) |
| [`models.json`](models.json) | `GET /v1/models` conforme respondido por uma chave emitida |
| `out/` | log de execução (`mint.log`), estado das saídas, a fila pendente, dumps de DOM/rede/screenshot por etapa (ignorado pelo git) |

### 🖱️ O launcher

O launcher `src/launcher.js` controla mint / finish / verify / screen (+ 9Router) e armazena `count`/`conc` em `launcher.config.json`. Ele mostra os contadores de `proxies.txt` e `keys.txt` no cabeçalho. `node src/launcher.js --connect-9router` registra as chaves emitidas em um 9Router local.

## ✅ Verificado e funcionando — toda chave é testada

Uma chave só é escrita em `keys.txt` depois que a API ao vivo responde com ela:

| verificação | chamada | esperado |
| --- | --- | --- |
| auth + lista de modelos | `GET https://api.inceptionlabs.ai/v1/models` | `200` + os ids de modelo da conta (`mercury-2`, `mercury-2.5`, `mercury-decide`) |
| geração real | `POST https://api.inceptionlabs.ai/v1/chat/completions` (`mercury-2.5`) | `200` |

O verificador exige ambos os `200`s — um `401`/`403` em qualquer uma das chamadas reprova a chave imediatamente, e qualquer outra coisa (rede, outros status) tenta novamente em outra saída, até 6 tentativas.

```bash
node src/cli.js verify --chat 30    # reproduces both checks for your own file at any time
```

## 🧭 Como funciona

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: Inception Labs page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.inceptionlabs.ai/v1/chat/completions → real content = the key is live
```

Por conta, um contexto isolado do Chrome (`openContext` dá a cada contexto seu próprio proxy e armazenamento):

1. uma caixa de correio nova do broker;
2. uma saída entregue apenas se ela responder **ambas** as pernas da sondagem no momento — a página de registro deve responder `2xx–4xx` **e** o host do script do Turnstile deve responder `200/301/302` (sem o widget não há token, e sem o token o POST de registro é rejeitado);
3. registro: a verificação de navegador do console é aprovada, o formulário é preenchido, o Turnstile invisível produz seu token, e `POST /api/auth/register` encaminha o app para `/thank-you`;
4. o e-mail de verificação é consumido, depois o login (sem captcha; aplica-se uma pré-verificação com limite de taxa);
5. `/dashboard/api-keys` → **Create API Key**: a chave em texto puro é lida da revelação de uso único e da resposta de rede da criação de chave;
6. verificação ao vivo (`/v1/models` + uma conclusão de chat) → `keys.txt`.

## ⚙️ Opções da CLI

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat 30        # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| tarefa | flags |
| --- | --- |
| `mint` | `--count 30·--workers 3 (max 4)·--broker 9700·--fallback-broker 9701·--mail-wait 300000ms·--pending-total 2400000ms·--burst-wait 75000ms·--model mercury-2.5·--stop-keys N (0 = whole count)·--exit-relay (pins bursts to one exit)·--port 9930 (CDP)` |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>` (consume the verify link first; omit to go straight to sign-in) · `--tag <name>` (dump prefix, `f1`) · `--port N` (`9925`) |
| `verify` | `--model <id>` (`mercury-2.5`) · `--chat N` (the first N keys also get a chat completion, `30`) · `--only <key>` (check one key instead of the whole file) |
| `screen` | `--url <page>` (`https://platform.inceptionlabs.ai/login`) · `--out <file>` · `--concurrency N` (`8`) · `--timeout N` ms (`30000`) · `--limit N` (`1000`) · `--ok-min` / `--ok-max` (`200` / `399`) |

## 🛰️ Atrás de um proxy

`proxies.txt`, uma saída por linha. Formatos aceitos (linhas em branco e comentários `#` / `//` são ignorados; localhost/faixas privadas são rejeitados):

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **Sondagem no ponto de uso, duas pernas:** a página de registro mais o host do script do Turnstile. Os resultados da sondagem são persistidos em `out/exit-state.json`, e saídas sabidamente ruins são ordenadas por último.
* **Proxies privados primeiro quando existem:** `RESIDENTIAL_PROXIES=<file>` (ou um `residential-proxies.txt` ao lado do `out/` da ferramenta) é preferido para a fase de registro no momento em que o arquivo existe; qualquer saída alcançável pela API serve para o trabalho HTTP barato.
* **Proxies HTTP com credenciais funcionam em todos os lugares;** uma linha `socks5://user:pass@…` não pode ser usada para as etapas do navegador (o Chrome não consegue responder a um prompt de autenticação SOCKS), mas ainda funciona para `screen` e `verify`.

## 📄 Arquivos

| Caminho | Conteúdo |
| --- | --- |
| `keys.txt` | as chaves, **uma por linha**, anexadas no momento em que uma chave é verificada — ignorado pelo git |
| `accounts.json` | um registro por conta: caixa de correio, senha, status de registro, prefixo da chave + ids de modelo — ignorado pelo git |
| [`models.json`](models.json) | `GET /v1/models` conforme respondido por uma chave emitida (3 ids) |
| `out/` | log de execução (`mint.log`), estado das saídas, a fila pendente, dumps de DOM/rede/screenshot por etapa — ignorado pelo git |
| `proxies.txt` | seu pool de saídas, um proxy por linha — ignorado pelo git |

## 🔌 Conectar ao 9Router

O [9Router](https://9router.com) é um roteador auto-hospedado e compatível com OpenAI. A Inception serve um endpoint compatível com OpenAI (`https://api.inceptionlabs.ai/v1`), então registre-o uma vez e cada chave que você emitiu se torna uma conexão sob um único nó de provedor — o 9Router faz balanceamento de carga entre elas:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

Execute sem `--api-key` para registrar **todas** as chaves em `keys.txt`. Reexecutar é idempotente: o nó é correspondido por `--prefix inception`, cada conexão é correspondida por nome (`inception-001`, `inception-002`, …), e uma chave já registrada é deixada como está. Padrões: `--base http://localhost:20128`, `--password 123456`, `--name "Inception Labs"`, `--prefix inception`, `--base-url https://api.inceptionlabs.ai/v1`, `--model mercury-2.5`.

Dentro do 9Router as chaves são servidas como:

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router` reverifica `keys.txt` e o registra em uma só passada, e `node src/launcher.js` controla o mesmo fluxo a partir do seu menu.

## 🔑 O que uma chave te dá

| | |
| --- | --- |
| 🏢 Provedor | **Inception Labs** — [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 O que o provedor oferece | LLMs de difusão Mercury — toda conta com 100M de tokens grátis, sem expiração, uma conta por chave |
| 🔑 O que uma chave te dá | uma chave de API vinculada à sua própria conta: os 3 ids de modelo no endpoint abaixo, nos limites do seu plano. A cota fica na **conta**, que é exatamente por isso que esta ferramenta cria uma conta por chave |
| 🌐 Formato da API | Compatível com OpenAI: `POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 Seus dados | apenas platform.inceptionlabs.ai e o backend de caixa de correio que você configurar são contatados; as chaves ficam na sua máquina |

## 🐞 Problemas

A Inception mudou o fluxo de registro, o widget do Turnstile, as rotas de autenticação ou o endpoint de api-keys? A ferramenta para nessa etapa e avisa. **[Abra uma issue](../../issues)** com o comando que você executou e a saída exata — os dumps por etapa em `out/` (DOM + screenshot + rede) tornam as falhas reproduzíveis sem vazar uma chave. PRs são bem-vindos.

## 📄 Licença

MIT © 2026 — veja [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey contributors

</div>