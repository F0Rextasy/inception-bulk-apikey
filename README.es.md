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

**Crea cuentas de Inception Labs (Mercury) en masa con claves API autogeneradas — inferencia compatible con OpenAI + conector 9Router.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Inicio rápido](#-quick-start) · [🎁 Nivel gratuito](#-free-tier--how-much-you-get) · [🤖 Modelos](#-models--all-3-of-them) · [🧪 Usar la API](#-how-to-use-the-api) · [✅ Verificado](#-verified-working--every-key-is-tested) · [🧭 Cómo funciona](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Opciones](#️-cli-options) · [🛰️ Proxies](#️-behind-a-proxy) · [🐞 Problemas](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>


---

## ✨ Por qué existe esto

Inception Labs sirve **Mercury** — la línea de LLM de difusión (`mercury-2`, `mercury-2.5`, `mercury-decide`) — a través de una API compatible con OpenAI en `api.inceptionlabs.ai/v1`. La consola genera claves **bajo una cuenta** (`/dashboard/api-keys`), así que la unidad útil es *una cuenta por clave* — nunca muchas claves de una sola cuenta.

La herramienta recorre todo el camino en un Chrome real y solo registra una clave después de que la API en vivo responde:

```
proxies.txt ─▶ selección de salida + sondeo en el punto de uso (página de registro + challenges.cloudflare.com)
                   │
                   ▼
  contexto de Chrome aislado ─▶ platform.inceptionlabs.ai/auth/register
                             └─ formulario de registro ─▶ enviar
                                └─ POST /api/auth/register → 200 → /thank-you
                                   └─ correo: "Verify your email address" (enlace de un solo uso)
                                      └─ enlace de verificación ─▶ inicio de sesión ─▶ /dashboard/api-keys ─▶ Create API Key
                                                                                       │
       GET  api.inceptionlabs.ai/v1/models            200  ◀── verificación en vivo ────┐ │
       POST api.inceptionlabs.ai/v1/chat/completions  200  ◀─────────────────────────────┘ ▼
                                                                                    keys.txt
```

## 🎁 Nivel gratuito — cuánto obtienes

Cada cuenta comienza en el **Nivel Gratuito con 100.000.000 de tokens gratis** — medido de dos formas: la consola muestra *"You are on the Free Tier — you have used 0 of your 100,000,000 free tokens"*, y `GET /api/usage?quota=1` responde `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}`. La concesión es **por cuenta** y no expira, así que una cuenta nueva son 100M nuevos.

| Qué | Valor |
| --- | --- |
| Concesión de bienvenida | **100.000.000 de tokens** por cuenta — sin caducidad |
| Tarjeta requerida | **No** |
| Registro | `POST /api/auth/register` en un Chrome real (verificación del navegador + Turnstile) → correo de verificación → inicio de sesión |
| La unidad que escala | **una cuenta = una clave** → `--count N` son N concesiones de 100M |

> 💡 El nivel gratuito lo define Inception Labs y puede cambiar. Consulta los números en vivo en [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) — y deja que la propia verificación de la herramienta decida:

```bash
node src/cli.js verify --chat 30     # every key in keys.txt is re-tested (models + one chat call)
```

## 🤖 Modelos — los 3

`models.json` es la respuesta en vivo de `GET /v1/models` de una clave generada — **3 ids**:

|Modelo|✓|
|---|---|
|`mercury-2.5`|✓|

Sondeo en vivo de una clave (exactamente lo que hace el verificador):

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 Cómo usar la API

La URL base es **`https://api.inceptionlabs.ai/v1`** — compatible con OpenAI. Una clave del nivel gratuito responde al chat directamente.

**Cualquier SDK / curl**

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

**Cualquier agente con URL base personalizada** (Cursor, OpenCode, Kilo Code …): establece la URL base `https://api.inceptionlabs.ai/v1`, pega una clave, elige `mercury-2` o `mercury-2.5`.

## 🛠 Inicio rápido

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

Lo que queda en disco mientras se ejecuta:

| ruta | contenido |
| --- | --- |
| `keys.txt` | las claves, **una por línea**, añadidas en el momento en que una clave se verifica (ignorado por git) |
| `%USERPROFILE%\\inception-keys.txt` | un espejo de la misma lista, fuera del repositorio |
| `accounts.json` | un registro por intento: buzón, contraseña, estado de registro, prefijo de clave + ids de modelo (ignorado por git) |
| [`models.json`](models.json) | `GET /v1/models` tal como lo responde una clave generada |
| `out/` | registro de ejecución (`mint.log`), estado de salidas, la cola pendiente, volcados de DOM/red/captura por paso (ignorado por git) |

### 🖱️ El lanzador

El lanzador `src/launcher.js` controla mint / finish / verify / screen (+ 9Router) y almacena `count`/`conc` en `launcher.config.json`. Muestra los contadores de `proxies.txt` y `keys.txt` en la cabecera. `node src/launcher.js --connect-9router` registra las claves generadas en un 9Router local.

## ✅ Verificado y funcionando — cada clave se prueba

Una clave se escribe en `keys.txt` solo después de que la API en vivo responde con ella:

| comprobación | llamada | esperado |
| --- | --- | --- |
| auth + lista de modelos | `GET https://api.inceptionlabs.ai/v1/models` | `200` + los ids de modelo de la cuenta (`mercury-2`, `mercury-2.5`, `mercury-decide`) |
| generación real | `POST https://api.inceptionlabs.ai/v1/chat/completions` (`mercury-2.5`) | `200` |

El verificador exige ambos `200` — un `401`/`403` en cualquiera de las llamadas falla la clave de inmediato, y cualquier otra cosa (red, otros estados) reintenta en otra salida, hasta 6 intentos.

```bash
node src/cli.js verify --chat 30    # reproduces both checks for your own file at any time
```

## 🧭 Cómo funciona

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: Inception Labs page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.inceptionlabs.ai/v1/chat/completions → real content = the key is live
```

Por cuenta, un contexto de Chrome aislado (`openContext` da a cada contexto su propio proxy y almacenamiento):

1. un buzón nuevo del broker;
2. una salida asignada solo si responde **ambas** partes del sondeo en ese momento — la página de registro debe responder `2xx–4xx` **y** el host del script de Turnstile debe responder `200/301/302` (sin el widget no hay token, y sin el token se rechaza el POST de registro);
3. registro: la verificación del navegador de la consola se supera, el formulario se rellena, el Turnstile invisible produce su token, y `POST /api/auth/register` redirige la app a `/thank-you`;
4. se consume el correo de verificación, luego el inicio de sesión (sin captcha; se aplica una precomprobación con límite de tasa);
5. `/dashboard/api-keys` → **Create API Key**: la clave en texto plano se lee de la revelación de un solo uso y de la respuesta de red de creación de clave;
6. verificación en vivo (`/v1/models` + una finalización de chat) → `keys.txt`.

## ⚙️ Opciones de CLI

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat 30        # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| tarea | opciones |
| --- | --- |
| `mint` | `--count 30·--workers 3 (max 4)·--broker 9700·--fallback-broker 9701·--mail-wait 300000ms·--pending-total 2400000ms·--burst-wait 75000ms·--model mercury-2.5·--stop-keys N (0 = whole count)·--exit-relay (pins bursts to one exit)·--port 9930 (CDP)` |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>` (consume the verify link first; omit to go straight to sign-in) · `--tag <name>` (dump prefix, `f1`) · `--port N` (`9925`) |
| `verify` | `--model <id>` (`mercury-2.5`) · `--chat N` (the first N keys also get a chat completion, `30`) · `--only <key>` (check one key instead of the whole file) |
| `screen` | `--url <page>` (`https://platform.inceptionlabs.ai/login`) · `--out <file>` · `--concurrency N` (`8`) · `--timeout N` ms (`30000`) · `--limit N` (`1000`) · `--ok-min` / `--ok-max` (`200` / `399`) |

## 🛰️ Detrás de un proxy

`proxies.txt`, una salida por línea. Formatos aceptados (las líneas en blanco y los comentarios `#` / `//` se omiten; los rangos localhost/privados se rechazan):

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **Sondeo en el punto de uso, dos partes:** la página de registro más el host del script de Turnstile. Los resultados del sondeo se guardan en `out/exit-state.json`, y las salidas conocidas como malas se ordenan al final.
* **Proxies privados primero cuando existen:** `RESIDENTIAL_PROXIES=<file>` (o un `residential-proxies.txt` junto al `out/` de la herramienta) se prefiere para la fase de registro en el momento en que el archivo existe; cualquier salida alcanzable por la API sirve para el trabajo HTTP barato.
* **Los proxies HTTP con credenciales funcionan en todas partes;** una línea `socks5://user:pass@…` no se puede usar para los pasos del navegador (Chrome no puede responder a un prompt de autenticación SOCKS), pero sigue funcionando para `screen` y `verify`.

## 📄 Archivos

| Ruta | Contenido |
| --- | --- |
| `keys.txt` | las claves, **una por línea**, añadidas en el momento en que una clave se verifica — ignorado por git |
| `accounts.json` | un registro por cuenta: buzón, contraseña, estado de registro, prefijo de clave + ids de modelo — ignorado por git |
| [`models.json`](models.json) | `GET /v1/models` tal como lo responde una clave generada (3 ids) |
| `out/` | registro de ejecución (`mint.log`), estado de salidas, la cola pendiente, volcados de DOM/red/captura por paso — ignorado por git |
| `proxies.txt` | tu grupo de salidas, un proxy por línea — ignorado por git |

## 🔌 Conectar con 9Router

[9Router](https://9router.com) es un router autoalojado y compatible con OpenAI. Inception sirve un endpoint compatible con OpenAI (`https://api.inceptionlabs.ai/v1`), así que regístralo una vez y cada clave que hayas generado se convierte en una conexión bajo un nodo-proveedor — 9Router balancea la carga entre ellas:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

Ejecútalo sin `--api-key` para registrar **todas** las claves de `keys.txt`. Volver a ejecutarlo es idempotente: el nodo se empareja por `--prefix inception`, cada conexión se empareja por nombre (`inception-001`, `inception-002`, …), y una clave ya registrada se deja intacta. Valores por defecto: `--base http://localhost:20128`, `--password 123456`, `--name "Inception Labs"`, `--prefix inception`, `--base-url https://api.inceptionlabs.ai/v1`, `--model mercury-2.5`.

Dentro de 9Router las claves se sirven como:

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router` vuelve a comprobar `keys.txt` y lo registra en una sola pasada, y `node src/launcher.js` controla el mismo flujo desde su menú.

## 🔑 Qué te da una clave

| | |
| --- | --- |
| 🏢 Proveedor | **Inception Labs** — [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 Qué da el proveedor | LLM de difusión Mercury — cada cuenta 100M de tokens gratis, sin caducidad, una cuenta por clave |
| 🔑 Qué te da una clave | una clave API limitada a su propia cuenta: los 3 ids de modelo en el endpoint de abajo, con los límites de tu plan. La cuota vive en la **cuenta**, que es exactamente por lo que esta herramienta crea una cuenta por clave |
| 🌐 Forma de la API | Compatible con OpenAI: `POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 Tus datos | solo se contacta con platform.inceptionlabs.ai y el backend de buzón que configures; las claves permanecen en tu máquina |

## 🐞 Problemas

¿Inception cambió el flujo de registro, el widget de Turnstile, las rutas de autenticación o el endpoint de api-keys? La herramienta se detiene en ese paso y lo indica. **[Abre un issue](../../issues)** con el comando que ejecutaste y la salida exacta — los volcados por paso en `out/` (DOM + captura + red) hacen que los fallos sean reproducibles sin filtrar una clave. Los PR son bienvenidos.

## 📄 Licencia

MIT © 2026 — consulta [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey contributors

</div>