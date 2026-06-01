# Faz 2 - Operasyon/Rota Bazli Uretim Takibi

Bu faz, bir urunun tek makinede bitmedigi ve birden fazla operasyon adimindan gecerek uretildigi fabrika senaryolari icin tasarlanir.

Ornek akis:

```text
Kesim -> Pres -> Montaj -> Paketleme -> Kalite
```

## Amac

MVP su anda is emri, makine, operator, uretim kaydi, fire, not, gorsel kanit ve kalite sonucu uzerinden calisiyor. Bu iyi bir ilk temel.

Faz 2'de hedef, bir is emrini tek adimli uretim gibi degil, birbirine bagli operasyon adimlari olarak takip etmektir.

Bu su fabrika problemini cozer:

```text
Bir urun hangi operasyonlardan gecti?
Hangi makinede, hangi operator calisti?
Hangi adimda sorun cikti?
Bir sonraki operator onceki adimdan gelen notu gordu mu?
Kalite veya uretim yoneticisi tum sureci geriye donuk izleyebiliyor mu?
```

## Neden MVP Degil Faz 2?

Bu yapi dogru ve degerli ama veri modelini buyutur. MVP'nin once stabil calismasi daha sagliklidir.

MVP'de once sunlarin saglam olmasi gerekir:

- Is emri olusturma ve atama
- Mobil operator uretim girisi
- Fire, not ve gorsel kanit
- Dashboard ve canli takip
- Kalite sonucu
- Raporlama

Bunlar oturduktan sonra rota/operasyon katmani eklenirse proje cokmeden buyur.

## Yeni Kavramlar

### Rota

Bir urunun uretim sirasini tanimlar.

Ornek:

```text
Urun: Govde Montaj Seti
Rota:
1. Kesim
2. Pres
3. Montaj
4. Kalite
```

### Operasyon

Rota icindeki tek bir uretim adimidir.

Her operasyon sunlari tutar:

- Operasyon adi
- Sira numarasi
- Hedef makine veya makine tipi
- Tahmini sure
- Zorunlu kalite kontrol var mi?

### Is Emri Operasyonu

Bir is emrine bagli gercek operasyon kaydidir.

Ornek:

```text
IE-001 / Operasyon 1 / Kesim / Makine: KSM-01 / Operator: Ali / Durum: Tamamlandi
IE-001 / Operasyon 2 / Pres / Makine: PRS-02 / Operator: Zeynep / Durum: Uretimde
```

## Onerilen Veritabani Tablolari

### `routes`

Urun icin uretim rotasini temsil eder.

- `id`
- `productId`
- `name`
- `isActive`
- `createdAt`
- `updatedAt`

### `route_operations`

Rota icindeki sablon operasyonlari tutar.

- `id`
- `routeId`
- `operationName`
- `sequenceNo`
- `defaultMachineId`
- `estimatedMinutes`
- `requiresQualityCheck`
- `createdAt`
- `updatedAt`

### `work_order_operations`

Is emrine bagli gercek operasyon adimlarini tutar.

- `id`
- `workOrderId`
- `routeOperationId`
- `machineId`
- `assignedOperatorId`
- `sequenceNo`
- `status`
- `producedQuantity`
- `scrapQuantity`
- `startedAt`
- `completedAt`
- `createdAt`
- `updatedAt`

Durumlar:

```text
WAITING -> READY -> IN_PROGRESS -> PAUSED -> COMPLETED
```

### `operation_messages`

Operatorler, uretim yoneticisi ve kalite personeli arasindaki operasyon bazli iletisimi tutar.

- `id`
- `workOrderOperationId`
- `senderId`
- `message`
- `severity`
- `createdAt`

Severity:

```text
INFO
WARNING
QUALITY_ALERT
STOPPAGE
```

## Is Kurallari

- Ilk operasyon `READY` baslar.
- Bir operasyon `COMPLETED` olmadan sonraki operasyon normalde `READY` olmaz.
- Operator sadece kendisine atanmis operasyonu baslatir ve kayit girer.
- Uretim yoneticisi acil durumda operasyon sirasina mudahale edebilir ama sistem bunu audit log ile saklamalidir.
- Kalite gerekli operasyonlarda kalite sonucu girilmeden sonraki adima gecis engellenebilir.
- Bir operasyonda kritik not veya gorsel varsa dashboard ve is emri timeline'inda one cikar.

## Web Ekranlari

