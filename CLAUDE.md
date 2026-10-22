# DeğerLen — proje kuralları

## Amaç
Psikolog erişimi olmayan kişiler için BDT (bilişsel davranışçı) temelli, yazılı ve sesli yapay zekâ destek uygulaması. Psikologların yerini almaz, tanı koymaz. Dil: Türkçe + İngilizce. Hedef: önce Türkiye, sonra Google Play.

## Altyapı (hepsi ücretsiz katman)
- Tek Cloudflare Worker: statik dosyalar (`public/`) + `/api/chat`. Ayrı sunucu yok.
- Yapay zekâ: Workers AI (günlük ücretsiz kota). Modeller: `@cf/google/gemma-4-26b-a4b-it`, yedek `@cf/zai-org/glm-4.7-flash`.
- Kod GitHub'da (`nalciguler-netizen/degerlen`), Cloudflare Workers Builds ile otomatik yayın (`npx wrangler deploy`).
- Canlı adres: https://degerlen.yolhava-destek.workers.dev (`/api/health?ai=1` modelleri dener).
- Dosya düzeni: kökte `worker.js`, `wrangler.jsonc`, `package.json`; arayüz `public/` içinde (app.js, i18n.js, triage.js, style.css, index.html, sw.js, manifest, ikonlar).
- Kullanıcı yalnızca telefon kullanıyor: GitHub'a dosya yükleyerek güncelleme yapılır.

## Alınan kararlar
- Tüm kullanıcı verisi yalnızca cihazda (localStorage `degerlen.v1`); sunucuda veri tutulmaz.
- Ön değerlendirme: PHQ-9 + GAD-7 + 4 güvenlik sorusu (sayfa sayfa). PHQ ≥ 20 veya GAD ≥ 15, psikoz/mani → 14 gün kilit. İntihar düşüncesi → 24 saat kilit, yardım numaraları. PHQ 15–19 kilitlenmez, "yüksek" bant ve uzman önerisi.
- Sohbette riskli ifade (istemci + sunucu regex + modelin `[[RISK]]` çıktısı) → kilit, sohbet silinir.
- Günde en fazla 1 saat sohbet. Seans başı/sonu ruh hâli puanı (0–10).
- Seans yapısı: Beck'in bilişsel modeli ve Burns'ün "İyi Hissetmek" yöntemleri (kendi cümlelerimizle; kitap metni kopyalanmaz).
- "Geçmiş zaman travmaları": ayrıntı sorulmaz, yumuşak mod, 5 soruluk kısa tarama (kilitlemez).
- Mağaza metninde "terapi/tedavi" kelimeleri kullanılmaz; tek satır "Psikolog veya doktorun yerini tutmaz".
- Arayüz: koyu lacivert + turkuaz, alt sekme çubuğu. Ana rengi sonradan değiştirme.
- Cevaplar akış (stream) olarak gelir; olmazsa otomatik eski yönteme döner.

## Yapılmaması gerekenler
- Kişi bilgisi dışında sağlık verisini kimseye otomatik gönderme/bildirme (KVKK ve güven). E-posta/telefon toplama kararı verilmedi.
- Tanı, ilaç/doz önerisi, "tedavi ediyoruz" vaadi yok.
- Ücretli servis ekleme (uygulama gelir getirene kadar).
- Kitap, makale veya ölçek metnini kopyalama.
- Dosya/resim ekleme özelliği eklenmedi, eklenmeyecek (gizlilik riski).
- Kilit ve süre sınırı cihazda tutulur; verileri silen sıfırlayabilir — bunu "güvenli" diye pazarlama.
- Kullanıcıya uzun çok adımlı talimat verme; tek adım, kısa. Değişen dosyaları ver, tüm paketi tekrar verme. Kod/kavram dersi anlatma.

## Ticari kullanım kuralları
- Baştan ticari düşün: hizmet şartları, gizlilik/KVKK metni (avukat onaylı), açık rıza, VERBİS gereksinimi, Play Store sağlık politikası ve Data Safety formu.
- Yayın öncesi zorunlu: resmî geçerli Türkçe PHQ-9/GAD-7 metinleri, psikolog incelemesi, TÜRKPATENT marka kontrolü (kullanıcı yapıyor), Workers AI ücretsiz kota izleme, istek sınırlama.
- Play geliştirici hesabı eşi Yurdagül Güler adına; yeni hesapta 12 test kullanıcısı / 14 gün kapalı test kuralı geçerli olabilir.
- Gelir modeli kararı henüz yok; veri sunucuya taşınırsa önce hukuki çerçeve kurulur.

## Açık konular
- Kriz anında "güvendiğim kişi" ve güvenlik planı (cihazda, kullanıcı tetikler) mı, ortak klinik/kurumla onaylı geri arama mı — kullanıcı düşünüyor.
- v2 dosyalarının (worker.js + public içindekiler) GitHub'a yüklenip yayınlandığını doğrula; canlı akışlı cevabı dene.

## Test
`node` testleri (tr/en metin eşitliği, triyaj, risk, worker akışı) ve Playwright arayüz akışları; her pakette çalıştırılır.
