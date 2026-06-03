# Faz 3.2 - Operasyon Duruş Nedeni Takibi

Bu adim, uretim duraklamalarini raporlanabilir hale getirmek icin eklendi.

## Cozulen Fabrika Problemi

Bir is emri veya operasyon `PAUSED` oldugunda yalnizca "durdu" bilgisini bilmek yeterli degildir. Uretim yoneticisinin asil ihtiyaci sudur:

- Neden durdu?
- Hangi makinede durdu?
- Hangi vardiyada durdu?
- Hangi operasyon adiminda durdu?
- Ayni neden tekrar ediyor mu?

Bu bilgi yoksa yonetici uretim kaybini sadece gorur, ama kok sebebi analiz edemez.

## Teknik Yaklasim

Yeni bir `operation_downtimes` tablosu eklendi.

Bu tablo sunlari tutar:

- `workOrderId`
- `workOrderOperationId`
- `machineId`
- `operatorId`
- `shiftId`
- `reason`
- `note`
- `startedAt`
- `endedAt`

Duruş nedeni `DowntimeReason` enumudur. Serbest metin yerine enum kullanilmasinin sebebi raporlarda ayni nedenin farkli yazimlarla bolunmesini engellemektir.

## Duruş Nedenleri

```text
MACHINE_FAILURE
MATERIAL_WAITING
QUALITY_WAITING
MAINTENANCE
SETUP
OPERATOR_BREAK
OTHER
```

## Backend Akisi

Operasyon duraklatilirken:

1. `POST /api/work-order-operations/:id/pause` endpointine `reason` ve opsiyonel `note` gelir.
2. Backend operatorun bu operasyona yetkili olup olmadigini kontrol eder.
3. Operasyon `PAUSED` durumuna alinir.
4. Ana is emri `PAUSED` durumuna alinir.
5. Makine `STOPPED` durumuna alinir.
6. Aktif vardiya bulunur.
7. `operation_downtimes` kaydi olusturulur.
8. `operationDowntime:created`, `workOrderOperation:updated`, `workOrder:updated` eventleri yayinlanir.

Operasyon tekrar baslatilirken:

1. Acik `operation_downtimes` kaydi varsa `endedAt` set edilir.
2. Operasyon tekrar `IN_PROGRESS` olur.
3. Makine tekrar `RUNNING` olur.

## Mobil Akis

Mobil operator ekraninda operasyon duraklatilmadan once:

- Duruş nedeni secilir.
- Istege bagli duruş notu girilir.
- `Operasyonu Duraklat` butonu bu bilgilerle backend'e gider.

Bu sayede operator sadece durdurmaz, durusun nedenini de sahadan kaydeder.

## Web Akis

Web `Is Emirleri` ekraninda operasyon timeline'inda son duruş nedeni gosterilir.

Web uzerinden operasyon duraklatan admin veya uretim yoneticisi de duruş nedeni ve not secebilir.

## Rapor Akis

`GET /api/reports/overview` artik su alanlari doner:

- `operationDowntimeReasonCounts`
- `operationDowntimeByShift`
- `operationDowntimeByMachine`
- `operationDowntimeByOperation`
- `recentOperationDowntimes`

Web `Raporlar` ekraninda:

- Operasyon Duruş Nedenleri grafigi
- Vardiya Bazli Duruş Analizi
- Makine Bazli Duruş Analizi
- Operasyon Bazli Duruş Analizi

gosterilir.

## Test

Backend klasorunde:

```bash
npm run seed:demo
npm run test:phase3:downtimes
```

Test sunlari dogrular:

- Demo duruş kayitlari olusur.
- Duruşlar is emri ve operasyonla iliskilidir.
- Makine arizasi, kalite bekleme ve malzeme bekleme nedenleri raporlanir.
- Duruşlar vardiya, makine ve operasyon bazinda gruplanir.

## Mulakatta Anlatilabilecek Nokta

Bu adimda `PAUSED` durumunu tek basina bir sonuc olmaktan cikardim ve durusun kok nedenini izlenebilir hale getirdim. Boylece yonetici "uretim dustu" demekle kalmaz, "gece vardiyasinda montaj makinesinde makine arizasi nedeniyle durus artmis" gibi aksiyon alinabilir bilgiye ulasir.
