# MES Lite Faz 2 Teknik Kapanis Notu

Bu dokuman, Faz 2'de eklenen operasyon/rota bazli uretim takibi yapisini teknik olarak anlatir. Amac, projeyi portfoy veya mulakat ortaminda sadece "ekran yaptim" diye degil, "gercek fabrika problemini veri modeli, backend kurallari, realtime senkronizasyon ve mobil saha akisiyle cozdum" diye anlatabilmektir.

## Faz 2'de Cozulen Problem

MVP'de bir is emri tek uretim adimi gibi takip ediliyordu. Gercek fabrikada ise bir urun cogunlukla birden fazla operasyon adimindan gecer:

```text
Kesim -> Montaj -> Kalite Kontrol
```

Bu durum su sorulari dogurur:

- Urun su anda hangi adimda?
- Hangi makine ve operator bu adimda calisti?
- Bir adimda fire, durus veya kalite riski olustu mu?
- Sonraki operator onceki adimdan gelen notu gordu mu?
- Uretim yoneticisi eksik kapanan veya duran operasyonu ayirt edebiliyor mu?

Faz 2 bu sorular icin rota, operasyon, operasyon mesaji, operasyon bazli uretim kaydi, kalite baglantisi ve kalici bildirim yapisini kurdu.

## Kullanilan Teknolojiler

### Backend

- `Node.js` ve `Express`: REST API katmani icin kullanildi.
- `Prisma`: PostgreSQL tablolarini modellemek, iliskileri kurmak ve transaction icinde tutarli guncelleme yapmak icin kullanildi.
- `PostgreSQL`: is emri, operasyon, uretim kaydi, kalite, bildirim ve audit verilerinin kalici saklandigi veritabani.
- `Socket.io`: backend'de commit edilmis degisiklikleri web ve mobil ekranlara anlik bildirmek icin kullanildi.
- `JWT`: web ve mobil kullanicilarin kimlik dogrulamasinda kullanildi.
- `bcrypt`: kullanici sifrelerini hashlemek icin kullanildi.
- `zod`: request body validasyonu icin kullanildi.

### Web

- `React` ve `Vite`: yonetici paneli, is emri timeline'i, kalite ekrani ve dashboard icin kullanildi.
- `Tailwind CSS`: web arayuz stilleri icin kullanildi.
- `Recharts`: dashboard grafiklerinde kullanildi.
- `socket.io-client`: web ekranlarinin backend eventlerini dinlemesi icin kullanildi.
- `lucide-react`: web panel ikonlari icin kullanildi.

### Mobil

- `React Native Expo`: operator saha uygulamasi icin kullanildi.
- `react-native-web`: mobil uygulamayi bilgisayarda web uzerinden test edebilmek icin kullanildi.
- `expo-image-picker`: operatorun kamera veya galeriden gorsel kanit eklemesi icin kullanildi.
- `socket.io-client`: mobilde operasyon mesaji, bildirim ve is emri degisikliklerini anlik almak icin kullanildi.
- `AsyncStorage`: mobil token ve oturum bilgisini saklamak icin kullanildi.

## Veri Modeli

Faz 2'nin ana tablolari sunlardir:

- `product_routes`: Urune ait rota sablonunu tutar.
- `route_operations`: Rota icindeki sirali operasyon sablonlarini tutar.
- `work_orders`: Gercek is emrini tutar.
- `work_order_operations`: Is emrine bagli gercek operasyon adimlarini tutar.
- `operation_messages`: Operasyon bazli mesaj, uyari, kalite notu ve durus bilgisini tutar.
- `production_logs`: Operatorun urettigi adet, fire, not ve makine baglamini tutar.
- `production_log_attachments`: Uretim kaydina bagli gorsel kaniti tutar.
- `quality_checks`: Kalite sonucunu is emri ve ilgili operasyon baglaminda tutar.
- `notifications`: Kullaniciya giden kalici bildirimleri tutar.
- `audit_logs`: Kritik backend aksiyonlarinin izini tutar.

Bu modelin en onemli noktasi, uretim bilgisinin sadece is emri seviyesinde degil, operasyon seviyesinde de tutulmasidir. Boylece "hangi adimda ne oldu?" sorusu cevaplanabilir.