- Rota Yonetimi
- Is Emri Operasyon Planlama
- Is Emri Timeline
- Operasyon Mesajlari ve Uyarilari
- Operasyon Bazli Kalite Gecmisi

## Mobil Ekranlari

- Atanan Operasyonlarim
- Operasyon Detayi
- Operasyon Baslat/Duraklat/Tamamla
- Operasyon Uretim Girisi
- Operasyon Notu, Gorsel Kanit ve Uyari Gonderme

## Kullanilacak Teknolojiler

- PostgreSQL ve Prisma: operasyon ve rota iliskilerini guvenli modellemek icin.
- Express REST API: rota, operasyon ve mesaj endpointleri icin.
- Socket.io: operasyon uyarilarini ve timeline degisimlerini web dashboard'a anlik aktarmak icin.
- React Web: yonetici timeline ve planlama ekranlari icin.
- React Native Expo: operator operasyon ekrani, gorsel kanit ve saha mesajlari icin.

## Gelistirme Sirasi

1. Rota ve operasyon veri modelini ekle.
2. Rota CRUD endpointlerini yaz.
3. Is emri olusurken operasyon adimlarini otomatik uret.
4. Mobilde operatorun kendi operasyonlarini gormesini sagla.
5. Operasyon bazli uretim/fire/gorsel kaydi ekle.
6. Webde is emri timeline ekranini yap.
7. Operasyon mesajlari ve kritik uyarilari ekle.
8. Kalite kontrolu operasyon adimina bagla.

## Uygulama Durumu

### Tamamlanan - Adim 1

Rota ve operasyon sablonu temeli eklendi.

- `routes` tablosu urune bagli uretim rotasini tutar.
- `route_operations` tablosu rota icindeki sirali operasyonlari tutar.
- `GET /api/product-routes` ile rotalar listelenir.
- `POST /api/product-routes` ile urun icin yeni rota ve operasyon adimlari olusturulur.
- Web tarafinda `Rotalar` ekrani eklendi.

Bu adim henuz is emirlerini otomatik operasyonlara bolmez. Bu bilerek ayrildi; once rota sablonu saglam olsun, sonra is emri operasyonlari bu sablondan uretilecek.

### Tamamlanan - Adim 2

Is emri olusturulurken rota secimi ve otomatik operasyon uretimi eklendi.

- `work_order_operations` tablosu is emrine bagli gercek operasyon adimlarini tutar.
- Is emri formunda urune ait aktif rota secilebilir.
- Rota secildiginde backend, rota operasyonlarini is emri operasyonlarina kopyalar.
- Ilk operasyon `READY`, sonraki operasyonlar `WAITING` baslar.
- Is emri listesinde operasyon timeline'i gorunur.

Bu adim hala uretim/fire kaydini operasyon seviyesine baglamaz. Siradaki adim, mobil operator akisini bu operasyonlara baglamak olacak.

### Tamamlanan - Adim 3

Operasyon durum API'leri ve web uzerinden renkli operasyon takibi eklendi.

- `GET /api/work-order-operations` ile tum operasyonlar listelenir.
- `GET /api/work-order-operations/my` ile operator kendi operasyonlarini gorebilir.
- Operasyon `start`, `pause`, `complete` endpointleri eklendi.
- Bir operasyon tamamlaninca siradaki operasyon otomatik `READY` olur.
- Web is emri timeline'inda operasyon durumlari renkli gorunur.
- Timeline uzerinde onceki ve sonraki operator bilgisi gosterilir.

Bir sonraki adim, mobil operator ekranini bu operasyon API'lerine baglamak ve operasyon bazli uretim/fire/not/gorsel kaydina gecmektir.

### Tamamlanan - Adim 4

Operasyon bazli mesajlasma eklendi.

- `operation_messages` tablosu operasyon uzerindeki iletisim gecmisini tutar.
- `POST /api/work-order-operations/:id/messages` ile operasyon mesajı eklenir.
- Mesajlar `INFO`, `WARNING`, `QUALITY_ALERT`, `STOPPAGE` seviyelerine ayrilir.
- Is emri timeline'inda operasyon mesajlari ve mesaj gonderme alani gorunur.
- Yeni mesaj geldiginde `operationMessage:created` ve `workOrder:updated` eventleri yayinlanir.

Bu adim onceki/sonraki operator, uretim yoneticisi ve kalite arasinda operasyon baglamli iletisimin temelini kurar.

