# MES Lite Raporlama Mimarisi

MES Lite hibrit veri erişim modeli kullanır:

- Operasyonel işlemler Prisma ORM ile yürür.
- Analitik ve raporlama hesapları SQL aggregate sorguları ile yürür.

Bu ayrımın amacı, üretim sisteminde hem veri tutarlılığını hem de rapor performansını korumaktır.

## Prisma ile Yönetilen Alanlar

Prisma, kayıt oluşturma ve güncelleme tarafında kullanılır:

- Login ve kullanıcı yönetimi
- İş emri oluşturma ve operasyon atama
- Üretim kaydı oluşturma
- Fire kararı ve telafi iş emri oluşturma
- Bildirimler
- Makineler, operasyonlar ve vardiya planları
- Duruş kayıtları

Bu alanlarda ORM kullanmak mantıklıdır çünkü:

- Transaction yönetimi daha okunabilir olur.
- İlişkili kayıtlar daha güvenli oluşturulur.
- Rol/yetki ve validasyon kodu servis katmanında net kalır.
- Kod bakımı ve yeni özellik ekleme daha kontrollü ilerler.

## SQL ile Yönetilen Alanlar

Raporlama tarafında PostgreSQL aggregate sorguları kullanılır:

- OEE ve üretim KPI hesapları
- Planlanan / gerçekleşen üretim karşılaştırması
- Günlük üretim ve fire trendleri
- Vardiya performans analizi
- Makine bazlı üretim ve fire performansı
- Operatör/vardiya ve makine/vardiya kırılımları

Bu alanlarda SQL kullanmak mantıklıdır çünkü:

- Büyük veri setlerinde tüm ham kayıtları uygulamaya çekmeden sonuç üretir.
- `SUM`, `COUNT`, `GROUP BY`, `FILTER`, `date_trunc` gibi veritabanı yeteneklerinden yararlanır.
- Rapor ekranlarının büyümesine rağmen API cevapları daha kontrollü kalır.
- İleride materialized view, cache veya BI entegrasyonuna geçmek kolaylaşır.

## Uygulanan Teknik Karar

Rapor modülünde `reportSql.service.js` dosyası oluşturuldu.

Bu dosya `Prisma.$queryRaw` ile parametreli SQL sorguları çalıştırır. String birleştirme yapılmaz; filtreler Prisma SQL fragment yapısıyla hazırlanır.

Bu yaklaşım SQL injection riskini azaltır ve raporlama sorgularını servis kodundan ayırır.

## Mevcut SQL Raporları

İlk aşamada şu rapor parçaları SQL katmanına taşındı:

- Toplam proses üretimi ve final ürün üretimi
- Günlük üretim/fire trendi
- Aylık planlanan / gerçekleşen üretim
- Makine bazlı üretim/fire performansı
- Vardiya bazlı üretim/fire performansı
- Operatör-vardiya performansı
- Makine-vardiya performansı
- OEE özet hesapları
- Makine bazlı OEE
- Operasyon bazlı OEE
- Operasyon süre performansı
- Makine/operatör bazlı süre performansı
- Geciken operasyon listesi
- Duruş nedenleri
- Vardiya, makine ve operasyon bazlı duruş kırılımları

Frontend API çıktısı değiştirilmedi. Web tarafı aynı alanları okumaya devam eder:

- `summary`
- `productionTrend`
- `planActualPerformance`
- `machinePerformance`
- `shiftPerformance`
- `operatorShiftPerformance`
- `machineShiftPerformance`

Bu sayede mimari iyileştirme yapılırken UI kırılmaz.

## Sonraki İyileştirme Alanları

Bir sonraki aşamada şu raporlar da SQL tarafına taşınabilir:

- Kalite karar dağılımları
- Fire nedeni ve fire kararı trendleri
- Ürün bazlı final üretim performansı
- Rota bazlı üretim/verimlilik performansı

Veri büyüdüğünde bu sorgular için PostgreSQL indexleri ve gerekiyorsa materialized view kullanılabilir.
