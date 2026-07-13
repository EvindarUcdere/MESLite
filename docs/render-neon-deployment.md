# Render + Neon Deployment

This guide keeps MES Lite running while the development computer is turned off.

## Target Architecture

```text
Vercel Web Dashboard
        |
        v
Render Node.js/Express API
        |
        v
Neon PostgreSQL

Expo/EAS Android APK -> Render API
```

## 1. Create Neon PostgreSQL

1. Open https://neon.tech and sign in.
2. Create a new project named `mes-lite`.
3. Choose the free plan if available.
4. Copy the pooled PostgreSQL connection string.
5. Keep the connection string private. Do not commit it.

The value will be used as:

```text
DATABASE_URL=<neon pooled postgres connection string>
```

## 2. Create Render Backend

1. Open https://render.com and sign in.
2. Create a new Web Service from the GitHub repository.
3. Select the `MESLite` repository.
4. Use these settings:

```text
Name: mes-lite-api
Root Directory: backend
Runtime: Node
Build Command: npm install && npm run prisma:generate
Start Command: npm run prisma:migrate:deploy && npm run start
Health Check Path: /health
Plan: Free
```

If Render detects `render.yaml`, the same settings can be used from the blueprint.

## 3. Render Environment Variables

Add these variables in Render. Do not commit any of these values.

```text
NODE_ENV=production
DATABASE_URL=<neon pooled postgres connection string>
JWT_SECRET=<strong random string at least 32 characters>
CORS_ORIGINS=https://mes-lite-web.vercel.app
```

Recommended `JWT_SECRET` shape:

```text
at least 32 random letters/numbers/symbols
```

## 4. Seed Demo Data

After the first successful deploy, open the Render service shell if available, or run a one-off job:

```powershell
npm.cmd run seed:door
```

This creates the door-hardware factory demo data.

## 5. Verify Backend

Render will provide a backend URL similar to:

```text
https://mes-lite-api.onrender.com
```

Verify:

```text
https://mes-lite-api.onrender.com/health
https://mes-lite-api.onrender.com/api/docs
```

## 6. Update Vercel Web

In Vercel project environment variables, update:

```text
VITE_API_URL=https://mes-lite-api.onrender.com/api
```

Then redeploy the web dashboard.

## 7. Update Android APK

Update the EAS build environment variable:

```text
EXPO_PUBLIC_API_URL=https://mes-lite-api.onrender.com/api
```

Then create a new Android preview APK:

```powershell
cd mobile
npm.cmd exec eas -- build --platform android --profile preview --non-interactive --no-wait
```

## 8. Final Verification

- Web login works while the development computer is off.
- Android login works while the development computer is off.
- Production, scrap, downtime, quality, and notes call the Render API.
- Offline queue sync works after reconnect.
- Push notification token registration works against the Render API.

## Notes

- Render free services may sleep after inactivity. The first request can be slow.
- Neon free database remains cloud hosted.
- Runtime secrets stay in Render, Vercel, EAS, and Neon dashboards, never in Git.
