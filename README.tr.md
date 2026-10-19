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

**Inception Labs (Mercury) hesaplarını otomatik oluşturulan API anahtarlarıyla toplu oluşturun — OpenAI uyumlu çıkarım + 9Router bağlayıcısı.**

[![Node](https://img.shields.io/badge/Node-%E2%89%A518-3DA639?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![Dependencies](https://img.shields.io/badge/dependencies-0-blue?style=for-the-badge)](#)
[![License](https://img.shields.io/badge/license-MIT-6ea8fe?style=for-the-badge)](LICENSE)
[![Models](https://img.shields.io/badge/models-3%20served-412991?style=for-the-badge)](https://platform.inceptionlabs.ai/docs)
[![9Router](https://img.shields.io/badge/9Router-connector-8B5CF6?style=for-the-badge)](#-connect-to-9router)
[![X](https://img.shields.io/badge/X-%40bigbullapp-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/bigbullapp)

[🛠 Hızlı başlangıç](#-quick-start) · [🎁 Ücretsiz katman](#-free-tier--how-much-you-get) · [🤖 Modeller](#-models--all-3-of-them) · [🧪 API'yi kullanma](#-how-to-use-the-api) · [✅ Doğrulandı](#-verified-working--every-key-is-tested) · [🧭 Nasıl çalışır](#-how-it-works) · [🔌 9Router](#-connect-to-9router) · [⚙️ Seçenekler](#️-cli-options) · [🛰️ Proxy'ler](#️-behind-a-proxy) · [🐞 Sorunlar](#-issues)

</div>

<div align="center">

**English** · [Türkçe](README.tr.md) · [中文](README.cn.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Русский](README.ru.md) · [Português](README.pt.md)

</div>

---

## ✨ Bu neden var

Inception Labs, **Mercury**'yi — difüzyon LLM serisini (`mercury-2`, `mercury-2.5`, `mercury-decide`) — `api.inceptionlabs.ai/v1` adresinde OpenAI uyumlu bir API üzerinden sunar. Konsol, anahtarları **bir hesap altında** üretir (`/dashboard/api-keys`), dolayısıyla kullanışlı birim *anahtar başına bir hesap*tır — asla tek hesaptan birçok anahtar değil.

Araç, tüm yolu gerçek bir Chrome içinde yürür ve bir anahtarı ancak canlı API onunla yanıt verdikten sonra kaydeder:

```
proxies.txt ─▶ çıkış seçimi + kullanım noktası sondası (kayıt sayfası + challenges.cloudflare.com)
                   │
                   ▼
  izole Chrome bağlamı ─▶ platform.inceptionlabs.ai/auth/register
                             └─ kayıt formu ─▶ gönder
                                └─ POST /api/auth/register → 200 → /thank-you
                                   └─ posta: "Verify your email address" (tek kullanımlık bağlantı)
                                      └─ doğrulama bağlantısı ─▶ oturum açma ─▶ /dashboard/api-keys ─▶ Create API Key
                                                                                       │
       GET  api.inceptionlabs.ai/v1/models            200  ◀── canlı doğrulama ────┐ │
       POST api.inceptionlabs.ai/v1/chat/completions  200  ◀─────────────────────────┘ ▼
                                                                                    keys.txt
```

## 🎁 Ücretsiz katman — ne kadar elde edersiniz

Her hesap **100.000.000 ücretsiz token içeren Ücretsiz Katman** ile başlar — iki şekilde ölçülür: konsol *"You are on the Free Tier — you have used 0 of your 100,000,000 free tokens"* gösterir ve `GET /api/usage?quota=1` şu yanıtı verir: `{"isFreeTier":true,"limits":{"requests":null,"totalTokens":100000000,"inputTokens":100000000,"outputTokens":100000000},"freeTokenGrant":{"total":100000000,"default":100000000,"expiresAt":null}}`. Tahsis **hesap başına**dır ve süresi dolmaz, dolayısıyla yeni bir hesap yeni bir 100M'dir.

| Ne | Değer |
| --- | --- |
| Hoş geldin tahsisi | Hesap başına **100.000.000 token** — süresiz |
| Kart gerekli mi | **Hayır** |
| Kayıt | Gerçek bir Chrome'da `POST /api/auth/register` (tarayıcı kontrolü + Turnstile) → postayı doğrula → oturum aç |
| Ölçeklenen birim | **bir hesap = bir anahtar** → `--count N`, N adet 100M tahsisidir |

> 💡 Ücretsiz katman Inception Labs tarafından belirlenir ve değişebilir. Güncel sayıları [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) adresinden kontrol edin — ve kararı aracın kendi kapısına bırakın:

```bash
node src/cli.js verify --chat 30     # keys.txt içindeki her anahtar yeniden test edilir (modeller + bir sohbet çağrısı)
```

## 🤖 Modeller — 3 tanesinin tamamı

`models.json`, üretilmiş bir anahtarın canlı `GET /v1/models` yanıtıdır — **3 kimlik**:

|Model|✓|
|---|---|
|`mercury-2.5`|✓|

Bir anahtarın canlı sondası (doğrulayıcının tam olarak yaptığı şey):

```bash
curl https://api.inceptionlabs.ai/v1/chat/completions \
  -H "Authorization: Bearer <one of your keys>" \
  -H "Content-Type: application/json" \
  -d '{"model":"mercury-2.5","messages":[{"role":"user","content":"hi"}],"max_tokens":32}'
```

## 🧪 API nasıl kullanılır

Temel URL **`https://api.inceptionlabs.ai/v1`** — OpenAI uyumlu. Ücretsiz katman anahtarı sohbeti doğrudan yanıtlar.

**Herhangi bir SDK / curl**

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

**Özel temel URL kullanan herhangi bir ajan** (Cursor, OpenCode, Kilo Code …): temel URL'yi `https://api.inceptionlabs.ai/v1` olarak ayarlayın, bir anahtar yapıştırın, `mercury-2` veya `mercury-2.5` seçin.

## 🛠 Hızlı başlangıç

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

Çalışırken diske yazılanlar:

| yol | içerik |
| --- | --- |
| `keys.txt` | anahtarlar, **her satırda bir tane**, bir anahtar doğrulandığı anda eklenir (git tarafından yok sayılır) |
| `%USERPROFILE%\\inception-keys.txt` | aynı listenin bir kopyası, depo dışında |
| `accounts.json` | deneme başına bir kayıt: posta kutusu, parola, kayıt durumu, anahtar öneki + model kimlikleri (git tarafından yok sayılır) |
| [`models.json`](models.json) | üretilmiş bir anahtarın yanıtladığı `GET /v1/models` |
| `out/` | çalıştırma günlüğü (`mint.log`), çıkış durumu, bekleyen kuyruk, adım başına DOM/ağ/ekran görüntüsü dökümleri (git tarafından yok sayılır) |

### 🖱️ Başlatıcı

Başlatıcı `src/launcher.js`, mint / finish / verify / screen (+ 9Router) işlemlerini yürütür ve `count`/`conc` değerlerini `launcher.config.json` içinde saklar. Başlıkta `proxies.txt` ve `keys.txt` sayaçlarını gösterir. `node src/launcher.js --connect-9router`, üretilen anahtarları yerel bir 9Router'a kaydeder.

## ✅ Çalıştığı doğrulandı — her anahtar test edilir

Bir anahtar, `keys.txt` dosyasına ancak canlı API onunla yanıt verdikten sonra yazılır:

| kontrol | çağrı | beklenen |
| --- | --- | --- |
| kimlik doğrulama + model listesi | `GET https://api.inceptionlabs.ai/v1/models` | `200` + hesabın model kimlikleri (`mercury-2`, `mercury-2.5`, `mercury-decide`) |
| gerçek üretim | `POST https://api.inceptionlabs.ai/v1/chat/completions` (`mercury-2.5`) | `200` |

Doğrulayıcı her iki `200` üzerinde kapı tutar — herhangi bir çağrıda `401`/`403` anahtarı anında başarısız kılar ve başka her şey (ağ, diğer durum kodları) başka bir çıkışta, 6 denemeye kadar yeniden dener.

```bash
node src/cli.js verify --chat 30    # kendi dosyanız için her iki kontrolü istediğiniz zaman yeniden üretir
```

## 🧭 Nasıl çalışır

```
gelen kutusu (hesap başına bir adres)                            hesap başına yeni bir adres
   │
   ├─▶ kayıt: Inception Labs sayfası → e-posta adresi → gelen kutusundan kod / bağlantı
   ├─▶ oturum: hesabın çerezleri veya erişim token'ı elde
   ├─▶ anahtar üretimi: hesabın anahtar uç noktası → bir kez döndürülen düz metin anahtar (hemen diske yazılır)
   └─▶ canlı kanıt: POST https://api.inceptionlabs.ai/v1/chat/completions → gerçek içerik = anahtar canlı
```

Hesap başına, bir izole Chrome bağlamı (`openContext` her bağlama kendi proxy'sini ve depolamasını verir):

1. aracıdan yeni bir posta kutusu;
2. yalnızca **her iki** sonda ayağını şu anda yanıtlıyorsa verilen bir çıkış — kayıt sayfası `2xx–4xx` yanıtlamalı **ve** Turnstile betik sunucusu `200/301/302` yanıtlamalı (widget olmadan token olmaz ve token olmadan kayıt POST'u reddedilir);
3. kayıt: konsolun tarayıcı kontrolü geçer, form doldurulur, görünmez Turnstile token'ını üretir ve `POST /api/auth/register` uygulamayı `/thank-you` adresine yönlendirir;
4. doğrulama postası tüketilir, ardından oturum açılır (captcha yok; hız sınırlı bir ön kontrol uygulanır);
5. `/dashboard/api-keys` → **Create API Key**: düz metin anahtar tek seferlik gösterimden ve create-key ağ yanıtından okunur;
6. canlı doğrulama (`/v1/models` + bir sohbet tamamlama) → `keys.txt`.

## ⚙️ CLI seçenekleri

```bash
node src/cli.js mint   --count 30       # fresh accounts, one key each
node src/cli.js finish --email … --password …   # the key half for one existing account
node src/cli.js verify --chat 30        # re-check keys.txt (models + chat)
node src/cli.js screen --limit 400      # exits that reach the provider right now
node src/cli.js help                    # tasks and flags
```

| görev | bayraklar |
| --- | --- |
| `mint` | `--count 30·--workers 3 (max 4)·--broker 9700·--fallback-broker 9701·--mail-wait 300000ms·--pending-total 2400000ms·--burst-wait 75000ms·--model mercury-2.5·--stop-keys N (0 = whole count)·--exit-relay (pins bursts to one exit)·--port 9930 (CDP)` |
| `finish` | `--email <addr>` · `--password <pw>` · `--verify <link>` (consume the verify link first; omit to go straight to sign-in) · `--tag <name>` (dump prefix, `f1`) · `--port N` (`9925`) |
| `verify` | `--model <id>` (`mercury-2.5`) · `--chat N` (the first N keys also get a chat completion, `30`) · `--only <key>` (check one key instead of the whole file) |
| `screen` | `--url <page>` (`https://platform.inceptionlabs.ai/login`) · `--out <file>` · `--concurrency N` (`8`) · `--timeout N` ms (`30000`) · `--limit N` (`1000`) · `--ok-min` / `--ok-max` (`200` / `399`) |

## 🛰️ Proxy arkasında

`proxies.txt`, her satırda bir çıkış. Kabul edilen biçimler (boş satırlar ve `#` / `//` yorumları atlanır; localhost/özel aralıklar reddedilir):

```
socks5://127.0.0.1:1080
http://user:pass@10.0.0.1:3128
user:pass@10.0.0.2:1080          # defaults to http://
10.0.0.3:8080:user:pass
10.0.0.4|3128|user|pass
10.0.0.5:3128                    # bare host:port defaults to http://
```

* **Kullanım noktası sondası, iki ayak:** kayıt sayfası ve Turnstile betik sunucusu. Sonda sonuçları `out/exit-state.json` içinde saklanır ve bilinen kötü çıkışlar en sona sıralanır.
* **Özel proxy'ler varsa önce gelir:** `RESIDENTIAL_PROXIES=<file>` (veya aracın `out/` klasörünün yanındaki bir `residential-proxies.txt`), dosya var olduğu anda kayıt aşaması için tercih edilir; ucuz HTTP işleri için api'ye ulaşabilen herhangi bir çıkış uygundur.
* **Kimlik bilgili HTTP proxy'leri her yerde çalışır;** bir `socks5://user:pass@…` satırı tarayıcı adımları için kullanılamaz (Chrome bir SOCKS kimlik doğrulama istemini yanıtlayamaz), ancak `screen` ve `verify` için hâlâ çalışır.

## 📄 Dosyalar

| Yol | İçerik |
| --- | --- |
| `keys.txt` | anahtarlar, **her satırda bir tane**, bir anahtar doğrulandığı anda eklenir — git tarafından yok sayılır |
| `accounts.json` | hesap başına bir kayıt: posta kutusu, parola, kayıt durumu, anahtar öneki + model kimlikleri — git tarafından yok sayılır |
| [`models.json`](models.json) | üretilmiş bir anahtarın yanıtladığı `GET /v1/models` (3 kimlik) |
| `out/` | çalıştırma günlüğü (`mint.log`), çıkış durumu, bekleyen kuyruk, adım başına DOM/ağ/ekran görüntüsü dökümleri — git tarafından yok sayılır |
| `proxies.txt` | çıkış havuzunuz, her satırda bir proxy — git tarafından yok sayılır |

## 🔌 9Router'a bağlanma

[9Router](https://9router.com), kendi kendine barındırılan, OpenAI uyumlu bir yönlendiricidir. Inception, OpenAI uyumlu bir uç nokta sunar (`https://api.inceptionlabs.ai/v1`), dolayısıyla bir kez kaydedin ve ürettiğiniz her anahtar tek bir sağlayıcı düğümü altında bir bağlantı haline gelir — 9Router aralarında yük dengelemesi yapar:

```bash
node src/connect-9router.js \
  --base http://localhost:20128 --password 123456 \
  --api-key sk-xxxxxxxx
```

`--api-key` olmadan çalıştırın, `keys.txt` içindeki **her** anahtarı kaydetmek için. Yeniden çalıştırmak idempotenttir: düğüm `--prefix inception` ile eşleştirilir, her bağlantı adıyla eşleştirilir (`inception-001`, `inception-002`, …) ve zaten kayıtlı bir anahtara dokunulmaz. Varsayılanlar: `--base http://localhost:20128`, `--password 123456`, `--name "Inception Labs"`, `--prefix inception`, `--base-url https://api.inceptionlabs.ai/v1`, `--model mercury-2.5`.

9Router içinde anahtarlar şu şekilde sunulur:

```
inception/mercury-2.5
inception/mercury-2
inception/mercury-decide
```

`node src/cli.js verify --chat 30 --connect-9router`, `keys.txt` dosyasını yeniden kontrol eder ve tek geçişte kaydeder; `node src/launcher.js` ise aynı akışı menüsünden yürütür.

## 🔑 Bir anahtar size ne kazandırır

| | |
| --- | --- |
| 🏢 Sağlayıcı | **Inception Labs** — [platform.inceptionlabs.ai](https://platform.inceptionlabs.ai) |
| 🎁 Sağlayıcının verdikleri | Mercury difüzyon LLM'leri — her hesaba 100M ücretsiz token, süresiz, anahtar başına bir hesap |
| 🔑 Bir anahtarın size kazandırdıkları | kendi hesabına kapsanmış bir API anahtarı: aşağıdaki uç noktada 3 model kimliği, planınızın limitlerinde. Kota **hesapta** yaşar, bu aracın anahtar başına bir hesap oluşturmasının nedeni tam da budur |
| 🌐 API biçimi | OpenAI uyumlu: `POST https://api.inceptionlabs.ai/v1/chat/completions` |
| 🔒 Verileriniz | yalnızca platform.inceptionlabs.ai ve yapılandırdığınız gelen kutusu arka ucuna bağlanılır; anahtarlar makinenizde kalır |

## 🐞 Sorunlar

Inception kayıt akışını, Turnstile widget'ını, kimlik doğrulama rotalarını veya api-keys uç noktasını mı değiştirdi? Araç o adımda durur ve bunu bildirir. Çalıştırdığınız komut ve tam çıktıyla birlikte **[bir sorun açın](../../issues)** — `out/` içindeki adım başına dökümler (DOM + ekran görüntüsü + ağ) hataları bir anahtarı sızdırmadan yeniden üretilebilir kılar. PR'lar memnuniyetle karşılanır.

## 📄 Lisans

MIT © 2026 — bkz. [LICENSE](LICENSE).

<div align="center">

**[MIT](LICENSE)** © 2026 inception-bulk-apikey katkıda bulunanlar

</div>