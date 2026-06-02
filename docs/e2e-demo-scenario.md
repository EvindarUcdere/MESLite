# MES Lite Uctan Uca Demo Senaryosu

Bu dokuman, Faz 2 rota/operasyon akisini test etmek icin hazirlanan demo veriyi ve beklenen ekran davranislarini anlatir.

## Demo Veriyi Yukleme

Backend klasorunde calistir:

```bash
npm run seed:demo
```

Script tekrar calistirilabilir. Sadece `E2E-DEMO-` ile baslayan demo is emirlerini temizler ve yeniden olusturur.

## Otomatik Kabul Testi

Demo veri yuklendikten sonra backend kurallarini kontrol etmek icin:

```bash
npm run test:phase2
```

Bu test sunlari dogrular:

- 4 demo is emri olustugunu
- Her demo is emrinde 3 operasyon oldugunu
- Devam eden ve duran islerde ara operasyon uretimlerinin ana is emri final uretimini sisirmedigini
- Duran operasyonda durus mesaji oldugunu
- Kalite sonucunun final operasyon adimina bagli oldugunu
- Eksik kapanan operasyonun uretim yoneticisi/admin tarafindan yeniden acilabildigini
- Mobil operatorlerin aktif/bekleyen kendi operasyonlarini gorebildigini
- Operatorun planlanan adetten dusuk uretimi operasyon tamamlandi diye kapatamadigini
- Ara operasyon uretim kaydinin sadece ilgili operasyon adedini artirdigini, final is emri adedini sisirmedigini
- Bir operasyon tamamlandiginda sonraki operasyonun `READY` oldugunu ve siradaki operatore bildirim gittigini

## Demo Kullanici Bilgileri

Tum kullanicilar icin sifre:

```text
Admin123!
```

- Admin: `admin@meslite.local`
- Uretim yoneticisi: `manager@meslite.local`
- Kesim operatoru: `operator@meslite.local`
- Montaj operatoru: `assembly.operator@meslite.local`
- Kalite operatoru: `quality.operator@meslite.local`
- Kalite personeli: `quality@meslite.local`

## Demo Rota

Urun:

```text
E2E-AMB-001 - Ambalajli Final Demo
```

Rota:

```text
1. Kesim
2. Montaj
3. Kalite Kontrol
```

Makineler:

- `E2E-KSM-01` Kesim Tezgahi
- `E2E-MNT-01` Montaj Istasyonu
- `E2E-KLT-01` Kalite Masasi

## Demo Is Emirleri

### `E2E-DEMO-RUN`

Amac: Devam eden uretimi ve operasyon mesajlarini test etmek.

- Plan: 120 adet
- Kesim tamamlandi.
- Montaj uretimde.
- Kalite bekliyor.
- Montaj operasyonunda uyari mesaji var.

Beklenen sonuc:

- Web `Is Emirleri` ekraninda dikkat gerektiren isler listesinde gorunur.
- Satira tiklayinca ilgili timeline vurgulanir.
- Mobilde montaj operatoru kendi operasyonunu gorur.

### `E2E-DEMO-PAUSE`

Amac: Duran operasyonu test etmek.

- Plan: 80 adet
- Kesim tamamlandi.
- Montaj duraklatildi.
- Durus sebebi operasyon mesajinda gorunur.

Beklenen sonuc:

- Web `Dikkat Gerektiren Is Emirleri` bolumunde durus/ara verme olarak gorunur.
- Mobilde montaj operatoru duraklatilmis operasyonu gorebilir.
- Uretim girisi durus anina kadar olan bilgiyi kaydetmek icin kullanilabilir.

### `E2E-DEMO-QUALITY`

Amac: Operasyon bazli kalite kontrolu test etmek.

- Plan: 50 adet
- Tum operasyonlar tamamlandi.
- Final kalite kontrol operasyonunda kismi kalite sonucu var.
- Hata: 2 adet yuzey cizigi.

Beklenen sonuc:

- Web `Kalite` ekraninda son kalite kontrollerinde operasyon `3. Kalite Kontrol` olarak gorunur.
- Kalite sonucu artik sadece is emrine degil, operasyon adimina baglidir.

### `E2E-DEMO-REOPEN`

Amac: Eksik kapanan operasyonun yeniden uretime alinmasini test etmek.

- Plan: 120 adet
- Kesim 48 adet ile eksik kapanmis durumdadir.
- Montaj duraklamistir ama henuz uretim girmemistir.
- Uretim yoneticisi veya admin web uzerinden Kesim operasyonunu yeniden baslatabilir.

Beklenen sonuc:

- Kesim yeniden `IN_PROGRESS` olur.
- Kesim daha once girilen 48 adet uretim bilgisini korur.
- Montaj tekrar `WAITING` durumuna doner.
- Kesim operatoru mobilde operasyon guncellemesini anlik bildirim olarak alir.

## Backend Kural Notu

Rotali uretimde ara operasyonlar kendi `producedQuantity` alanini artirir. Ana is emrinin `producedQuantity` degeri final operasyon uretimiyle artar.

Bu kural su fabrika problemini onler:

```text
Kesim 100, Montaj 100, Kalite 100 girildiginde is emri 300 uretilmis gibi gorunmemeli.
```

Ara operasyonlar surec izlenebilirligi icindir. Final operasyon ise musterinin teslim alacagi bitmis urun miktarini temsil eder.

## Faz 2 Kabul Kriterleri

Bu senaryoda kabul testi bilincli olarak servis katmanini dogrular:

- `workOrderOperation.service.js`: Operasyon baslatma, duraklatma, yeniden acma, tamamlama ve sonraki operasyona devir kurallari.
- `productionLog.service.js`: Uretim/fire kaydi, operasyon bazli adet toplami, kritik uyari ve veri tutarliligi.
- `notification.service.js`: Operasyon devri ve kritik olaylarda ilgili kullanicilara kalici bildirim olusturma.
- `Prisma`: Tum bu aksiyonlarin PostgreSQL uzerinde kalici ve iliskili olarak yazilmasi.

Bu testin amaci sadece UI'nin calistigini gostermek degildir. Fabrika ortaminda asil risk, ekranda islem yapilmis gibi gorunup veritabaninda yanlis toplam, yanlis durum veya eksik bildirim kalmasidir. Bu nedenle kabul testi dogrudan backend is kurallarini calistirir.
