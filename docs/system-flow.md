# MES Lite Sistem Akışı

Bu doküman, MES Lite projesinde kimin hangi ekranı neden kullandığını ve üretim verisinin sistem içinde nasıl aktığını açıklar.

## Sistemin Amacı

MES Lite, küçük ve orta ölçekli bir üretim işletmesinde iş emirlerini, makineleri, operatörleri, üretim miktarlarını, fireleri, kalite sonuçlarını ve yönetici görünümünü tek sistemde toplamak için tasarlanmış bir MVP'dir.

Temel soru şudur:

```text
Hangi iş emri, hangi ürünü, hangi makinede, hangi operatörle, ne kadar üretti?
Ne kadar fire verdi?
Operatör hangi notu düştü?
Yönetici bunu nereden takip ediyor?
```

## Ana Kullanıcılar

### Admin

Admin sistemin en geniş yetkili kullanıcısıdır.

- Kullanıcıları yönetir.
- Rolleri belirler.
- İş emirlerini ve ana verileri görebilir.
- Gerekirse manuel düzeltme yapabilir.

Admin yetkisi günlük üretim akışından çok sistem yönetimi ve istisnai düzeltmeler içindir.

### Üretim Yöneticisi

Üretim yöneticisi web panelini kullanır.

- İş emri oluşturur.
- Ürün, makine ve operatör ataması yapar.
- Üretim durumlarını takip eder.
- Dashboard ve raporlardan üretim performansını izler.
- Operatör notlarını ve fire bilgilerini görür.

Üretim yöneticisinin ana işi üretim verisi girmek değil, üretimi planlamak ve takip etmektir.

### Operatör

Operatör mobil uygulamayı kullanır.

- Kendisine atanmış iş emirlerini görür.
- Üretime başlar.
- Üretimi duraklatır.
- Üretilen adet, fire adedi ve not girer.
- İş emrini tamamlar.

Operatör, sahadaki gerçek üretim bilgisinin ana kaynağıdır.

### Kalite Personeli

Kalite personeli kalite ekranını kullanır.

- Üretilmiş iş emirleri için kalite kontrol sonucu girer.
- Geçti, kaldı veya kısmi gibi sonuçlar kaydeder.
- Hata açıklaması ve kalite notu ekler.

Kalite akışı üretim akışından sonra gelir.

### İzleyici

İzleyici yalnızca rapor ve dashboard ekranlarından süreci takip eder.

- Üretim durumlarını görür.
- Raporları inceler.
- Veri değiştirmez.

## Web ve Mobil Ayrımı

### Web Paneli

Web paneli planlama, yönetim ve takip merkezidir.

Web panelinde yapılan işler:

- Kullanıcı yönetimi
- Ürün yönetimi
- Üretim hattı ve makine yönetimi
- İş emri oluşturma
- Makine ve operatör atama
- Dashboard izleme
- Raporları inceleme
- Kalite sonucu girme
- Operatör üretim notlarını görme

Web paneli, üretim sahasının yerine geçmez. Yönetici burada süreci planlar ve izler.

### Mobil Operatör Uygulaması

Mobil uygulama saha ekranıdır.

Mobilde yapılan işler:

- Operatör girişi
- Atanmış iş emirlerini görme
- İş emri detayını inceleme
- Üretimi başlatma
- Üretimi duraklatma
- Üretim ve fire miktarı girme
- Operatör notu girme
- İş emrini tamamlama

Mobil uygulama, sahadaki gerçek üretim bilgisinin sisteme girdiği yerdir.

## Temel Üretim Akışı

1. Üretim yöneticisi web paneline giriş yapar.
2. Ürün ve makine ana verileri hazırsa iş emri oluşturur.
3. İş emrine ürün, planlanan adet, makine ve operatör atanır.
4. Operatör mobil uygulamaya giriş yapar.
5. Operatör sadece kendisine atanmış iş emirlerini görür.
6. Operatör ilgili iş emrini başlatır.
7. Sistem iş emrini `IN_PROGRESS` durumuna alır.
8. Operatör üretim miktarı, fire miktarı ve varsa not girer.
9. Backend üretim kaydını oluşturur ve iş emri toplamlarını aynı transaction içinde günceller.
10. Dashboard Socket.io eventi ile güncel veriyi yeniler.
11. Yönetici web dashboard'da üretim miktarını, fireyi ve operatör notunu görür.
12. İş tamamlanınca operatör mobil uygulamadan iş emrini tamamlar.

## İş Emri Yaşam Döngüsü

```text
PLANNED -> IN_PROGRESS -> PAUSED -> IN_PROGRESS -> COMPLETED
```

Durumların anlamı:

- `PLANNED`: İş emri planlandı ama üretim başlamadı.
- `IN_PROGRESS`: Üretim sahada devam ediyor.
- `PAUSED`: Üretim geçici olarak durdu.
- `COMPLETED`: Üretim tamamlandı.
- `CANCELLED`: İş emri iptal edildi.

MVP'de normal akışta başlatma, duraklatma ve tamamlama operatör mobil ekranından yapılır. Web tarafındaki durum aksiyonları yönetici müdahalesi içindir.

## Operasyon Bazlı Akış

Rotalı iş emirlerinde operatör iş emrinin tamamını değil, kendisine atanan operasyon adımını yönetir.