## Kritik Backend Kurallari

### 1. Operator sadece kendi operasyonunu yonetir

`workOrderOperation.service.js` icindeki yetki kontrolu sayesinde operator yalnizca `assignedOperatorId` kendisine ait olan operasyonu baslatabilir, duraklatabilir, tamamlayabilir veya mesaj yazabilir.

Bu kuralin cozdugu fabrika problemi:

```text
Yanlis operatorun baska bir istasyonun uretimini veya durumunu degistirmesi engellenir.
```

### 2. Operasyon tamamlamak icin uretim kaydi gerekir

Operasyon `COMPLETED` olmadan once ilgili operasyon icin en az bir `production_logs` kaydi olmalidir.

Bu kuralin cozdugu problem:

```text
Ekranda "tamamlandi" yazip veritabaninda hic uretim kaydi olmamasi engellenir.
```

### 3. Operator eksik uretimi kapatamaz

Operator, operasyonun `producedQuantity` degeri is emrinin `plannedQuantity` degerinden dusukse operasyonu tamamlayamaz. Eksik kapatma ancak admin veya uretim yoneticisi gibi ust roller icin istisnai mudaha olarak dusunulur.

Bu kuralin cozdugu problem:

```text
Musteri 120 adet beklerken operatorun 48 adet uretip isi tamamlandi gostermesi engellenir.
```

### 4. Ara operasyon final uretim adedini sisirmez

Rotali uretimde Kesim, Montaj gibi ara operasyonlar kendi `producedQuantity` alanini artirir. Ana is emrinin `producedQuantity` degeri sadece final operasyon uretimiyle artar.

Bu kuralin cozdugu problem:

```text
Kesim 100 + Montaj 100 + Kalite 100 girildiginde sistem 300 adet uretilmis gibi davranmaz.
```

### 5. Operasyon devri otomatik yapilir

Bir operasyon tamamlaninca backend siradaki operasyonu `READY` durumuna alir. Siradaki operasyonun operatoru varsa `notifications` tablosuna kalici bildirim olusturulur.

Bu kuralin cozdugu problem:

```text
Sonraki operator urunun kendisine geldiginden habersiz kalmaz.
```

### 6. Eksik kapanan operasyon kontrollu yeniden acilir

Admin veya uretim yoneticisi, eksik kapanmis bir operasyonu yeniden baslatabilir. Backend sonraki operasyonlarda henuz uretim yoksa downstream operasyonlari tekrar `WAITING` yapar.

Bu kuralin cozdugu problem:

```text
Eksik uretim fark edildiginde surec kontrollu sekilde geri alinabilir; sonraki adimlar yanlis sirada devam etmez.
```

## Transaction ve Veri Tutarliligi

Uretim kaydi olusturulurken backend tek bir transaction icinde su islemleri yapar:

1. `production_logs` kaydi olusturulur.
2. Ilgili operasyonun `producedQuantity` ve `scrapQuantity` alanlari guncellenir.
3. Gerekirse is emri durumu `IN_PROGRESS` olur.
4. Final operasyon ise ana is emrinin uretim adedi artar.
5. Kritik uyari varsa `production_alerts` ve `notifications` olusturulur.
6. `audit_logs` kaydi yazilir.

Bu yaklasim, bir islem yarida kalirsa sistemde eksik toplam veya kopuk iliski kalmasini engeller.

## Realtime Akis

Realtime mimaride REST API asil veri yazma kanalidir. Socket.io ise sadece commit edilmis degisikliklerin ekranlara haber verilmesi icin kullanilir.

Backend event ornekleri:

- `workOrder:updated`
- `workOrderOperation:updated`
- `production:logged`
- `operationMessage:created`
- `notification:created`
- `productionAlert:created`
- `quality:checked`

Web tarafinda dashboard, is emirleri ve bildirim ekranlari bu eventleri dinler ve ilgili veriyi REST API'den tekrar ceker.

Mobil tarafinda operator uygulamasi su eventleri dinler:

- `operationMessage:created`
- `workOrderOperation:updated`
- `notification:created`
- `workOrder:updated`
- `production:logged`

Bu karar su nedenle onemlidir:

```text
Socket event payload'i tek basina kaynak gercegi degildir. Kaynak gercegi PostgreSQL'dir. Event sadece "veri degisti, yeniden oku" sinyalidir.
```

