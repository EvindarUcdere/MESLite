# MES Lite

MES Lite is a full-stack Manufacturing Execution System for tracking work orders from planning to final quality control. It combines a React management dashboard, an Expo React Native shop-floor application, and a Node.js/Express backend backed by PostgreSQL.

The system models production as a sequence of route operations rather than a single completed/not-completed flag. Operators record production, scrap, downtime, and field notes at each step; managers and quality staff follow the same process through role-specific web workflows.

## Live Demo

| Service | URL |
| --- | --- |
| Web dashboard | https://mes-lite-web.vercel.app |
| Backend health | https://meslite-production.up.railway.app/health |
| Swagger API documentation | https://meslite-production.up.railway.app/api/docs |
| Android preview APK | https://expo.dev/artifacts/eas/JeZhhYm9xjlx9RLykHJxSYTrnRrpGvnoWchqBB7G3KQ.apk |

The Android preview APK is an Expo EAS internal build artifact and may expire. For a permanent public demo, attach the APK to a GitHub Release.

Demo credentials are intended for local seeded data. See [Demo Users](#demo-users).

## Why MES Lite?

A production manager needs more than a final work-order status. MES Lite answers operational questions such as:

- Which operation is the product currently in?
- Which operator and machine worked on each step?
- How much was produced, scrapped, or transferred forward?
- Why did production stop and how long did the downtime last?
- Can the next operation safely start with the available quantity?
- Which quality decision followed a nonconformity?
- What happens when factory internet access is interrupted?

## Core Capabilities

- Route-based work orders with ordered operation handoff
- Operator and machine assignment for every production step
- Production, scrap, downtime, field-note, and visual-evidence records
- Backend-enforced quantity transfer and completion validation
- Quality checks with passed, failed, and partial decisions
- Scrap, rework, reproduction, and conditional-acceptance workflows
- Role-based experiences for planning, production, quality, administration, and operators
- Persistent notifications and Socket.io realtime updates
- Shift planning and operator calendars
- SQL-based production, downtime, machine, operator, shift, and quality reports
- Audit logs and domain events for critical business actions

## Offline-First Production

MES Lite is designed so an internet interruption does not stop shop-floor data entry.

The mobile application stores critical actions in a local SQLite queue when the backend cannot be reached:

- production and scrap entries
- operation start, pause, resume, and completion
- downtime reasons and operation notes
- quality checks and quality-action decisions

Each queued action receives a UUID `operationId`. When connectivity returns, actions are replayed in creation order through the REST API. The backend stores processed identifiers in `OfflineOperationLog`, preventing the same production action from being applied twice.

```text
Mobile action
    |
    +-- Backend reachable --> REST API --> PostgreSQL
    |
    +-- Backend unavailable --> SQLite queue
                                  |
                                  +-- Connectivity restored
                                         |
                                         v
                                   Ordered REST sync
                                         |
                                         v
                                Idempotency validation
```

Business rules still run during synchronization. A queued action can be rejected if, for example, its work order has already closed, its quantity is no longer valid, or the operator is not authorized. Failed items remain visible with an error message instead of being silently discarded.

For factory deployments, a local edge backend can remain reachable over the factory LAN even when external internet access is unavailable. Socket.io improves online responsiveness but is not used as the persistence mechanism.

## Production Integrity Rules

Critical rules live in the backend service layer and are applied to online and synchronized offline requests.

### Operation handoff

A route may look like:

```text
Cutting -> Pressing -> Welding -> Final Quality Control
```

Completing one operation makes the next assigned operation ready. Operators cannot start arbitrary route steps or complete operations assigned to another user.

### Quantity transfer

For the first operation:

```text
transfer quantity = work-order planned quantity
```

For later operations:

```text
transfer quantity = previous operation output after scrap
```

This prevents downstream operations from producing quantities that were lost in an earlier step.

### Completion validation

An operator cannot close an operation before processing its transferable quantity. Exceptional incomplete closure is restricted to authorized manager workflows.

## Quality Workflow

Completed operations marked for quality control appear in the quality queue. Quality staff can record:

- `PASSED`
- `FAILED`
- `PARTIAL`

Failed or partial checks require a defect reason and can create a tracked production alert. Follow-up decisions include:

- rework operation
- scrap
- reproduction
- conditional acceptance

Quality records remain linked to the work order and operation for traceability and reporting.

## Architecture

```text
React Web Dashboard              Expo React Native App
          |                               |
          | REST API + Socket.io          | REST API + Socket.io
          |                               | SQLite offline queue
          +---------------+---------------+
                          |
                    Express Backend
                          |
              Service Layer / Business Rules
                          |
                    Prisma + Raw SQL
                          |
                      PostgreSQL
```

Design principles:

- PostgreSQL is the source of truth.
- REST API requests perform persistent writes.
- Socket.io announces changes only after committed operations.
- Prisma handles transactional business workflows.
- Raw SQL handles reporting and KPI aggregation.
- UUID-based idempotency protects replayed offline operations.

## Technology Stack

| Area | Technologies |
| --- | --- |
| Backend | Node.js, Express, Prisma, PostgreSQL, Zod, JWT, bcrypt |
| Realtime | Socket.io, persistent notifications, domain events |
| Web | React, Vite, Recharts, lucide-react |
| Mobile | Expo React Native, SQLite, AsyncStorage, expo-image-picker |
| Reporting | PostgreSQL SQL queries through Prisma `$queryRaw` |
| Deployment | Railway, Vercel, Expo EAS |

## Repository Structure

```text
backend/  Express API, Prisma schema, business rules, tests
web/      React management and reporting dashboard
mobile/   Expo mobile app and SQLite offline synchronization
docs/     Architecture, workflow, deployment, and technical notes
scripts/  Local development helpers
```

## Local Setup

### Requirements

- Node.js
- PostgreSQL
- npm
- Expo Go or an Android development/preview build for mobile testing

### 1. Install dependencies

```powershell
npm.cmd install
```

### 2. Create environment files

```powershell
Copy-Item backend\.env.example backend\.env
Copy-Item web\.env.example web\.env
Copy-Item mobile\.env.example mobile\.env
```

Default local PostgreSQL URL:

```text
postgresql://postgres:postgres@localhost:5432/mes_lite?schema=public
```

For a physical phone started manually on the same local network:

```text
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LOCAL_IP:4000/api
EXPO_PUBLIC_EDGE_API_URL=http://YOUR_COMPUTER_LOCAL_IP:4000/api
```

For an Android emulator, use `10.0.2.2` instead of `localhost`.

### 3. Prepare the database

```powershell
cd backend
npm.cmd run prisma:migrate
npm.cmd run seed:demo
```

### 4. Start the project

On Windows, the recommended one-command launcher is:

```powershell
.\start-mes-lite.cmd
```

The launcher detects the local IPv4 address, reuses healthy MES Lite services, avoids port conflicts, connects Expo to the local API, and writes the current addresses to `logs/dev-runtime.json`. The Expo Go QR is refreshed at `logs/expo-go-qr.svg`.

The same launcher can be called through npm:

```powershell
npm.cmd run dev
```

Local services:

| Service | Address |
| --- | --- |
| Backend | `http://localhost:4000` |
| Swagger | `http://localhost:4000/api/docs` |
| Web | `http://localhost:5173` |
| Expo | Address shown by the Expo CLI |

Individual services can be started with:

```powershell
npm.cmd run dev:backend
npm.cmd run dev:web
npm.cmd run dev:mobile:phone
```

## Demo Users

Local seeded users use the password `Admin123!`.

| Role | Email |
| --- | --- |
| Administrator | `admin@meslite.local` |
| Planner | `planner@meslite.local` |
| Production manager | `manager@meslite.local` |
| Operator | `operator@meslite.local` |
| Quality staff | `quality@meslite.local` |

## Demo Flow

1. Sign in to the web dashboard as a planner or production manager.
2. Create or inspect a route-based work order.
3. Assign each operation to an operator and machine.
4. Sign in to the mobile app as the assigned operator.
5. Start the operation and record production, scrap, downtime, or notes.
6. Complete the operation and verify the handoff to the next operator.
7. Complete a quality-required operation and record its quality result.
8. Review notifications, audit history, and production reports.
9. Repeat a mobile action offline and verify ordered, duplicate-safe synchronization.

The detailed walkthrough is available in [docs/e2e-demo-scenario.md](docs/e2e-demo-scenario.md).

## Verification

Backend acceptance scripts cover production integrity, transfer control, downtime, quality, reporting, notifications, and concurrent requests.

Examples:

```powershell
cd backend
npm.cmd run test:phase3:transfer
npm.cmd run test:phase3:downtimes
npm.cmd run test:phase3:quality
npm.cmd run test:phase3:quality-action
npm.cmd run test:phase3:notifications
npm.cmd run check:production-consistency
```

See `backend/package.json` for the complete test command list.

## Documentation

- [Architecture](docs/architecture.md)
- [System flow](docs/system-flow.md)
- [Operation transfer control](docs/phase-3-operation-transfer-control.md)
- [Downtime tracking](docs/phase-3-downtime-tracking.md)
- [Quality action decisions](docs/phase-3-quality-action-decision.md)
- [Deployment plan](docs/phase-4-deployment-plan.md)
- [Production environment checklist](docs/phase-4-production-env-checklist.md)
- [End-to-end demo scenario](docs/e2e-demo-scenario.md)

## Türkçe Özet

MES Lite; iş emirlerini rota ve operasyon adımlarıyla takip eden, operatörlerin mobil uygulamadan üretim, fire, duruş ve saha notu girebildiği tam kapsamlı bir üretim yönetim sistemidir. Yönetim ve kalite ekipleri web paneli üzerinden üretimi anlık izleyebilir, kalite kararlarını yönetebilir ve vardiya, makine, operatör, duruş ve kalite raporlarını inceleyebilir.

Mobil uygulama SQLite tabanlı offline queue kullanır. Bağlantı kesildiğinde kritik saha işlemleri telefonda saklanır; bağlantı geri geldiğinde sırasıyla backend'e aktarılır. Her işlem benzersiz bir `operationId` ile işlendiği için aynı üretim kaydı iki kez uygulanmaz.