```text
WAITING -> READY -> IN_PROGRESS -> PAUSED -> IN_PROGRESS -> COMPLETED
```

Kurallar:

- Operatör sadece kendisine atanan operasyonu başlatabilir, duraklatabilir ve tamamlayabilir.
- Operasyon başlatıldığında backend ana iş emrini otomatik `IN_PROGRESS` durumuna alır.
- Operasyon duraklatıldığında backend ana iş emrini `PAUSED` durumuna alır.
- Duraklatılan operasyona üretim girişi yapılamaz; önce tekrar başlatılmalıdır.
- Operasyon tamamlanmadan önce o operasyon için üretim veya fire kaydı girilmelidir.
- Bir operasyon tamamlanınca sıradaki operasyon otomatik `READY` olur.
- Son operasyon da tamamlanırsa backend ana iş emrini `COMPLETED` durumuna alır.

Bu kural, üretim sahasında "ekranda tamamlandı ama veritabanında üretim yok" gibi kritik veri kaybı risklerini azaltmak içindir.

## Üretim Kaydı Nasıl Akar?

Mobilde operatör şu bilgileri girer:

- İş emri
- Makine
- Üretilen adet
- Fire adedi
- Not
- Görsel kanıt

Backend şu kontrolleri yapar:

- İş emri üretimde mi?
- İş emri gerçekten bu operatöre atanmış mı?
- Makine iş emrindeki makineyle eşleşiyor mu?
- Üretim miktarı kalan plan miktarını aşıyor mu?
- Üretim ve fire toplamı sıfırdan büyük mü?

Kontroller geçerse:

- `production_logs` kaydı oluşturulur.
- Görsel varsa üretim kaydına bağlı attachment olarak saklanır.
- İş emrinin `producedQuantity` ve `scrapQuantity` değerleri güncellenir.
- Dashboard için `production:logged` ve `workOrder:updated` eventleri yayınlanır.

## Operatör Notları Nerede Görünür?

Operatör mobilde not girdiğinde bu not üretim kaydının içinde saklanır.

Yönetici web panelinde:

```text
Üretim Paneli -> Operatör Notları
Üretim Paneli -> Son Üretim Kayıtları -> Not
```

kolonunda bu notu görür.

Operatör Notları paneli, son 24 saatte girilen kritik saha notlarının tablo içinde kaybolmadan yönetici tarafından fark edilmesi için kullanılır.
Operatör görsel eklediyse, bu panelde ve Son Üretim Kayıtları tablosunda önizleme olarak görünür.

Bu, operatör ile yönetici arasındaki ilk iletişim kanalıdır. Faz 2'de bu yapı daha gelişmiş yorum, bildirim veya aksiyon takibi sistemine dönüşebilir.

## Yönetici Ne Kadar Müdahale Etmeli?

Yönetici üretim sürecini planlamalı ve takip etmelidir. Günlük üretim adetlerini sürekli webden girmesi önerilmez.

İyi müdahaleler:

- İş emri oluşturma
- Operatör atama
- Makine atama
- Yanlış atamayı düzeltme
- İş emrini acil durumda duraklatma
- Rapor ve dashboard izleme

Riskli müdahaleler:

- Operatör adına sürekli üretim adedi girmek
- Sahada başlamamış üretimi başlamış gibi göstermek
- Fireleri sonradan keyfi değiştirmek
- Tamamlanan üretim adetlerini iz bırakmadan değiştirmek

Bu nedenle MVP'de manuel üretim girişi web tarafında yalnızca admin için istisnai düzeltme olarak bırakılmıştır. Normal üretim verisi mobil operatör uygulamasından gelmelidir.

## MVP Sınırı

Bu MVP şunları kapsar:

- JWT tabanlı giriş
- Rol bazlı yetkilendirme
- Ürün, makine, üretim hattı ve kullanıcı yönetimi
- İş emri oluşturma ve atama
- Mobil operatör üretim akışı
- Üretim/fire/not kaydı
- Dashboard ve rapor görünümü
- Temel kalite kontrol
- Socket.io ile canlı dashboard yenileme

Bu MVP şunları kapsamaz:

- PLC veya IoT makine entegrasyonu
- Otomatik çevrim süresi okuma
- Barkod okutma
- Gelişmiş vardiya planlama
- Bakım yönetimi
- ERP entegrasyonu
- Bildirim ve onay akışları

## Faz 2 Fikirleri

- Fire nedeni için ayrı tablo ve seçim ekranı
- Operatör notlarına yönetici yanıtı
- İş emri veya makine bazlı kontrollü operatör iletişimi
- Mobil kalite kontrol ekranı
- Barkod veya QR ile iş emri/makine seçimi
- Makine duruş nedeni takibi
- Vardiya bazlı üretim performansı
- Admin düzeltmeleri için audit log
- Dashboard için daha gelişmiş canlı üretim ekranı
- Offline mobil veri girişi ve sonra senkronizasyon

## Kısa Özet

```text
Web paneli üretimi planlar ve izler.
Mobil uygulama sahadan gerçek üretim verisini toplar.
Backend iş kurallarını ve veri bütünlüğünü korur.
Dashboard yöneticinin üretimi canlı takip ettiği ekrandır.
```
