# MES Lite Fabrika Profili

MES Lite demo ortamı, metal parça ve makine ekipmanı üreten orta ölçekli bir fabrika senaryosuna göre modellenmiştir.

## Fabrika tipi

- Sektör: Metal parça, bağlantı elemanı ve makine ekipmanı üretimi
- Üretim şekli: Siparişe ve plana bağlı iş emirleri
- Temel akış: Kesim, presleme, CNC işleme, kaynak, montaj, kalite kontrol ve paketleme

Bu profil seçildi çünkü MES tarafında gerçekçi ve ölçülebilir problemler üretir: makine uygunluğu, operatör yetkinliği, vardiya planı, fire, telafi üretimi, kalite kararı, stok ve reçete takibi aynı süreçte birleşir.

## Ürün aileleri

- Hidrolik Valf Gövdesi
- Ambalajlı Final Modül
- Bağlantı Braketi
- Motor Kapak Seti
- Kontrol Panel Kutusu

Bu ürünler farklı rota uzunluklarına ve farklı makine ihtiyaçlarına sahiptir. Böylece sistem yalnızca tek adımlı üretim değil, çok operasyonlu üretim akışını da gösterebilir.

## Standart üretim rotaları

Demo veri, tek tip sahte rota yerine ürün ailesine göre farklı akışlar üretir:

- Hidrolik Valf Gövdesi: CNC tornalama, CNC frezeleme, delik delme/diş açma, fonksiyon test, final kalite, paketleme.
- Ambalajlı Final Modül: lazer kesim, presleme, manuel montaj, fonksiyon test, final kalite, paketleme.
- Bağlantı Braketi: lazer kesim, abkant büküm, delik delme/çapak alma, toz boya, ölçü kontrol, paketleme.
- Motor Kapak Seti: presleme, delik delme, CNC frezeleme, manuel montaj, final kalite, paketleme.
- Kontrol Panel Kutusu: lazer kesim, abkant büküm, robot kaynak, toz boya, manuel montaj, final kalite, paketleme.

Bu yaklaşımın amacı, iş emrinin her adımında doğru makine ailesinin ve doğru operatör yetkinliğinin seçilmesini sağlamaktır. Pres adımında pres makineleri, CNC adımında CNC makineleri, kalite adımında kalite masaları görünmelidir.

## Makine grupları

- Lazer kesim
- Presleme
- Delik delme
- CNC torna ve freze
- Robot kaynak
- Boya
- Montaj
- Fonksiyon test
- Kalite kontrol
- Paketleme

İş emri oluştururken seçilecek makineler operasyon tipine göre filtrelenmelidir. Örneğin presleme adımında sadece pres makineleri, final kontrolde kalite masaları görünmelidir.

## Reçete ve stok mantığı

Final ürünler; sac, alüminyum blok, civata seti, boya, etiket ve koli gibi bileşenlerden oluşur. Bu yapı `ProductBomItem` tablosunda ürün reçetesi olarak tutulur.

Stok tarafında iki ana grup vardır:

- Hammadde ve yardımcı malzeme stokları
- Bitmiş ürün stokları

Bu temel, Faz 5'te MRP için kullanılacaktır. Örneğin 100 adet Motor Kapak Seti üretilecekse sistem reçeteden gerekli sac, civata, etiket ve koli miktarını hesaplayabilecek hale getirilecektir.

## Neden önemli?

Bu profil sayesinde proje artık yalnızca genel bir üretim takip ekranı değil, belirli bir fabrika tipine göre kurgulanmış gerçekçi bir MVP haline gelir.

İş problemi olarak şunları çözer:

- Hangi iş emri hangi operasyonda?
- Hangi operatör hangi makinede çalışabilir?
- Vardiyada kim müsait?
- Fire oluşursa hurda mı, yeniden işlem mi, yeniden üretim mi?
- Eksik üretim nasıl telafi edilir?
- Hangi ürün için hangi malzeme gerekir?
- Stok seviyesi üretimi destekliyor mu?
