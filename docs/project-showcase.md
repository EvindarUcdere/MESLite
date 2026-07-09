# MES Lite Project Showcase

## Short Pitch

MES Lite is a full-stack Manufacturing Execution System built for route-based factory production tracking. It follows a work order from planning through operator execution, scrap and downtime recording, quality decisions, inventory impact, notifications, and management reporting.

The system includes a React web dashboard, an Expo React Native mobile application, and a Node.js/Express backend with PostgreSQL and Prisma. It is designed around real production constraints: operator authorization, operation handoff, quantity transfer validation, offline-first mobile data capture, duplicate-safe synchronization, and persistent notifications.

## Demo Links

| Service | URL |
| --- | --- |
| Web dashboard | https://mes-lite-web.vercel.app |
| Backend health | https://meslite-production.up.railway.app/health |
| Swagger API documentation | https://meslite-production.up.railway.app/api/docs |
| Android preview APK | https://expo.dev/artifacts/eas/Yrf3o1f7R1272zbckeLHTO8WJHdQXwzSjxiHWxPXDg0.apk |

## Suggested Demo Flow

1. Sign in to the web dashboard as a production manager.
2. Review factory performance, active work orders, inventory, notifications, and reports.
3. Open a route-based work order and inspect operation assignments.
4. Sign in to the Android app as an operator.
5. Start an operation, enter production, scrap, downtime, or a field note.
6. Complete the operation and verify the next operation handoff.
7. Record a quality decision and inspect the resulting scrap, rework, or reproduction flow.
8. Turn off connectivity on the phone, create mobile records, then reconnect and verify synchronization.
9. Trigger a notification and verify both in-app and Android notification-bar delivery.

## Technical Highlights

- React web dashboard with role-specific manager, production, quality, and admin workflows.
- Expo React Native mobile app for shop-floor operators and quality staff.
- Offline-first SQLite queue for production, scrap, downtime, quality, and note actions.
- UUID idempotency via backend `OfflineOperationLog` to prevent duplicate replay.
- Socket.io realtime updates for online user experience.
- Persistent notification records and Android push notification support.
- PostgreSQL/Prisma domain model for products, routes, machines, operators, shifts, work orders, inventory, quality, and reporting.
- SQL-based KPI and factory performance reporting.
- Railway backend deployment, Vercel web deployment, and Expo EAS Android build.

## Security And Deployment Notes

- Runtime secrets must stay in environment variables, not in Git.
- `mobile/google-services.json` is ignored locally and should not be committed.
- Android push builds use Firebase/FCM configuration during EAS build.
- Firebase service account private keys, Railway variables, Expo tokens, database URLs, and `.env` files must never be committed.

## Release Notes Template

Title:

```text
MES Lite v0.1.0 - Portfolio Demo
```

Description:

```text
Initial public portfolio demo for MES Lite.

Includes:
- React web dashboard for production, quality, inventory, reporting, and administration workflows
- Node.js/Express API with PostgreSQL and Prisma
- Expo React Native Android app for operator and quality workflows
- Offline-first mobile queue with duplicate-safe synchronization
- Route-based operation handoff and production integrity rules
- Quality, scrap, rework, reproduction, and notification workflows
- Android push notification support

Live web demo:
https://mes-lite-web.vercel.app

Backend health:
https://meslite-production.up.railway.app/health

Swagger API docs:
https://meslite-production.up.railway.app/api/docs

Android APK:
https://expo.dev/artifacts/eas/Yrf3o1f7R1272zbckeLHTO8WJHdQXwzSjxiHWxPXDg0.apk
```
