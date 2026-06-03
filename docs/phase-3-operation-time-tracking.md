# Faz 3.3 - Operasyon Sure ve Gecikme Takibi

Bu adim, operasyonlarin hedef sureye gore performansini takip etmek icin eklendi.

## Cozulen Fabrika Problemi

Uretim adedi ve fire bilgisi tek basina yeterli degildir. Uretim yoneticisi sunu da bilmek ister:

- Operasyon hedef surede bitti mi?
- Gercek sure hedef sureyi ne kadar asti?
- Gecikme durustan mi, yoksa net calisma suresinden mi kaynaklandi?
- Hangi makine veya operator sure hedefinin uzerinde kaliyor?

## Kullanilan Veri

Yeni tablo eklenmedi. Mevcut alanlar kullanildi:

- `route_operations.estimatedMinutes`: hedef sure
- `work_order_operations.startedAt`: operasyon baslangici
- `work_order_operations.completedAt`: operasyon bitisi
- `operation_downtimes.startedAt / endedAt`: durus suresi

## Hesaplama Mantigi

```text
Gercek sure = completedAt - startedAt
Durus sure = operation_downtimes toplam sure
Net sure = Gercek sure - Durus sure
Gecikme = max(Net sure - Hedef sure, 0)
```

Bu ayrim onemlidir. Bir operasyon 90 dakika surmus olabilir ama bunun 40 dakikasi malzeme bekleme ise net calisma 50 dakikadir. Boylece performans analizi operatoru haksiz yere cezalandirmaz.

## Backend Rapor Alanlari

`GET /api/reports/overview` artik su alanlari da doner:

- `operationTimePerformance`
- `delayedOperations`
- `operationTimeByMachine`
- `operationTimeByOperator`

## Web Gosterimi

Web `Is Emirleri` timeline'inda operasyon kartinda su bilgiler gorunur:

```text
Hedef: 55 dk
Gercek: 70 dk
Durus: 0 dk
Gecikme: +15 dk
```

Web `Raporlar` ekraninda:

- En Cok Geciken Operasyonlar
- Makine Bazli Sure Performansi
- Operator Bazli Sure Performansi

tablolari bulunur.

## Test

Backend klasorunde:

```bash
npm run seed:demo
npm run test:phase3:time
```

Test sunlari dogrular:

- Hedef sure hesaplanir.
- Gercek sure hesaplanir.
- Durus sure hedef analizinden ayrilir.
- Net gecikme hesaplanir.
- Makine ve operator bazli sure gruplari olusur.

## Mulakatta Anlatilabilecek Nokta

Bu adimda yalnizca "operasyon gecikti" demedim; gecikmenin gercek calisma suresinden mi yoksa duruslardan mi kaynaklandigini ayirdim. Bu, sahada adil performans analizi ve dogru kok neden tespiti icin onemli bir MES karari.
