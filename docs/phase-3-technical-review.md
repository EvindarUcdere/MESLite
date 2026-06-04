# MES Lite Faz 3 Teknik Kapanis Raporu

Bu dokuman, Faz 3'te eklenen uretim akisi, kalite karari, vardiya, durus, bildirim ve raporlama altyapisini teknik olarak anlatir.

Amac, projeyi sadece "ekranlari olan bir CRUD uygulamasi" seviyesinde degil, gercek bir fabrikada kritik olan su sorulara cevap veren bir MES MVP'si olarak anlatabilmektir:

- Urun su anda hangi operasyon adiminda?
- Onceki adimdan kac saglam urun sonraki adima aktarildi?
- Fire, durus veya kalite sorunu hangi makine/operator/vardiya baglaminda olustu?
- Operator islemi bitirdiginde siradaki operator nasil haberdar oldu?
- Kalite uygunsuzlugu icin geri isleme, hurda veya sartli kabul karari nasil kayit altina alindi?
- Mobil uygulama kapaliyken veya arka plandayken bildirim nasil gidecek?

## Faz 3'te Cozulen Gercek Fabrika Problemleri

### 1. Operasyon sadece durum degil, miktar akisidir

Gercek uretimde bir is emri tek parca halinde ilerlemez. Urun sirayla operasyonlardan gecer:

```text
Kesim -> Montaj -> Kalite -> Paketleme
```

Faz 3'te her operasyonun kendi uretim, fire, durus ve mesaj kaydi tutuldu. Boylece sistem "is emri uretimde" demekle kalmaz, urunun hangi adimda oldugunu ve onceki adimdan ne kadar saglam miktar geldigini hesaplar.

### 2. Fire sonraki operasyonun kapasitesini dusurur

Bir onceki adimda fire olustuysa, sonraki adim fiziksel olarak o fireli urunu uretemez. Bu nedenle aktarilabilir miktar su kuralla hesaplanir:

```text
Ilk operasyon aktarim miktari = is emri planlanan adet
Sonraki operasyon aktarim miktari = onceki operasyon uretim adedi - onceki operasyon fire adedi
```

Bu kuralin cozdigi fabrika problemi:

```text
Kesimde 120 parcanin 20 tanesi fire olduysa montaj operatoru 120 parca uretmis gibi kayit giremez.
```

### 3. Operator eksik uretimi tamamlandi diye kapatamaz

Operator bir operasyonu kapatirken backend, o operasyon icin beklenen aktarim miktarinin tamamlanip tamamlanmadigini kontrol eder.

Kurallar:

- Operator, beklenen miktardan az uretimle operasyonu `COMPLETED` yapamaz.
- Uretim yoneticisi veya admin, istisnai is karariyla eksik kapatma yapabilir.
- Bu istisna normal operator akisi degil, yonetsel mudahale olarak ele alinir.

Bu kuralin cozdigi problem:

```text
Musteri 100 adet beklerken operatorun 82 adet uretip isi tamamlandi gostermesi engellenir.
```

### 4. Duraklatma sebebi raporlanabilir hale geldi

Bir operasyon durdugunda sadece `PAUSED` demek yeterli degildir. Faz 3'te durus sebebi, vardiya, makine, operator ve operasyonla iliskili olarak kaydedildi.

Durus nedenleri enum olarak tutulur:

```text
MACHINE_FAILURE
MATERIAL_WAITING
QUALITY_WAITING
MAINTENANCE
SETUP
OPERATOR_BREAK
OTHER
```

Enum kullanilmasinin sebebi, raporda ayni sebebin farkli yazimlarla bolunmesini engellemektir.

### 5. Kalite uygunsuzlugu karar akisi kazandi

Kalite sonucu basarisiz veya kismi oldugunda sistem sadece uyari gostermez. `ProductionAlert` uzerinde kalite karari saklanir:

```text
REWORK_OPERATION
SCRAP
CONDITIONAL_ACCEPT
```

Bu sayede kalite problemi icin "ne yapildi?" sorusu cevaplanabilir:

- Geri isleme mi verildi?
- Hurdaya mi ayrildi?
- Sartli kabul mu verildi?
- Karari kim verdi?
- Hangi operasyon tekrar aksiyon alacak?

### 6. Mobil ve web arasinda anlik operasyon iletisimi kuruldu

Operator mobilde operasyon bazli mesaj gonderebilir. Yonetici webde is emri/operasyon baglaminda bunu gorur. Webden gonderilen mesaj da mobilde ilgili is emri detayinda gorunur.

