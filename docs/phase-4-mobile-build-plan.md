# Faz 4 - Mobile Build ve Dagitim Plani

Bu dokuman MES Lite mobil uygulamasini Expo/EAS ile telefona kurulabilir demo seviyesine getirmek icin hazirlandi.

## Amac

Web deploy bir URL uretir. Mobil deploy ise genelde bir uygulama paketi uretir:

```text
Android APK / AAB
iOS IPA
```

Portfoy ve demo icin ilk hedef:

```text
Android preview APK
```

Bu APK Play Store'a yuklenmeden telefona kurulabilir.

## Mobil Deploy Secenekleri

### 1. Expo Go

Gelistirme icin en hizli yoldur.

Artisi:

- QR ile hizli test edilir.
- Build beklenmez.

Eksisi:

- Native push ve bazi cihaz ozelliklerinde sinirli olabilir.
- Portfoy demo icin "indirilebilir uygulama" hissi vermez.

### 2. EAS Development Build

Gelistirme icin ozel native uygulama uretir.

Artisi:

- Expo Go'dan daha gercekci test saglar.
- Native moduller daha dogru test edilir.

Eksisi:

- Build sureci vardir.
- Expo hesabina ve EAS CLI'a ihtiyac duyar.

### 3. EAS Preview APK

Portfoy demo icin en mantikli adimdir.

Artisi:

- Android telefona indirilebilir APK uretir.
- Play Store gerekmez.
- Test kullanicilarina link verilebilir.

Eksisi:

- Android disinda iOS icin farkli dagitim sureci gerekir.

### 4. Store Release

Play Store / App Store yayini icindir.

Bu proje icin simdilik sart degildir.

## Eklenen Config

```text
mobile/eas.json
mobile/app.json
mobile/metro.config.js
```

### `mobile/eas.json`

Uc build profili vardir:

```text
development -> development client
preview     -> Android APK
production  -> Android App Bundle
```

`preview` profili su API'ye baglanir:

```text
EXPO_PUBLIC_API_URL=https://meslite-production.up.railway.app/api
```

### `mobile/app.json`

Uygulama kimligi ve native izinler tanimlandi:

```text
android.package=com.meslite.mobile
ios.bundleIdentifier=com.meslite.mobile
```

Kamera, galeri ve bildirim izinleri eklendi.

### `mobile/metro.config.js`

Monorepo/workspace yapisinda mobil bundler'in hem `mobile/node_modules` hem de kok `node_modules` paketlerini okuyabilmesi saglandi.

Bu karar su problemi cozer:

```text
Expo web/native bundler, workspace kokunde duran expo-notifications gibi paketleri bulamazsa build kirilir.
```

## Gerekli Hesap ve Araçlar

1. Expo hesabi
2. EAS CLI
3. Android preview build icin Expo/EAS projesi

EAS CLI kurulumu:

```powershell
npm install -g eas-cli
```

Giris:

```powershell
eas login
```

## Ilk Kurulum

Mobile klasorunde:

```powershell
cd mobile
eas init
```

Bu komut Expo projesini EAS ile esler ve `projectId` olusturur.

`app.json` icindeki:

```text
extra.eas.projectId
```

alanini EAS kendi doldurabilir veya sonradan guncelleyebilir.

## Android Preview APK Build

Mobile klasorunde:

```powershell
eas build --platform android --profile preview
```

Beklenen sonuc:

```text
EAS bir Android APK build linki uretir.
```

Bu link telefonda acilarak APK indirilebilir.

## Production API Baglantisi

Mobil build icin API URL:

```text
https://meslite-production.up.railway.app/api
```

Bu deger `mobile/eas.json` icindeki `env` alaninda tanimlandi.

Local test icin hala `.env` kullanilabilir:

```text
EXPO_PUBLIC_API_URL=http://localhost:4000/api
```

## Test Akisi

APK telefona kurulduktan sonra:

1. Operator ile login ol:

```text
operator@meslite.local
Admin123!
```

2. Is emirleri listelenmeli.
3. Operasyon detayina girilmeli.
4. Uretim/fire kaydi girilmeli.
5. Operasyon mesaji gonderilmeli.
6. Web panelde bildirim gorunmeli.
7. Kamera/galeri ile gorsel secimi test edilmeli.

## Push Notification Notu

Mobil uygulamada push token kaydi icin `expo-notifications` kullanilir.

Gercek push davranisi icin:

- EAS project id dogru olmali.
- Cihaz bildirim izni vermeli.
- Backend push token'i `push_tokens` tablosuna kaydetmeli.
- Backend notification olustururken Expo Push API'ye istek atabilmeli.

## Bildirim Test Checklist

Bildirim degisikliginden sonra mutlaka en yeni EAS APK kurulmalidir. Eski APK'lar onceki Android notification channel ayarlarina takilabilir.

1. En yeni APK'yi telefona kur.
2. Android uygulama ayarlarindan MES Lite bildirim iznini ac.
3. Operator ile bir kez giris yap; boylece Expo push token backend'e kaydedilir.
4. Uygulamayi arka plana al veya kapat.
5. Web panelden ayni operatore atanmis is emri olustur/baslat/tekrar baslat.
6. Beklenen sonuc: Android bildirim cubugunda MES Lite bildirimi gorunur, varsayilan ses/titresim calar ve destekleyen launcher'larda uygulama rozeti artar.

Not: Android uygulama rozeti telefonun launcher destegine baglidir. Launcher badge desteklemiyorsa bildirim cubugu yine ana takip noktasi olarak calisir.

## Kisa Mulakat Anlatimi

Mobil tarafi sadece webde calisan bir React Native ekran olarak birakmadim. EAS build profilleriyle Android preview APK uretilebilir hale getirdim. Production API URL'i build-time env olarak veriliyor, native izinler app config'te tanimli ve monorepo bagimlilik cozumu Metro config ile duzenlendi. Boylece operator uygulamasi gercek telefonda test edilebilir bir saha uygulamasi seviyesine yaklasti.