### Tamamlanan - Adim 5

Uretim/fire/not/gorsel kaydi operasyon seviyesine baglandi.

- `ProductionLog` kaydi istege bagli `workOrderOperationId` tutar.
- Mobil uretim girisi artik operatorun kendi `READY` veya `IN_PROGRESS` operasyonlari uzerinden yapilir.
- Operasyona uretim girildiginde operasyonun `producedQuantity` ve `scrapQuantity` alanlari artar.
- `READY` operasyona uretim girilirse operasyon ve is emri otomatik `IN_PROGRESS` olur.
- Web is emri timeline'inda her operasyonun uretim/fire toplami gorunur.

Bu adim, sorun ve performans takibini is emri genelinden operasyon adimina indirir.

### Tamamlanan - Adim 6

Mobil operator operasyon aksiyonlari eklendi.

- Mobilde operator kendi operasyonunu baslatabilir.
- Mobilde operator kendi operasyonunu duraklatabilir.
- Mobilde operator kendi operasyonunu tamamlayabilir.
- Mobilde operator kendi operasyonuna mesaj yazabilir.
- Mesaj seviyeleri mobilde `Bilgi`, `Uyari`, `Kalite`, `Durus` olarak secilebilir.

Bu adim, operatorun mobil uygulamada sadece veri giren degil, kendi operasyon adimini yoneten kisi olmasini saglar.

### Tamamlanan - Adim 7

Web tarafinda uretim yoneticisi icin operasyon akisi kontrol ozeti eklendi.

- Is Emirleri ekraninda aktif is emri, eksik kapanan operasyon, duraklayan operasyon ve operasyon mesaji sayilari gorunur.
- Riskli is emirleri kritik/uyari/bilgi seviyesine gore ayrilir.
- Risk satirinda son operasyon mesaji baglamiyla birlikte gosterilir.
- Risk satirina tiklandiginda ilgili is emrine gidilir ve timeline vurgulanir.
- Socket.io eventleri geldikce ekran canli olarak yeniden yuklenir.

Bu adim, uretim yoneticisinin tablo icinde tek tek arama yapmadan sorunlu operasyonu yakalamasini ve ilgili timeline'a hizli gecmesini saglar.

### Tamamlanan - Adim 8

Kalite kontrolu operasyon adimina baglandi.

- `QualityCheck` kaydi istege bagli `workOrderOperationId` tutar.
- Rotali is emirlerinde kalite girisi icin uretim yapilmis operasyon secimi zorunludur.
- Backend, secilen operasyonun ilgili is emrine ait oldugunu kontrol eder.
- Hata adedi, kalite kapsamindaki operasyon uretim miktarini asamaz.
- Web kalite ekraninda is emri secildikten sonra operasyon secimi yapilir.
- Son kalite kontrolleri tablosunda kalite sonucunun hangi operasyon icin girildigi gorunur.
- Uretim gecmisi tablosunda uretim kaydinin hangi operasyon adimina ait oldugu gorunur.

Bu adim, kalite problemlerinin is emri genelinde kaybolmasini engeller ve "hata hangi operasyon/makine/operator baglaminda cikti?" sorusuna daha saglam cevap verir.

### Tamamlanan - Adim 9

Faz 2 icin uctan uca demo senaryosu eklendi.

- `npm run seed:demo` komutu ile tekrar calistirilabilir demo veri uretilir.
- Demo rota `Kesim -> Montaj -> Kalite Kontrol` akisini kullanir.
- Devam eden, duraklatilan ve kalite sonucu olan uc ayri is emri olusturulur.
- Demo veriler operasyon mesajlari, uretim kayitlari, fire ve kalite sonucuyla birlikte gelir.
- Rotali uretimde ara operasyon uretimleri is emri final uretimini sisirmeyecek sekilde backend kurali netlestirildi.
- Test akisi `docs/e2e-demo-scenario.md` dosyasinda belgelendi.

Bu adim, Faz 2'nin portfoy sunumunda ve manuel testlerde tek komutla anlatilabilir bir fabrika senaryosu olarak calismasini saglar.

## Sonuc

Bu faz, MES Lite'i basit uretim kaydi uygulamasindan daha gercekci bir fabrika izlenebilirlik sistemine tasir. Ancak MVP'nin temel akisi stabil hale gelmeden eklenirse proje karmasiklasir. Bu nedenle dogru zaman Faz 2'dir.