Bu genel chat degildir. Mesajlar is emri ve operasyonla baglidir. Bu karar, fabrika ortaminda mesajin baglamini kaybetmemek icin onemlidir.

## Kullanilan Teknolojiler ve Nerede Kullanildiklari

### Backend

- `Node.js`: API runtime'i.
- `Express`: REST endpoint katmani.
- `PostgreSQL`: kalici kaynak gercek. Is emri, operasyon, uretim, kalite, bildirim, durus ve rapor verilerinin ana kaynagi.
- `Prisma`: veritabani modelleme, iliskili sorgular ve transaction yonetimi.
- `Socket.io`: commit edilmis backend degisikliklerini web ve mobile anlik duyurmak.
- `JWT`: web ve mobil oturum dogrulamasi.
- `bcrypt`: kullanici sifrelerini hashlemek.
- `zod`: request body validasyonu.
- `multer`: operatorun uretim kaydina gorsel kanit ekleyebilmesi icin dosya yukleme.
- `Expo Push API`: mobil uygulama arka planda veya kapaliyken bildirim gondermeye hazir altyapi.

### Web

- `React`: admin, uretim yoneticisi ve kalite personeli ekranlari.
- `Vite`: hizli gelistirme ve build altyapisi.
- `Tailwind CSS`: panel arayuzu ve responsive stiller.
- `Recharts`: rapor ve dashboard grafiklerini gostermek.
- `socket.io-client`: web tarafinda realtime eventleri dinlemek.
- `lucide-react`: panel ikonlari.

### Mobil

- `React Native Expo`: operator saha uygulamasi.
- `react-native-web`: mobil uygulamayi bilgisayar tarayicisinda test etmek.
- `AsyncStorage`: mobil token ve oturum bilgisini saklamak.
- `socket.io-client`: mobilde is emri, mesaj ve bildirim degisikliklerini almak.
- `expo-image-picker`: kamera ve galeriden gorsel kanit secmek.
- `expo-notifications`: cihaz ustu bildirim ve push token altyapisi.

## Backend Mimarisi

Backend moduler bir yapiyla ilerler:

```text
src/modules
  auth
  users
  products
  machines
  work-orders
  work-order-operations
  production-logs
  production-alerts
  quality-checks
  notifications
  push-tokens
  reports
```

Temel prensip:

```text
Route -> Validation -> Controller -> Service -> Prisma/PostgreSQL
```

### Neden servis katmani?

Fabrika sistemlerinde en kritik sey, is kuralinin sadece UI'da kalmamasidir. Bu nedenle su kurallar backend service katmaninda uygulanir:

- Operator sadece kendisine atanan operasyonu baslatabilir.
- Eksik miktarla operasyon kapatma engellenir.
- Sonraki operasyona aktarilabilir miktar backend'de hesaplanir.
- Operasyon tamamlaninca siradaki operasyon otomatik `READY` olur.
- Kalite karari verildiginde hedef operasyona mesaj ve bildirim olusturulur.
- Kritik uretim uyarilari kalici `ProductionAlert` olarak saklanir.

UI hatali davransa bile kaynak gercek PostgreSQL ve backend kurallaridir.

## Prisma Modelleri ve Iliskiler

Faz 3 icin en kritik modeller:

### `WorkOrder`

Ana is emrini tutar.

Iliskiler:

- Bir urune baglidir.
- Bir rotaya baglanabilir.
- Birden fazla `WorkOrderOperation` icerir.
- Birden fazla `ProductionLog`, `QualityCheck`, `ProductionAlert`, `Notification` ile iliskilenir.

### `WorkOrderOperation`

Is emrinin gercek operasyon adimini tutar.

Kritik alanlar:

- `sequence`: rota sirasi.
- `status`: `WAITING`, `READY`, `IN_PROGRESS`, `PAUSED`, `COMPLETED` vb.
- `plannedQuantity`
- `producedQuantity`
- `scrapQuantity`
- `assignedOperatorId`
- `machineId`

Bu tablo Faz 3'un omurgasidir. Urunun hangi adimda oldugu buradan okunur.

### `ProductionLog`

Operatorun girdigi uretim kaydidir.

Tuttugu baglam:

- is emri
- operasyon
- operator
- makine
- vardiya
- uretim adedi
- fire adedi
- not
- gorsel kanitlar

### `OperationDowntime`

Operasyon duruslarini raporlanabilir hale getirir.

Tuttugu baglam:

- is emri
- operasyon
- makine
- operator
- vardiya
- durus nedeni
- baslangic ve bitis zamani

### `ProductionAlert`

Kritik uretim ve kalite uyarilarini tutar.

