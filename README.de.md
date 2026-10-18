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

**Massenhaftes Erstellen von Inception Labs (Mercury)-Konten mit automatisch generierten API-Schlüsseln — OpenAI-kompatible Inferenz + 9Router-Konnektor.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Schnellstart](#-quick-start) · [🎁 Kostenlose Stufe](#-free-tier--how-much-you-get) · [🤖 Modelle](#-models--all-3-of-them) · [🧪 Die API verwenden](#-how-to-use-the-api) · [✅ Verifiziert](#-verified-working--every-key-is-tested) · [🧭 So funktioniert es](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Optionen](#️-cli-options) · [🛰️ Proxys](#️-behind-a-proxy) · [🐞 Probleme](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>


---

## ✨ Warum das existiert

Inception Labs stellt **Mercury** bereit — die Diffusion-LLM-Reihe (`mercury-2`, `mercury-2.5`, `mercury-decide`) — über eine OpenAI-kompatible API unter `api.inceptionlabs.ai/v1`. Die Konsole erzeugt Schlüssel **unter einem Konto** (`/dashboard/api-keys`), daher ist die nützliche Einheit *ein Konto pro Schlüssel* — niemals viele Schlüssel aus einem Konto.

Das Tool durchläuft den gesamten Pfad in einem echten Chrome und zeichnet einen Schlüssel erst auf, nachdem die Live-API geantwortet hat:

```
proxies.txt ─▶ Exit-Auswahl + Probe am Nutzungspunkt (Registrierungsseite + challenges.cloudflare.com)
                   │
                   ▼
  isolierter Chrome-Kontext ─▶ platform.inceptionlabs.ai/auth/register
                             └─ Registrierungsformular ─▶ absenden
                                └─ POST /api/auth/register → 200 → /thank-you
                                   └─ Mail: "Verify your email address" (Einmal-Link)
                                      └─ Verifizierungslink ─▶ Anmeldung ─▶ /dashboard/api-keys ─▶ Create API Key
                                                                                       │
       GET  api.inceptionlabs.ai/v1/models            200  ◀── Live-Verifizierung ────┐ │
       POST api.inceptionlabs.ai/v1/chat/completions  200  ◀─────────────────────────┘ ▼
                                                                                    keys.txt
```

## 🎁 Kostenlose Stufe — wie viel du bekommst

Jedes Konto startet in der **Free Tier mit 100.000.000 kostenlosen Tokens** — auf zwei Arten gemessen: Die Konsole zeigt *"You are on the Free Tier — you have used 0 of your 100,000,000 free tokens"*, und `GET /api/usage?quota=1` antwortet mit `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}`. Das Kontingent gilt **pro Konto** und läuft nicht ab, ein neues Konto ist also ein neues 100M.

| Was | Wert |
| --- | --- |
| Willkommens-Kontingent | **100.000.000 Tokens** pro Konto — kein Ablauf |
| Karte erforderlich | **Nein** |
| Registrierung | `POST /api/auth/register` in einem echten Chrome (Browser-Prüfung + Turnstile) → Mail verifizieren → Anmeldung |
| Die skalierende Einheit | **ein Konto = ein Schlüssel** → `--count N` sind N 100M-Kontingente |

> 💡 Die kostenlose Stufe wird von Inception Labs festgelegt und kann sich ändern. Prüfe die Live-Zahlen unter [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) — und lass das Gate des Tools selbst entscheiden:

```bash
node src/cli.js verify --chat 30     # every key in keys.txt is re-tested (models + one chat call)
```

## 🤖 Modelle — alle 3 davon

`models.json` ist die Live-Antwort von `GET /v1/models` eines erzeugten Schlüssels — **3 IDs**:

|Model|✓|
|---|---|
|`mercury-2.5`|✓|

Live-Probe eines Schlüssels (genau das, was der Verifizierer tut):

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 Die API verwenden

Die Basis-URL ist **`https://api.inceptionlabs.ai/v1`** — OpenAI-kompatibel. Ein Schlüssel der kostenlosen Stufe beantwortet Chat direkt.

**Jedes SDK / curl**

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

**Jeder Agent mit eigener Basis-URL** (Cursor, OpenCode, Kilo Code …): Basis-URL `https://api.inceptionlabs.ai/v1` setzen, einen Schlüssel einfügen, `mercury-2` oder `mercury-2.5` wählen.

## 🛠 Schnellstart

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

Was während der Ausführung auf der Festplatte landet:

| Pfad | Inhalt |
| --- | --- |
| `keys.txt` | die Schlüssel, **einer pro Zeile**, angehängt in dem Moment, in dem ein Schlüssel verifiziert wird (git-ignoriert) |
| `%USERPROFILE%\\inception-keys.txt` | eine Spiegelung derselben Liste, außerhalb des Repos |
| `accounts.json` | ein Datensatz pro Versuch: Mailbox, Passwort, Registrierungsstatus, Schlüssel-Präfix + Modell-IDs (git-ignoriert) |
| [`models.json`](models.json) | `GET /v1/models`, wie von einem erzeugten Schlüssel beantwortet |
| `out/` | Ausführungsprotokoll (`mint.log`), Exit-Status, die ausstehende Warteschlange, DOM-/Netzwerk-/Screenshot-Dumps pro Schritt (git-ignoriert) |

### 🖱️ Der Launcher

Der Launcher `src/launcher.js` steuert mint / finish / verify / screen (+ 9Router) und speichert `count`/`conc` in `launcher.config.json`. Er zeigt `proxies.txt`- und `keys.txt`-Zähler im Header an. `node src/launcher.js --connect-9router` registriert die erzeugten Schlüssel in einem lokalen 9Router.

## ✅ Verifiziert funktionierend — jeder Schlüssel wird getestet

Ein Schlüssel wird erst dann in `keys.txt` geschrieben, nachdem die Live-API damit geantwortet hat:

| Prüfung | Aufruf | Erwartet |
| --- | --- | --- |
| Auth + Modellliste | `GET https://api.inceptionlabs.ai/v1/models` | `200` + die Modell-IDs des Kontos (`mercury-2`, `mercury-2.5`, `mercury-decide`) |
| Echte Generierung | `POST https://api.inceptionlabs.ai/v1/chat/completions` (`mercury-2.5`) | `200` |

Der Verifizierer verlangt beide `200` — ein `401`/`403` bei einem der Aufrufe lässt den Schlüssel sofort durchfallen, und alles andere (Netzwerk, andere Statuscodes) wird über einen anderen Exit erneut versucht, bis zu 6 Versuche.

```bash
node src/cli.js verify --chat 30    # reproduces both checks for your own file at any time
```

## 🧭 So funktioniert es

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: Inception Labs page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.inceptionlabs.ai/v1/chat/completions → real content = the key is live
```

Pro Konto ein isolierter Chrome-Kontext (`openContext` gibt jedem Kontext seinen eigenen Proxy und Speicher):

1. eine frische Mailbox vom Broker;
2. ein Exit wird nur dann ausgegeben, wenn er **beide** Probe-Segmente gerade jetzt beantwortet — die Registrierungsseite muss `2xx–4xx` antworten **und** der Turnstile-Skript-Host muss `200/301/302` antworten (ohne das Widget gibt es kein Token, und ohne das Token wird der Registrierungs-POST abgelehnt);
3. Registrierung: Die Browser-Prüfung der Konsole wird bestanden, das Formular wird ausgefüllt, das unsichtbare Turnstile erzeugt sein Token, und `POST /api/auth/register` leitet die App zu `/thank-you`;
4. die Verifizierungsmail wird verbraucht, dann Anmeldung (kein Captcha; eine ratenbegrenzte Vorabprüfung greift);
5. `/dashboard/api-keys` → **Create API Key**: Der Klartext-Schlüssel wird aus der einmaligen Anzeige und der Wire-Antwort der Schlüsselerstellung gelesen;
6. Live-Verifizierung (`/v1/models` + eine Chat-Vervollständigung) → `keys.txt`.

## ⚙️ CLI-Optionen

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat 30        # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| Aufgabe | Flags |
| --- | --- |
| `mint` | `--count 30·--workers 3 (max 4)·--broker 9700·--fallback-broker 9701·--mail-wait 300000ms·--pending-total 2400000ms·--burst-wait 75000ms·--model mercury-2.5·--stop-keys N (0 = whole count)·--exit-relay (pins bursts to one exit)·--port 9930 (CDP)` |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>` (consume the verify link first; omit to go straight to sign-in) · `--tag <name>` (dump prefix, `f1`) · `--port N` (`9925`) |
| `verify` | `--model <id>` (`mercury-2.5`) · `--chat N` (the first N keys also get a chat completion, `30`) · `--only <key>` (check one key instead of the whole file) |
| `screen` | `--url <page>` (`https://platform.inceptionlabs.ai/login`) · `--out <file>` · `--concurrency N` (`8`) · `--timeout N` ms (`30000`) · `--limit N` (`1000`) · `--ok-min` / `--ok-max` (`200` / `399`) |

## 🛰️ Hinter einem Proxy

`proxies.txt`, ein Exit pro Zeile. Akzeptierte Formen (Leerzeilen und `#` / `//`-Kommentare werden übersprungen; localhost/private Bereiche werden abgelehnt):

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **Probe am Nutzungspunkt, zwei Segmente:** die Registrierungsseite plus der Turnstile-Skript-Host. Probe-Ergebnisse werden in `out/exit-state.json` gespeichert, und bekannt schlechte Exits werden zuletzt sortiert.
* **Private Proxys zuerst, wenn sie existieren:** `RESIDENTIAL_PROXIES=<file>` (oder eine `residential-proxies.txt` neben dem `out/` des Tools) wird für die Registrierungsphase bevorzugt, sobald die Datei existiert; jeder API-erreichbare Exit ist für die günstige HTTP-Arbeit in Ordnung.
* **HTTP-Proxys mit Zugangsdaten funktionieren überall;** eine Zeile `socks5://user:pass@…` kann nicht für die Browser-Schritte verwendet werden (Chrome kann keine SOCKS-Auth-Abfrage beantworten), funktioniert aber weiterhin für `screen` und `verify`.

## 📄 Dateien

| Pfad | Inhalt |
| --- | --- |
| `keys.txt` | die Schlüssel, **einer pro Zeile**, angehängt in dem Moment, in dem ein Schlüssel verifiziert wird — git-ignoriert |
| `accounts.json` | ein Datensatz pro Konto: Mailbox, Passwort, Registrierungsstatus, Schlüssel-Präfix + Modell-IDs — git-ignoriert |
| [`models.json`](models.json) | `GET /v1/models`, wie von einem erzeugten Schlüssel beantwortet (3 IDs) |
| `out/` | Ausführungsprotokoll (`mint.log`), Exit-Status, die ausstehende Warteschlange, DOM-/Netzwerk-/Screenshot-Dumps pro Schritt — git-ignoriert |
| `proxies.txt` | dein Exit-Pool, ein Proxy pro Zeile — git-ignoriert |

## 🔌 Mit 9Router verbinden

[9Router](https://9router.com) ist ein selbst gehosteter, OpenAI-kompatibler Router. Inception stellt einen OpenAI-kompatiblen Endpunkt bereit (`https://api.inceptionlabs.ai/v1`), also registriere ihn einmal, und jeder erzeugte Schlüssel wird zu einer Verbindung unter einem Provider-Node — 9Router verteilt die Last über sie:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

Führe es ohne `--api-key` aus, um **jeden** Schlüssel in `keys.txt` zu registrieren. Ein erneuter Lauf ist idempotent: Der Node wird über `--prefix inception` abgeglichen, jede Verbindung wird über den Namen abgeglichen (`inception-001`, `inception-002`, …), und ein bereits registrierter Schlüssel bleibt unangetastet. Standardwerte: `--base http://localhost:20128`, `--password 123456`, `--name "Inception Labs"`, `--prefix inception`, `--base-url https://api.inceptionlabs.ai/v1`, `--model mercury-2.5`.

Innerhalb von 9Router werden die Schlüssel bereitgestellt als:

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router` prüft `keys.txt` erneut und registriert es in einem Durchgang, und `node src/launcher.js` steuert denselben Ablauf über sein Menü.

## 🔑 Was ein Schlüssel dir bringt

| | |
| --- | --- |
| 🏢 Anbieter | **Inception Labs** — [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 Was der Anbieter gibt | Mercury-Diffusion-LLMs — jedes Konto 100M kostenlose Tokens, kein Ablauf, ein Konto pro Schlüssel |
| 🔑 Was ein Schlüssel dir bringt | einen API-Schlüssel, der auf sein eigenes Konto beschränkt ist: die 3 Modell-IDs am unten stehenden Endpunkt, im Rahmen der Limits deines Tarifs. Das Kontingent liegt beim **Konto**, genau deshalb erstellt dieses Tool ein Konto pro Schlüssel |
| 🌐 API-Form | OpenAI-kompatibel: `POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 Deine Daten | nur platform.inceptionlabs.ai und das von dir konfigurierte Inbox-Backend werden kontaktiert; Schlüssel bleiben auf deinem Rechner |

## 🐞 Probleme

Hat Inception den Registrierungsablauf, das Turnstile-Widget, die Auth-Routen oder den api-keys-Endpunkt geändert? Das Tool stoppt an diesem Schritt und sagt es. **[Öffne ein Issue](../../issues)** mit dem ausgeführten Befehl und der exakten Ausgabe — die Dumps pro Schritt in `out/` (DOM + Screenshot + Wire) machen Fehler reproduzierbar, ohne einen Schlüssel preiszugeben. PRs sind willkommen.

## 📄 Lizenz

MIT © 2026 — siehe [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey contributors

</div>