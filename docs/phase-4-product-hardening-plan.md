# Phase 4 Product Hardening Plan

MES Lite artik calisan bir MVP'nin otesine gecti: web, mobil, backend, canli deployment, vardiya takibi, operasyon akisi ve push notification var. Phase 4'te hedef, projeyi portfoyde "gercek fabrika sistemi" gibi gosterecek olgunluga tasimaktir.

## 1. UI/UX temizligi

Amac: Operator ve yonetici ekranlarinda teknik test/debug alanlarini azaltip, kullanicinin gunluk kararlarini hizlandirmak.

Once yapilacaklar:
- Mobil operator ekranindan teknik push debug ve test alanlarini kaldir.
- Mobilde "bugun ne yapmaliyim?" bilgisini daha one cikar.
- Web dashboard'u kritik uyarilar, geciken isler, kalite bekleyenler ve vardiya ozetiyle daha karar odakli hale getir.
- Is emri detayinda operasyon akisini daha okunabilir ve renk kodlariyla net hale getir.

Neden onemli:
Fabrika ortaminda kullanici teknik detay aramaz; isi, durumu ve siradaki aksiyonu hizli gormek ister.

## 2. Raporlama merkezi

Amac: Sistemi CRUD uygulamasindan karar destek aracina tasimak.

Once yapilacaklar:
- Tarih araligi filtresi ekle.
- Vardiya, operator, makine ve urun filtreleri ekle.
- Fire orani, durus suresi, geciken operasyon ve kalite sonucu grafiklerini guclendir.
- Excel/PDF disari aktarma ekle.
- "Riskli makine", "fire artan vardiya", "geciken is emirleri" gibi icgoru kartlari ekle.

Neden onemli:
Yonetici icin asil deger, sadece kayit tutmak degil, kayiplari ve darbogazlari gormektir.

## 3. Veri tutarliligi ve backend testleri

Amac: Uretim verisinin arayuzde degil backend kurallariyla korunmasi.

Once yapilacaklar:
- Eksik uretimle operasyon kapatma kurallarini test et.
- Fire miktarinin sonraki operasyona dogru aktarildigini test et.
- Operasyon sirasi bozulamaz kuralini test et.
- Yetkisiz kullanici aksiyonlarini test et.
- Vardiya/operator/makine uygunluk kurallarini test et.

Neden onemli:
MES sisteminde yanlis uretim verisi, stok ve musteri teslimati problemlerine donusur.

## 4. Demo ve portfoy hazirligi

Amac: Projenin is gorusmesinde kolay anlatilabilir ve denenebilir olmasi.

Once yapilacaklar:
- README'ye canli web linki, backend docs linki ve mobil APK notu ekle.
- Demo kullanici bilgilerini duzenli bir tabloya al.
- E2E demo senaryosunu tek komutla calisir hale getir.
- Ekran goruntuleri ve mimari aciklama ekle.

Neden onemli:
Iyi proje sadece kodla degil, anlatilabilirlik ve kurulum kolayligiyla da fark yaratir.

