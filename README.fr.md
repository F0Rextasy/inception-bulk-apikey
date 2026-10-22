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

**Créez en masse des comptes Inception Labs (Mercury) avec des clés API générées automatiquement — inférence compatible OpenAI + connecteur 9Router.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Démarrage rapide](#-quick-start) · [🎁 Niveau gratuit](#-free-tier--how-much-you-get) · [🤖 Modèles](#-models--all-3-of-them) · [🧪 Utiliser l'API](#-how-to-use-the-api) · [✅ Vérifié](#-verified-working--every-key-is-tested) · [🧭 Comment ça marche](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Options](#️-cli-options) · [🛰️ Proxys](#️-behind-a-proxy) · [🐞 Problèmes](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Pourquoi cet outil existe

Inception Labs sert **Mercury** — la gamme de LLM à diffusion (`mercury-2`, `mercury-2.5`, `mercury-decide`) — via une API compatible OpenAI à l'adresse `api.inceptionlabs.ai/v1`. La console génère des clés **rattachées à un compte** (`/dashboard/api-keys`), donc l'unité utile est *un compte par clé* — jamais plusieurs clés depuis un seul compte.

L'outil parcourt tout le chemin dans un vrai Chrome et n'enregistre une clé qu'après la réponse de l'API en direct :

```

proxies.txt ─▶ sélection de la sortie + sonde au point d'usage (page d'inscription + challenges.cloudflare.com)
                   │
                   ▼
  contexte Chrome isolé ─▶ platform.inceptionlabs.ai/auth/register
                             └─ formulaire d'inscription ─▶ soumission
                                └─ POST /api/auth/register → 200 → /thank-you
                                   └─ mail : « Verify your email address » (lien à usage unique)
                                      └─ lien de vérification ─▶ connexion ─▶ /dashboard/api-keys ─▶ Create API Key
                                                                                       │
       GET  api.inceptionlabs.ai/v1/models            200  ◀── vérification en direct ────┐ │
       POST api.inceptionlabs.ai/v1/chat/completions  200  ◀──────────────────────────────┘ ▼
                                                                                    keys.txt
```

## 🎁 Niveau gratuit — ce que vous obtenez

Chaque compte démarre sur le **Niveau gratuit avec 100 000 000 de tokens gratuits** — mesuré de deux façons : la console affiche *« You are on the Free Tier — you have used 0 of your 100,000,000 free tokens »*, et `GET /api/usage?quota=1` répond `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}`. L'attribution est **par compte** et n'expire pas, donc un nouveau compte équivaut à 100 M de plus.

| Quoi | Valeur |
| --- | --- |
| Attribution de bienvenue | **100 000 000 de tokens** par compte — sans expiration |
| Carte requise | **Non** |
| Inscription | `POST /api/auth/register` dans un vrai Chrome (vérification navigateur + Turnstile) → mail de vérification → connexion |
| L'unité qui monte en échelle | **un compte = une clé** → `--count N` correspond à N attributions de 100 M |

> 💡 Le niveau gratuit est défini par Inception Labs et peut changer. Consultez les chiffres en direct sur [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) — et laissez le contrôle de l'outil trancher :

```bash
node src/cli.js verify --chat 30     # every key in keys.txt is re-tested (models + one chat call)
```

## 🤖 Modèles — les 3

`models.json` est la réponse en direct de `GET /v1/models` d'une clé générée — **3 ids** :

|Model|✓|
|---|---|
|`mercury-2.5`|✓|

Sonde en direct d'une clé (exactement ce que fait le vérificateur) :

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 Comment utiliser l'API

L'URL de base est **`https://api.inceptionlabs.ai/v1`** — compatible OpenAI. Une clé du niveau gratuit répond directement au chat.

**N'importe quel SDK / curl**

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

**N'importe quel agent avec une URL de base personnalisée** (Cursor, OpenCode, Kilo Code …) : définissez l'URL de base `https://api.inceptionlabs.ai/v1`, collez une clé, choisissez `mercury-2` ou `mercury-2.5`.

## 🛠 Démarrage rapide

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

Ce qui est écrit sur le disque pendant l'exécution :

| chemin | contenu |
| --- | --- |
| `keys.txt` | les clés, **une par ligne**, ajoutées dès qu'une clé est vérifiée (ignoré par git) |
| `%USERPROFILE%\\inception-keys.txt` | un miroir de la même liste, en dehors du dépôt |
| `accounts.json` | un enregistrement par tentative : boîte mail, mot de passe, statut d'inscription, préfixe de clé + ids de modèles (ignoré par git) |
| [`models.json`](models.json) | `GET /v1/models` tel que répondu par une clé générée |
| `out/` | journal d'exécution (`mint.log`), état des sorties, file d'attente, dumps DOM/réseau/captures d'écran par étape (ignoré par git) |

### 🖱️ Le lanceur

Le lanceur `src/launcher.js` pilote mint / finish / verify / screen (+ 9Router) et stocke `count`/`conc` dans `launcher.config.json`. Il affiche les compteurs de `proxies.txt` et `keys.txt` dans l'en-tête. `node src/launcher.js --connect-9router` enregistre les clés générées dans un 9Router local.

## ✅ Vérifié et fonctionnel — chaque clé est testée

Une clé n'est écrite dans `keys.txt` qu'après la réponse de l'API en direct avec celle-ci :

| vérification | appel | attendu |
| --- | --- | --- |
| auth + liste des modèles | `GET https://api.inceptionlabs.ai/v1/models` | `200` + les ids de modèles du compte (`mercury-2`, `mercury-2.5`, `mercury-decide`) |
| génération réelle | `POST https://api.inceptionlabs.ai/v1/chat/completions` (`mercury-2.5`) | `200` |

Le vérificateur exige les deux `200` — un `401`/`403` sur l'un ou l'autre appel fait échouer la clé immédiatement, et tout le reste (réseau, autres statuts) réessaie sur une autre sortie, jusqu'à 6 tentatives.

```bash
node src/cli.js verify --chat 30    # reproduces both checks for your own file at any time
```

## 🧭 Comment ça marche

```
inbox (one address per account)                                  a fresh address per account
   │
   ├─▶ sign-up: Inception Labs page → e-mail address → code / link from the inbox
   ├─▶ session: the account's cookies or access token in hand
   ├─▶ key mint: the account's key endpoint → plaintext key returned once (written to disk immediately)
   └─▶ live proof: POST https://api.inceptionlabs.ai/v1/chat/completions → real content = the key is live
```

Par compte, un contexte Chrome isolé (`openContext` donne à chaque contexte son propre proxy et stockage) :

1. une boîte mail fraîche depuis le broker ;
2. une sortie attribuée uniquement si elle répond **aux deux** volets de la sonde à l'instant — la page d'inscription doit répondre `2xx–4xx` **et** l'hôte du script Turnstile doit répondre `200/301/302` (sans le widget, pas de token, et sans le token, le POST d'inscription est rejeté) ;
3. inscription : la vérification navigateur de la console passe, le formulaire se remplit, le Turnstile invisible produit son token, et `POST /api/auth/register` redirige l'application vers `/thank-you` ;
4. le mail de vérification est consommé, puis connexion (pas de captcha ; une pré-vérification limitée en débit s'applique) ;
5. `/dashboard/api-keys` → **Create API Key** : la clé en clair est lue depuis la révélation à usage unique et la réponse réseau de création de clé ;
6. vérification en direct (`/v1/models` + une complétion de chat) → `keys.txt`.

## ⚙️ Options CLI

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat 30        # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| tâche | options |
| --- | --- |
| `mint` | `--count 30·--workers 3 (max 4)·--broker 9700·--fallback-broker 9701·--mail-wait 300000ms·--pending-total 2400000ms·--burst-wait 75000ms·--model mercury-2.5·--stop-keys N (0 = whole count)·--exit-relay (pins bursts to one exit)·--port 9930 (CDP)` |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>` (consume the verify link first; omit to go straight to sign-in) · `--tag <name>` (dump prefix, `f1`) · `--port N` (`9925`) |
| `verify` | `--model <id>` (`mercury-2.5`) · `--chat N` (the first N keys also get a chat completion, `30`) · `--only <key>` (check one key instead of the whole file) |
| `screen` | `--url <page>` (`https://platform.inceptionlabs.ai/login`) · `--out <file>` · `--concurrency N` (`8`) · `--timeout N` ms (`30000`) · `--limit N` (`1000`) · `--ok-min` / `--ok-max` (`200` / `399`) |

## 🛰️ Derrière un proxy

`proxies.txt`, une sortie par ligne. Formats acceptés (les lignes vides et les commentaires `#` / `//` sont ignorés ; localhost/plages privées sont rejetés) :

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **Sonde au point d'usage, deux volets :** la page d'inscription plus l'hôte du script Turnstile. Les résultats de sonde sont conservés dans `out/exit-state.json`, et les sorties connues comme mauvaises sont triées en dernier.
* **Proxys privés en premier quand ils existent :** `RESIDENTIAL_PROXIES=<file>` (ou un `residential-proxies.txt` à côté du `out/` de l'outil) est préféré pour la phase d'inscription dès que le fichier existe ; toute sortie joignable par l'API convient pour le travail HTTP peu coûteux.
* **Les proxys HTTP avec identifiants fonctionnent partout ;** une ligne `socks5://user:pass@…` ne peut pas être utilisée pour les étapes navigateur (Chrome ne peut pas répondre à une invite d'authentification SOCKS), mais elle fonctionne toujours pour `screen` et `verify`.

## 📄 Fichiers

| Chemin | Contenu |
| --- | --- |
| `keys.txt` | les clés, **une par ligne**, ajoutées dès qu'une clé est vérifiée — ignoré par git |
| `accounts.json` | un enregistrement par compte : boîte mail, mot de passe, statut d'inscription, préfixe de clé + ids de modèles — ignoré par git |
| [`models.json`](models.json) | `GET /v1/models` tel que répondu par une clé générée (3 ids) |
| `out/` | journal d'exécution (`mint.log`), état des sorties, file d'attente, dumps DOM/réseau/captures d'écran par étape — ignoré par git |
| `proxies.txt` | votre pool de sorties, un proxy par ligne — ignoré par git |

## 🔌 Connexion à 9Router

[9Router](https://9router.com) est un routeur auto-hébergé compatible OpenAI. Inception sert un endpoint compatible OpenAI (`https://api.inceptionlabs.ai/v1`), donc enregistrez-le une fois et chaque clé générée devient une connexion sous un seul nœud fournisseur — 9Router répartit la charge entre elles :

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

Lancez-le sans `--api-key` pour enregistrer **toutes** les clés de `keys.txt`. Une réexécution est idempotente : le nœud est identifié par `--prefix inception`, chaque connexion est identifiée par son nom (`inception-001`, `inception-002`, …), et une clé déjà enregistrée est laissée telle quelle. Valeurs par défaut : `--base http://localhost:20128`, `--password 123456`, `--name "Inception Labs"`, `--prefix inception`, `--base-url https://api.inceptionlabs.ai/v1`, `--model mercury-2.5`.

Dans 9Router, les clés sont servies comme :

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router` revérifie `keys.txt` et l'enregistre en une seule passe, et `node src/launcher.js` pilote le même flux depuis son menu.

## 🔑 Ce qu'une clé vous apporte

| | |
| --- | --- |
| 🏢 Fournisseur | **Inception Labs** — [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 Ce que le fournisseur offre | LLM à diffusion Mercury — chaque compte 100 M de tokens gratuits, sans expiration, un compte par clé |
| 🔑 Ce qu'une clé vous apporte | une clé API limitée à son propre compte : les 3 ids de modèles sur l'endpoint ci-dessous, aux limites de votre forfait. Le quota est rattaché au **compte**, ce qui explique précisément pourquoi cet outil crée un compte par clé |
| 🌐 Forme de l'API | Compatible OpenAI : `POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 Vos données | seuls platform.inceptionlabs.ai et le backend de boîte mail que vous configurez sont contactés ; les clés restent sur votre machine |

## 🐞 Problèmes

Inception a modifié le flux d'inscription, le widget Turnstile, les routes d'authentification ou l'endpoint api-keys ? L'outil s'arrête à cette étape et le signale. **[Ouvrez un ticket](../../issues)** avec la commande exécutée et la sortie exacte — les dumps par étape dans `out/` (DOM + capture d'écran + réseau) rendent les échecs reproductibles sans divulguer de clé. Les PR sont bienvenues.

## 📄 Licence

MIT © 2026 — voir [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey contributors

</div>