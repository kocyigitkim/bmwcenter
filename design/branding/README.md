# QuickCar — Marka ve İkon Varlıkları

Tüm ikonlar ve banner'lar tek bir kaynaktan üretilir:

```bash
python3 design/branding/generate_brand_assets.py
```

Script `Pillow` dışında bağımlılık istemez (`pip3 install pillow`). Geometri
`generate_brand_assets.py` içindeki `# glyph` bölümünde 1024×1024'lük bir grid
üzerinde tanımlıdır; renk paleti dosyanın başındaki `# palette` bölümündedir.
Tek bir değeri değiştirip scripti çalıştırmak bütün platformları senkron tutar.

## Marka

Logo, açık uçlu bir devir göstergesi (tachometer) kadranıdır; kadranın boşluğundan
çıkan ibre aynı zamanda **Q** harfinin kuyruğunu oluşturur.

| Rol | Hex |
|---|---|
| Zemin üst | `#16305C` |
| Zemin alt | `#060A14` |
| Kadran başlangıç | `#1E6BFF` |
| Kadran bitiş | `#37D8FF` |
| İbre | `#FFC64D` → `#FF8A1F` |

Uygulama içi `accent/blue` (`#0E63C4`) ile aynı aileden, ikon boyutunda daha
okunur olması için bir tık doygunlaştırılmıştır.

## iOS — kuruluma dahil

`QuickCar/Resources/Assets.xcassets/AppIcon.appiconset/` doğrudan güncellendi.
Xcode 15+ tek boyutlu (1024) app icon kullanır, kalan boyutları kendisi türetir.
`project.yml` zaten `ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon` ayarlıdır,
ek bir yapılandırma gerekmiyor.

| Dosya | Görünüm |
|---|---|
| `AppIcon.png` | Varsayılan (açık/koyu ortak) — alfa kanalı yok, App Store şartı |
| `AppIcon-Dark.png` | iOS 18 koyu tema — arka plan şeffaf, zemini sistem verir |
| `AppIcon-Tinted.png` | iOS 18 tonlu tema — gri tonlama, rengi sistem uygular |

## Android — hazır `res/` ağacı

Depoda Android modülü yok; `design/branding/android/res/` içeriği bir Android
projesine olduğu gibi kopyalanacak şekilde üretildi:

```bash
cp -R design/branding/android/res/* <android-projesi>/app/src/main/res/
```

`AndroidManifest.xml`:

```xml
<application
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
    ... />
```

Üretilenler (mdpi → xxxhdpi, 5 yoğunluk):

| Dosya | Amaç |
|---|---|
| `mipmap-anydpi-v26/ic_launcher.xml` | Adaptive icon tanımı (API 26+) |
| `mipmap-anydpi-v26/ic_launcher_round.xml` | Yuvarlak maske için aynı tanım |
| `mipmap-*/ic_launcher_background.png` | Adaptive arka plan katmanı (108dp) |
| `mipmap-*/ic_launcher_foreground.png` | Adaptive ön plan katmanı, glif 72dp güvenli alanda |
| `mipmap-*/ic_launcher_monochrome.png` | Android 13+ temalı ikon (Material You) |
| `mipmap-*/ic_launcher.png` | API < 26 için köşesi yuvarlatılmış raster ikon (48dp) |
| `mipmap-*/ic_launcher_round.png` | API < 26 yuvarlak launcher varyantı |
| `values/colors_quickcar.xml` | Marka renkleri |

## Mağaza görselleri — `design/branding/store/`

| Dosya | Boyut | Nerede kullanılır |
|---|---|---|
| `appstore_icon_1024.png` | 1024×1024 | App Store Connect uygulama ikonu (alfasız) |
| `play_icon_512.png` | 512×512 | Google Play mağaza ikonu |
| `play_feature_graphic_1024x500.png` | 1024×500 | Google Play "Feature graphic" (zorunlu) |
| `play_tv_banner_1280x720.png` | 1280×720 | Play TV banner / geniş tanıtım görseli |
| `marketing_banner_1200x630.png` | 1200×630 | Web ve sosyal medya paylaşım görseli (OG image) |

Banner metinleri `build_store()` içindeki çağrılarda; başlık/alt başlık/madde
metinleri sütun genişliğine göre otomatik küçültülür, taşma olmaz.

### Üretilmeyenler

Mağaza ekran görüntüleri (App Store 1290×2796, Play 1080×1920) gerçek uygulama
ekranlarından alınmalıdır — Simulator'da `⌘S` ile yakalanıp doğrudan yüklenebilir.