Faz 3'te kalite karari icin genisletildi:

- `qualityDecision`
- `qualityDecisionNote`
- `qualityDecisionById`
- `qualityDecisionAt`
- `reworkOperationId`

### `Notification`

Kullaniciya giden kalici bildirimi tutar.

Socket mesajindan farki:

```text
Socket anliktir, Notification kalicidir.
```

Kullanici uygulamayi kapatip acsa bile bildirim gecmisi veritabanindan okunur.

### `PushToken`

Mobil cihazin Expo push token bilgisini tutar.

Alanlar:

- `userId`
- `token`
- `platform`
- `deviceName`
- `isActive`
- `lastSeenAt`

Bu tablo, mobil uygulama arka planda veya kapaliyken de kullaniciya bildirim gonderebilmek icin eklendi.

## Socket.io ve Push Notification Akisi

### Realtime icin temel karar

REST API veri yazma kanalidir. Socket.io veri yazmaz, sadece degisiklik sinyali yollar.

Dogru akis:

```text
Mobil/Web -> REST API -> Backend Service -> Prisma Transaction -> PostgreSQL
                                              |
                                              -> Socket.io event
                                              -> Notification record
                                              -> Expo Push notification
```

Bu karar cok onemlidir. Cunku Socket event kaybolsa bile veri PostgreSQL'de kalir.

### Kullanilan event ornekleri

```text
notification:created
workOrder:updated
workOrderOperation:updated
production:logged
operationMessage:created
operationDowntime:created
productionAlert:created
productionAlert:updated
quality:checked
```

### Web/Mobil anlik guncelleme mantigi

Event geldiginde ekran genelde ilgili REST datasini tekrar ceker.

Neden?

```text
Event payload'i kaynak gercek degildir. Kaynak gercek veritabanidir.
```

Bu sayede payload eksik veya eski olsa bile ekran son durumu backend'den alir.

### Push bildirim mantigi

`createNotification` merkezi bildirim noktasi gibi calisir:

1. `notifications` tablosuna kalici kayit atilir.
2. Socket.io ile aktif web/mobil istemcilere `notification:created` gider.
3. Kullaniciya ait aktif `PushToken` varsa Expo Push API'ye bildirim istegi atilir.

Bu uc katman sunu cozer:

- Uygulama aciksa: Socket ile anlik gorur.
- Uygulama arka plandaysa: cihaz bildirimi alir.
- Kullanici sonra girerse: veritabanindaki bildirim gecmisini gorur.

Not: Gercek fiziksel cihazda tam native push icin Expo/EAS proje ayarlari gerekir. Backend ve mobil taraf buna hazir olacak sekilde tasarlandi.

## Operasyon Devri ve Miktar Kurallari

### Operasyon baslatma

Operator sadece kendisine atanmis ve uygun durumda olan operasyonu baslatabilir.

Amac:

```text
Yanlis operatorun yanlis istasyonu baslatmasini engellemek.
```

### Operasyon duraklatma

Duraklatirken backend su islemleri yapar:

1. Operasyon `PAUSED` olur.
2. Is emri gerekiyorsa `PAUSED` durumuna gecer.
3. Makine durumu guncellenir.
4. Aktif vardiya bulunur.
5. `OperationDowntime` kaydi acilir.
6. Socket eventleri yayinlanir.
7. Ilgili kullanicilara bildirim gidebilir.

### Operasyon yeniden baslatma

Yeniden baslatirken:

1. Acik durus kaydinin `endedAt` alani doldurulur.
2. Operasyon tekrar `IN_PROGRESS` olur.
3. Makine tekrar `RUNNING` olabilir.
4. Operator mobilde bildirim alir.

Bu, "durdu" bilgisini raporlanabilir sureye cevirir.

### Operasyon tamamlama

Operator tamamlamak istediginde backend:

1. Operasyon uretim toplamlarini okur.
2. Gerekli aktarim miktarini hesaplar.
3. Eksikse operatoru engeller.
4. Tamamsa operasyonu `COMPLETED` yapar.
5. Siradaki operasyonu `READY` yapar.
6. Siradaki operator varsa bildirim olusturur.

## Kalite Aksiyon Karar Sistemi

Kalite kontrol sonucu basarisiz veya kismi oldugunda `ProductionAlert` olusur.

Yonetici/kalite yetkilisi su kararlardan birini verir:

### `REWORK_OPERATION`

Urun veya parca belirli bir operasyona geri gonderilir.

Backend etkisi:

- Hedef operasyon `reworkOperationId` ile alert'e baglanir.
- Hedef operasyona kalite mesaji eklenir.
- Hedef operatorune bildirim gider.
- Alert karar bilgisiyle guncellenir.

