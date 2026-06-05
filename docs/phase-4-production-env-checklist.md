# Faz 4 - Production Env Checklist

Bu dokuman Railway, Vercel ve mobil build icin gerekli environment variable listesini netlestirir.

Amac:

```text
Deploy sirasinda "hangi degisken nereye yazilacak?" karisikligini azaltmak.
```

## Temel Kural

Backend secret degerleri frontend'e yazilmaz.

```text
DATABASE_URL  -> sadece backend
JWT_SECRET    -> sadece backend
VITE_API_URL  -> web frontend tarafinda public
EXPO_PUBLIC_API_URL -> mobil frontend tarafinda public
```

Frontend env degerleri kullanicinin browser/app bundle'i icinde gorulebilir. Bu nedenle frontend'e asla database URL, JWT secret veya ozel servis secret'i yazilmaz.

## Railway PostgreSQL

Railway'de PostgreSQL servisi olusturulduktan sonra backend servisine su deger baglanir:

```text
DATABASE_URL=<Railway PostgreSQL connection string>
```

Not:

Railway PostgreSQL connection string genelde otomatik olarak degisken seklinde baglanabilir. Backend'in tek ihtiyaci `DATABASE_URL` degerinin runtime'da var olmasidir.

## Railway Backend Env

Railway backend servisi icin gerekli env degerleri:

```text
NODE_ENV=production
DATABASE_URL=<Railway PostgreSQL connection string>
JWT_SECRET=<strong-random-secret>
JWT_EXPIRES_IN=1d
CORS_ORIGINS=https://<vercel-web-domain>
```

Opsiyonel:

```text
PORT=<Railway usually injects this automatically>
```

### `JWT_SECRET`

Guclu ve tahmin edilemez olmali.

Ornek uretme komutu:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Bu degeri GitHub'a commit etme.

### `CORS_ORIGINS`

Virgulle ayrilmis origin listesi olabilir:

```text
CORS_ORIGINS=https://mes-lite-web.vercel.app,https://another-preview-domain.vercel.app
```

Localhost production CORS listesine eklenmemeli. Local development icin `.env` dosyasi ayridir.

## Vercel Web Env

Vercel web projesi icin gerekli env:

```text
VITE_API_URL=https://<railway-backend-domain>/api
```

Ornek:

```text
VITE_API_URL=https://mes-lite-api.up.railway.app/api
```

Bu public bir degerdir. Browser tarafinda gorunebilir.

## Mobile Env

Expo mobile icin gerekli env:

```text
EXPO_PUBLIC_API_URL=https://<railway-backend-domain>/api
```

Local testte:

```text
EXPO_PUBLIC_API_URL=http://localhost:4000/api
```

Android emulator testte:

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api
```

Fiziksel telefon local testte:

```text
EXPO_PUBLIC_API_URL=http://<computer-local-ip>:4000/api
```

Production mobile build icin HTTPS backend URL'i kullanilmalidir.

## Deploy Sonrasi Kontrol Listesi

### Backend

- [ ] `/health` endpointi aciliyor.
- [ ] `/api/docs` Swagger aciliyor.
- [ ] Railway loglarinda migration hatasi yok.
- [ ] Backend loglarinda `JWT_SECRET` veya `DATABASE_URL` hatasi yok.
- [ ] CORS hatasi olmadan web login istegi atabiliyor.

### Web

- [ ] Vercel deploy basarili.
- [ ] Login ekrani aciliyor.
- [ ] Dashboard backend verisi cekiyor.
- [ ] `/reports` sayfasi refresh edilince 404 olmuyor.
- [ ] `/notifications` sayfasi refresh edilince 404 olmuyor.

### Demo Veri

- [ ] Production database bos ise sadece kontrollu demo seed calistirildi.
- [ ] Demo kullanici sifresi production icin bilerek demo amacli tutuldu.
- [ ] Gercek musteri/veri bilgisi yok.

### Mobile

- [ ] `EXPO_PUBLIC_API_URL` production backend URL'ine bakiyor.
- [ ] Operator login olabiliyor.
- [ ] Is emirleri listeleniyor.
- [ ] Operasyon mesaji web ile senkron calisiyor.
- [ ] Push token kaydi hata vermeden backend'e gidiyor.

## Guvenlik Notlari

- `.env` dosyalari GitHub'a commit edilmez.
- `JWT_SECRET` README veya dokumanlarda gercek degerle yazilmaz.
- Production database URL sadece Railway backend servisinde tutulur.
- Frontend env degerleri public kabul edilir.
- Demo kullanici sifresi gercek sistem sifresi gibi dusunulmemelidir.

## Kisa Mulakat Anlatimi

Faz 4'te deploy surecinde environment variable ayrimini netlestirdim. Backend secret degerlerini sadece Railway backend runtime'inda tuttum; web ve mobil tarafinda yalnizca public API URL kullandim. Production'da eksik `DATABASE_URL` veya zayif `JWT_SECRET` varsa backend'in baslamamasini sagladim. Bu, hatali veya guvensiz deploy'u erken yakalamak icin bilincli bir production hardening adimidir.