## Mobil Akis

Mobil uygulama operator icin sade bir saha ekranidir:

1. Operator giris yapar.
2. Sadece kendisine atanmis aktif operasyonlari gorur.
3. Is emrine tiklayinca detay sekmesine gecer.
4. Operasyon akisi icinde hangi adimlar bitti, hangisi su anda aktif, hangisi sirada gorunur.
5. Operator kendi operasyonunu baslatir, duraklatir veya tamamlar.
6. Uretim sekmesinde uretim/fire/not/gorsel kanit girer.
7. Operasyon mesaji veya kritik uyari gonderebilir.
8. Sonraki operator veya yonetici bildirim alir.

Son UI duzenlemesiyle mobil ekran `Isler / Detay / Uretim` sekmelerine ayrildi. Bu, telefon ekraninda her seyin ayni anda yigilmasini engeller.

## Web Akis

Web paneli uretim yoneticisi ve admin icin kontrol merkezidir:

- Is emirleri listesi ve arama
- Operasyon timeline'i
- Renkli operasyon durumlari
- Riskli is emirleri ozeti
- Operasyon mesajlari
- Uretim kayitlari
- Operator notlari ve gorsel kanitlar
- Kalite kontrol girisi
- Bildirim merkezi

Web tarafinda normal uretim adedi girisi hedeflenmez. Uretim verisinin ana kaynagi mobil operatordur. Web, planlama ve izleme merkezidir.

## Kabul Testi

Faz 2 icin kabul testi:

```bash
cd backend
npm run seed:demo
npm run test:phase2
```

Test su kurallari otomatik dogrular:

- 4 demo is emri olusur.
- Her is emrinde 3 operasyon vardir.
- Ara operasyon uretimi final is emri adedini sisirmez.
- Operator eksik uretimi tamamlandi diye kapatamaz.
- Duraklatilan operasyon yeniden baslatilabilir.
- Eksik kapanan operasyon admin/yonetici tarafindan yeniden acilabilir.
- Operasyon tamamlaninca sonraki operasyon `READY` olur.
- Siradaki operatore kalici bildirim gider.
- Kalite sonucu final operasyonla iliskili tutulur.

Bu test UI testi degil, backend is kurali testidir. Cunku fabrika sisteminde en kritik hata ekranda degil, veritabaninda yanlis durum veya yanlis toplam kalmasidir.

## Mulakatta Anlatilabilecek Kilit Noktalar

- "Realtime'i veri yazmak icin degil, commit edilmis backend degisikliklerini ekranlara duyurmak icin kullandim."
- "Ara operasyon uretimlerini final is emri toplamindan ayirdim; yoksa rotali uretimde adetler sisiyordu."
- "Operatorun planlanan adetten dusuk uretimi tamamlandi diye kapatmasini backend servis katmaninda engelledim."
- "Mobil UI sadece operatorun kendi islerini gosteriyor; yetki kontrolu hem UI'da hem backend'de var."
- "Kalite sonucunu sadece is emrine degil, operasyon adimina bagladim. Boylece hata hangi makine/operator/adim baglaminda cikti takip edilebiliyor."
- "Demo seed ve acceptance test yazarak Faz 2'yi tekrar test edilebilir hale getirdim."

## Faz 2 Sonrasi Teknik Borclar

- Web bundle boyutu icin route bazli code splitting eklenebilir.
- Bildirimlerde okundu bilgisini is emri/operasyon bazinda daha ayrintili izlemek icin `notification_reads` gibi ayrik tablo dusunulebilir.
- Mobilde offline uretim girisi ve sonra senkronizasyon Faz 3 veya Faz 4 konusu olabilir.
- Operasyonlar icin hedef sure/gercek sure KPI'i eklenebilir.
- Makine durus nedenleri ayrik tabloya tasinabilir.

## Kisa Sonuc

Faz 2 ile MES Lite, basit bir uretim kayit uygulamasindan operasyon bazli izlenebilirlik sistemi seviyesine cikti. En onemli kazanim, sahadan gelen uretim verisinin operasyon, operator, makine, kalite ve bildirim baglaminda tutarli sekilde iliskilendirilmesidir.
