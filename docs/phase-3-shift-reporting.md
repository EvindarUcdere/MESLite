# Faz 3 - Vardiya Bazli Uretim Takibi

Bu faz, uretim performansini vardiya baglaminda olcmek icin baslatildi.

## Cozulen Fabrika Problemi

Toplam uretim adedi tek basina yeterli degildir. Uretim yoneticisi su sorulari da cevaplayabilmelidir:

- Hangi vardiyada kac adet uretildi?
- Hangi vardiyada fire artti?
- Hangi operator hangi vardiyada daha verimli calisti?
- Hangi makine hangi vardiyada daha cok fire verdi?

Bu bilgiler olmadan yonetici sorunun makineden mi, operatorden mi, vardiya kosullarindan mi yoksa malzemeden mi kaynaklandigini ayirt edemez.

## Teknik Yaklasim

Yeni tablo eklenmedi. MVP'de zaten var olan `shifts` ve `production_logs.shiftId` iliskisi kullanildi.

Backend tarafinda:

- `productionLog.service.js` uretim kaydi girilirken `shiftId` bos gelirse aktif vardiyayi saate gore otomatik bulur.
- `report.service.js` vardiya, vardiya-operator ve vardiya-makine performans metriklerini uretir.
- `phase3-shift-acceptance.js` demo verinin beklenen vardiya toplamlarini dogrular.

Web tarafinda:

- `Reports.jsx` icine `Vardiya Performansi` grafigi eklendi.
- `Vardiya Performans Detayi` tablosu eklendi.
- `Vardiya Bazli Operator Performansi` tablosu eklendi.
- `Vardiya Bazli Makine Performansi` tablosu eklendi.

## Backend Rapor Alanlari

`GET /api/reports/overview` artik su alanlari da doner:

- `shiftPerformance`
- `operatorShiftPerformance`
- `machineShiftPerformance`

Her metrik uretim adedi, fire adedi, fire orani ve kayit sayisini icerir.

## Otomatik Vardiya Esleme

Operator mobilde uretim girerken vardiya secmezse backend aktif vardiyayi `startTime` ve `endTime` araligina gore bulur.

Gece vardiyasi gibi gunu asan araliklar desteklenir:

```text
22:00 -> 06:00
```

Bu karar operator ekranini sade tutar. Vardiya raporu icin gereken veri backend tarafinda guvenli sekilde tamamlanir.

## Demo ve Test

Backend klasorunde:

```bash
npm run seed:demo
npm run test:phase3:shifts
```

Test su kurallari dogrular:

- Sabah vardiyasi uretim/fire toplamlari
- Aksam vardiyasi uretim/fire toplamlari
- Gece vardiyasi uretim/fire toplamlari
- Vardiya bazli operator performansi
- Vardiya bazli makine performansi

## Mulakatta Anlatilabilecek Nokta

Bu fazda raporlamayi sadece genel toplamdan cikardim ve vardiya baglamina indirdim. Boylece uretim yoneticisi "hangi vardiyada sorun var?" sorusuna veriyle cevap verebilir. Vardiya eslemesini operatorun uzerine yuklemek yerine backend'de otomatik yaptim; bu da saha kullanimi icin daha ergonomik bir karar.
