# Faz 4 - Deployment ve Demo Hazirlik Plani

Faz 4'un amaci, MES Lite'i sadece localde calisan bir gelistirme projesi olmaktan cikarip GitHub, demo ve canli ortam icin sunulabilir hale getirmektir.

Bu fazda yeni is kuralindan cok su konulara odaklanilir:

- production config
- deploy edilebilir backend
- deploy edilebilir web panel
- kontrollu demo veri akisi
- son UI/encoding temizligi
- gercek cihaz bildirim testi

## Cozulen Problem

Local ortamda calisan bir sistem, deploy ortaminda farkli sorunlar cikarabilir:

- production database URL eksik olabilir
- JWT secret zayif veya default kalabilir
- Vercel sayfa yenilemede 404 verebilir
- Railway migration calistirmadan backend'i baslatabilir
- CORS sadece localhost'a izin verebilir
- demo yapan kisi hangi env degerini nereye yazacagini bilemeyebilir

Faz 4 bu riskleri azaltir.

## Hedef Mimari

```text
Vercel Web Dashboard
        |
        | HTTPS REST + Socket.io
        v
Railway Backend API
        |
        v
Railway PostgreSQL
```

Mobil taraf:

```text
Expo / EAS Mobile App
        |
        | HTTPS REST + Socket.io
        v
Railway Backend API
```

## Backend Deploy Hazirligi

Eklenen/duzenlenen dosyalar:

```text
backend/railway.toml
backend/.env.example
backend/src/config/env.js
backend/package.json
```

### Railway davranisi

`backend/railway.toml` sunlari tarif eder:

- Build araci: `railpack`
- Deploy oncesi migration: `npm run prisma:migrate:deploy`
- Start komutu: `npm run start`
- Health check: `/health`

Bu karar su problemi cozer:

```text
Backend yeni Prisma migration'lari uygulamadan eski database semasiyla baslamaz.
```

### Production env kontrolleri

`backend/src/config/env.js` artik kritik env degerlerini kontrol eder.

Zorunlu deger:

```text
DATABASE_URL
```

Production'da guclu olmasi gereken deger:

```text
JWT_SECRET
```

Production'da `JWT_SECRET=change-this-secret` kalirsa backend baslamaz. Bu bilincli bir karardir; guvensiz deploy yerine erken hata almak daha dogrudur.

## Web Deploy Hazirligi

Eklenen dosya:

```text
web/vercel.json
```

Bu dosya React Router kullanan SPA icin tum path'leri `index.html` dosyasina yonlendirir.

Cozen problem:

```text
Kullanici Vercel'de /reports sayfasini yenilediginde 404 almak yerine React uygulamasi acilir.
```

## Gerekli Production Env Degerleri

Detayli env listesi ve guvenlik notlari icin:

```text
docs/phase-4-production-env-checklist.md
```

### Railway Backend

```text
NODE_ENV=production
PORT=4000
DATABASE_URL=<Railway PostgreSQL connection string>
JWT_SECRET=<strong-random-secret>
JWT_EXPIRES_IN=1d
CORS_ORIGINS=https://<vercel-web-domain>
```

Not:

Railway genelde `PORT` degerini kendi verir. Bu nedenle elle vermek zorunlu degildir.

### Vercel Web

```text
VITE_API_URL=https://<railway-backend-domain>/api
```

### Mobile

```text
EXPO_PUBLIC_API_URL=https://<railway-backend-domain>/api
```

## Deploy Sirasi

1. Railway'de PostgreSQL servisi olustur.
2. Railway'de backend servisi olustur.
3. Backend root directory olarak `backend` sec.
4. Backend env degerlerini gir.
5. Railway deploy sonucunda `/health` endpointini kontrol et.
6. Vercel'de web projesi olustur.
7. Web root directory olarak `web` sec.
8. `VITE_API_URL` degerini Railway backend URL'ine bagla.
9. Web deploy sonrasi login ve dashboard akisini test et.
10. Production demo verisi gerekiyorsa kontrollu sekilde seed calistir.

## Demo Smoke Test

Deploy sonrasi minimum test akisi:

1. Backend `/health` endpointi `ok` donmeli.
2. Swagger `/api/docs` acilmali.
3. Web login olmali.
4. Admin/manager is emirlerini gorebilmeli.
5. Operator mobil/web test ekraninda is emrini gorebilmeli.
6. Operasyon mesaji gonderildiginde bildirim webde gorunmeli.
7. Raporlar sayfasi backend verisiyle dolmali.

## Faz 4 Sonraki Adimlari

1. Railway + Vercel gercek deploy.
2. Production demo verisini kontrollu seed etme.
3. Web ve mobil UI son gozden gecirme.
4. Bozuk karakter/encoding temizligi.
5. EAS Development Build ile gercek telefon push testi.
6. README'e canli demo linkleri ve ekran goruntuleri ekleme.

## Kisa Mulakat Anlatimi

Faz 4'te sistemi deploy edilebilir hale getirdim. Backend tarafinda production env validasyonu, Railway migration/start konfigurasyonu ve healthcheck ekledim. Web tarafinda Vercel icin SPA rewrite ayarladim. Boylece proje sadece localde calisan bir MVP degil, disaridan demo edilebilir bir portfoy urunu haline gelmeye basladi.