### `SCRAP`

Uygunsuzluk hurda olarak kapatilir.

Backend etkisi:

- Karar kalici saklanir.
- Raporlarda hurda karari olarak sayilir.
- Uretim yoneticisi hangi urun/operasyon baglaminda hurda karari verildigini gorur.

### `CONDITIONAL_ACCEPT`

Kalite veya musteri karariyla sartli kabul verilir.

Backend etkisi:

- Karar ve not saklanir.
- Raporlarda sartli kabul olarak izlenir.

## Raporlama ve Analiz Altyapisi

Ana endpoint:

```text
GET /api/reports/overview
```

Bu endpoint uretim yoneticisi icin tek ekranda karar destek verisi uretir.

### Vardiya analizi

Alanlar:

```text
shiftPerformance
operatorShiftPerformance
machineShiftPerformance
```

Cevapladigi sorular:

- Hangi vardiyada kac adet uretildi?
- Hangi vardiyada fire artti?
- Hangi operator hangi vardiyada daha verimli?
- Hangi makine hangi vardiyada sorun cikardi?

### Durus analizi

Alanlar:

```text
operationDowntimeReasonCounts
operationDowntimeByShift
operationDowntimeByMachine
operationDowntimeByOperation
recentOperationDowntimes
```

Cevapladigi sorular:

- Duruslar en cok hangi nedenle oluyor?
- Hangi vardiyada durus artiyor?
- Hangi makine uretimi daha cok durduruyor?
- Hangi operasyon sik sik bekliyor?

### Sure/gecikme analizi

Operasyon baslama, duraklama, yeniden baslama ve tamamlanma zamanlari uzerinden hedef sure/gercek sure farklari analiz edilir.

Bu yapinin amaci:

```text
Gecikme sadece "is gecikti" diye degil, operasyon ve durus nedeni baglaminda aciklanabilsin.
```

### Kalite karar analizi

Alanlar:

```text
qualityDecisionCounts
qualityDecisionByOperation
qualityDecisionByMachine
recentQualityDecisions
```

Cevapladigi sorular:

- En cok hangi kalite karari veriliyor?
- Geri isleme hangi operasyonda yogunlasiyor?
- Hurda karari hangi makinede artiyor?
- Son kalite kararlarini kim, ne zaman verdi?

## Mobil ve Web Rol Ayrimi

### Mobil operator uygulamasi

Mobil uygulama saha odaklidir.

Operator:

- kendi aktif islerini gorur
- kendisine atanmis operasyonu baslatir/duraklatir/tamamlar
- uretim ve fire girer
- durus nedeni secip not yazar
- gorsel kanit yukler
- operasyon bazli mesaj gonderir
- bildirimleri alir

Mobilde amac:

```text
Operatorun ekranda kaybolmadan hizli ve dogru veri girmesi.
```

### Web yonetim paneli

Web panel uretim yoneticisi, admin ve kalite personeli icindir.

Web kullanicisi:

- is emri olusturur
- operasyon akisini izler
- operasyon mesajlarini gorur ve cevaplar
- riskli isleri takip eder
- kalite karari verir
- rapor analizlerini inceler
- bildirim merkezinden ilgili is emrine gider

Webde amac:

```text
Saha verisini yonetsel karar destek ekranina cevirmek.
```

## Test Stratejisi

Bu projede testler ozellikle backend is kurallarini hedefler. Cunku fabrika sisteminde en riskli hata, butonun gorunmemesi degil, veritabaninda yanlis uretim veya yanlis durum kalmasidir.

Kullanilan kabul testleri:

```bash
npm run test:phase2
npm run test:phase3:shifts
npm run test:phase3:downtimes
npm run test:phase3:time
npm run test:phase3:quality
npm run test:phase3:quality-action
npm run test:phase3:quality-decision
npm run test:phase3:quality-decision-report
npm run test:phase3:quality-pending
npm run test:phase3:transfer
npm run test:phase3:notifications
npm run test:phase3:push
npm run check:production-consistency
```

### Testlerin dogruladigi ana kurallar

- Rota operasyonlari dogru sirayla olusur.
- Ara operasyonlar ana is emri toplamlarini sisirmez.
- Fire sonraki operasyonun aktarim miktarini dusurur.
- Operator eksik miktarla operasyon kapatamaz.
- Operasyon tamamlaninca sonraki operator bildirim alir.
- Durus nedeni vardiya/makine/operasyon baglaminda raporlanir.
- Kalite uyarisi ve kalite karari kalici saklanir.
- Push token kaydi kullaniciya bagli tutulur.
- Rapor endpointleri beklenen metrikleri uretir.

