# Faz 3 - Kalite Aksiyon Karari

Bu adimda kalite uygunsuzlugu, sadece gorunen bir uyari olmaktan cikarilip yonetim karariyla uretim akisina baglandi.

## Cozulen fabrika problemi

Kalite kontrol bir parcada hata buldugunda gercek fabrikada karar verilmesi gerekir:

- Parca tekrar islenecek mi?
- Hurdaya mi ayrilacak?
- Musteri veya kalite sorumlusu sartli kabul mu verecek?

Bu karar kayitsiz kalirsa operator, kalite personeli ve uretim yoneticisi farkli bilgiyle hareket edebilir. MES Lite artik bu karari `ProductionAlert` uzerinde kalici olarak saklar.

## Kullanilan teknolojiler

- PostgreSQL: kalite kararini enum ve kolonlarla kalici tutar.
- Prisma: `QualityActionDecision` enum'u ve `ProductionAlert.reworkOperationId` iliskisini modelledi.
- Express REST API: `POST /api/production-alerts/:id/quality-action` endpoint'i eklendi.
- Zod: karar tipi, karar notu ve hedef operasyon validasyonu yapildi.
- Socket.io: karar sonrasi `productionAlert:updated`, `workOrderOperation:updated`, `workOrder:updated` event'leri yayinlandi.
- React: web uyarilar ekranina kalite aksiyon karar paneli eklendi.

## Karar tipleri

- `REWORK_OPERATION`: Uygunsuzluk ilgili operasyona geri gonderilir.
- `SCRAP`: Uygunsuzluk hurda olarak kapatilir.
- `CONDITIONAL_ACCEPT`: Uygunsuzluk sartli kabul karariyla kapatilir.

## Akis

1. Kalite personeli kalite kontrol kaydi girer.
2. Sonuc `FAILED` veya `PARTIAL` ise backend otomatik `ProductionAlert` olusturur.
3. Uretim yoneticisi uyarilar ekranindan kalite aksiyon kararini verir.
4. Geri isleme secilirse hedef operasyon yeniden aksiyon alinabilir hale gelir.
5. Hedef operasyona `QUALITY_ALERT` mesaj kaydi eklenir.
6. Hedef operasyonun operatorune `QUALITY_REWORK_ASSIGNED` bildirimi gider.
7. Karar, karar notu ve hedef operasyon `ProductionAlert` uzerinde saklanir.

## Neden bu tasarim?

Uretim miktarlari ve eski loglar silinmez. Cunku fabrikada gecmis uretim kaydi audit verisidir. Geri isleme yeni bir karar ve yeni bir aksiyon olarak izlenir.

Bu sayede sistem sadece ekranda bilgi gosteren bir uygulama degil, uretim kararlarini kurallara baglayan bir MES davranisi kazanir.