## Mulakatta Anlatilacak Teknik Ozet

Kisa teknik anlatim:

```text
MES Lite'i basit bir CRUD uygulamasi olarak degil, operasyon bazli uretim takip sistemi olarak tasarladim. Is emri rota operasyonlarindan olusuyor; her operasyonun kendi operatoru, makinesi, uretim adedi, fire adedi, durus kaydi ve mesajlari var. Backend servis katmani, operatorun sadece kendi operasyonunu yonetmesini ve eksik uretimi tamamlandi diye kapatamamasini garanti ediyor.
```

Miktar akisi anlatimi:

```text
Bir operasyonun sonraki adima aktaracagi miktari backend hesapliyor. Ilk operasyon planlanan adetle basliyor; sonraki operasyonun maksimum uretilebilir miktari onceki operasyonun uretiminden firesi dusulerek bulunuyor. Bu kural Prisma servis katmaninda oldugu icin mobil veya web UI bunu by-pass edemiyor.
```

Realtime anlatimi:

```text
REST API veri yazma kanali, Socket.io ise commit edilmis degisiklikleri duyurma kanali. Event geldiginde ekranlar REST API'den son veriyi tekrar cekiyor. Boylece kaynak gercek PostgreSQL olarak kaliyor; socket payload'i tek basina kritik karar kaynagi olmuyor.
```

Bildirim anlatimi:

```text
Bildirimleri tek merkezden olusturdum. Once notifications tablosuna kalici kayit atiliyor, sonra aktif clientlara Socket.io event gidiyor, ayrica kullanicinin push token'i varsa Expo Push API ile cihaz bildirimi gonderiliyor. Bu sayede uygulama acikken, arka plandayken ve sonradan acildiginda bildirim davranisi tutarli kaliyor.
```

Kalite anlatimi:

```text
Kalite uygunsuzlugunu sadece FAILED sonucu olarak tutmadim; ProductionAlert uzerinde yonetsel aksiyon karari ekledim. Geri isleme, hurda ve sartli kabul kararlarini kalici saklayip operasyon, makine ve rapor metrikleriyle iliskilendirdim.
```

Raporlama anlatimi:

```text
Raporlama katmaninda yalnizca toplam uretim degil; vardiya, operator, makine, durus nedeni, operasyon ve kalite karari baglaminda analiz uretiyorum. Bu, yoneticinin "ne oldu?" sorusundan "neden oldu ve nerede tekrar ediyor?" sorusuna gecmesini sagliyor.
```

## Faz 3 Sonunda Gelinen Seviye

Faz 3 sonunda MES Lite su seviyeye geldi:

- Rota ve operasyon bazli uretim takibi var.
- Operator mobilde kendi islerini yurutuyor.
- Web panel yonetim ve kalite karar merkezi olarak calisiyor.
- Uretim/fire/durus/kalite verisi operasyon baglaminda tutuluyor.
- Anlik Socket.io senkronizasyonu var.
- Kalici bildirim ve push token altyapisi var.
- Vardiya, durus, kalite ve miktar aktarimi raporlanabiliyor.
- Acceptance testlerle kritik backend kurallari dogrulaniyor.

## Faz 4 Icin Mantikli Devam Adimlari

Faz 4 icin en mantikli teknik adimlar:

1. EAS Development Build ile gercek telefonda native push testini tamamlamak.
2. Deployment: Railway PostgreSQL + backend, Vercel web.
3. Docker Compose ile local kurulum deneyimini standartlastirmak.
4. Role bazli web ekranlarini daha keskin ayirmak: admin, uretim yoneticisi, kalite personeli.
5. Audit log ekranini zenginlestirmek.
6. Raporlara tarih araligi, export ve filtreleme eklemek.
7. Mobile offline queue eklemek: internet yokken uretim kaydi lokal tutulup sonra senkronlansin.
8. UI metin encoding problemlerini temizleyip tek dil/locale standardi kurmak.

## Kisa Sonuc

Faz 3 ile MES Lite, sadece is emri kaydeden bir MVP olmaktan cikti. Artik operasyon adimlari, miktar aktarimi, kalite karari, vardiya/durus analizi, realtime bildirim ve mobil saha akisi olan daha gercekci bir fabrika uretim takip sistemine donustu.

En onemli muhendislik karari sudur:

```text
Kritik fabrika kurallari UI'da degil, backend servis katmaninda ve PostgreSQL kaynak gerceginde yasiyor.
```
