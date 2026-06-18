# MES Lite

MES Lite is a realistic factory production tracking MVP built for portfolio, internship, technopark and junior/mid-level engineering interviews.

The project is not only a CRUD dashboard. It models a real production flow where a work order moves through multiple operations, operators enter production data from mobile, managers monitor the process from web, quality decisions are tracked, and realtime notifications keep both sides synchronized.

## Live Demo

| Target | URL |
| --- | --- |
| Web dashboard | `https://mes-lite-web.vercel.app` |
| Backend health | `https://meslite-production.up.railway.app/health` |
| Swagger API docs | `https://meslite-production.up.railway.app/api/docs` |
| Android preview APK | `https://expo.dev/artifacts/eas/udS1MUwJXDSZiTTSCaYdQV.apk` |

Production deployment stack:

- Backend and PostgreSQL run on Railway.
- Web dashboard runs on Vercel.
- Mobile operator app is built with Expo EAS as an Android internal distribution APK.

Current mobile note:

```text
Local Android notifications, sound and badge diagnostics work.
Realtime in-app notifications work through Socket.io.
Background push token registration is being diagnosed on the EAS/Firebase FCM side.
```

## Portfolio Highlights

MES Lite was designed to show backend-heavy product thinking, not only screen implementation:

- Critical production rules live in the backend service layer, not only in React state.
- PostgreSQL is treated as the source of truth.
- Socket.io is used after database commits, so realtime updates do not replace persistence.
- Operation-level production quantities prevent inflated work order totals.
- Scrap in one operation reduces the transferable quantity for the next operation.
- Quality failures are tracked as decisions, not just labels.
- Shift, machine, operator, downtime and quality metrics are reportable.
- Web and mobile clients share the same backend contracts.

## Türkçe Kısa Özet

MES Lite, fabrika üretim süreçlerini takip etmek için geliştirilen gerçekçi bir MVP projesidir. Sistem; iş emirlerini rota ve operasyon adımlarıyla takip eder, operatörlerin mobil uygulama üzerinden üretim, fire, duruş ve not bilgisi girmesini sağlar, üretim yöneticisinin web panelden süreci anlık izlemesine imkân verir.

Projede özellikle şu gerçek üretim problemleri ele alındı:

- Ürünün hangi operasyon adımında olduğunu izleme.
- Operasyonlar arası fire sonrası aktarılabilir miktarı hesaplama.
- Operatörün eksik üretimi tamamlandı diye kapatmasını engelleme.
- Kalite uygunsuzluklarında geri işleme, hurda veya şartlı kabul kararı verme.
- Vardiya, makine, operatör ve duruş nedeni bazlı raporlama.
- Web ve mobil arasında anlık bildirim ve operasyon bazlı mesaj akışı.

## What Problem Does It Solve?

Factories need more than a simple "work order completed" status. A production manager needs to answer questions like:

- Which operation is the product currently in?
- Which operator and machine worked on each step?
- How many units were produced and how many became scrap?
- Did scrap in one operation reduce the quantity available for the next operation?
- Why was production paused?
- Which shift, machine or operator caused more downtime or scrap?
- What happened after a failed quality check?
- Did the next operator receive a notification when the previous operation finished?

MES Lite focuses on these real factory questions.

## Core Features

- Role-based authentication with JWT and bcrypt.
- Web management dashboard for admin, production manager and quality staff.
- Mobile operator app with assigned work orders, operation details and production entry.
- Route-based work order flow: `Cutting -> Assembly -> Quality`.
- Operation-level production, scrap, downtime, notes and visual evidence.
- Quantity transfer control between operations.
- Operator completion guard: operators cannot close incomplete production as completed.
- Manager override for exceptional incomplete closures.
- Realtime updates with Socket.io.
- Persistent notification center for web and mobile.
- Expo push token infrastructure for mobile push notifications.
- Quality checks, nonconformity alerts and quality action decisions.
- Shift-based production reporting.
- Downtime reason analysis.
- Operation delay/time analysis.
- Quality decision reports by operation and machine.
- Demo data and backend acceptance tests for repeatable validation.

## Tech Stack

### Backend

- Node.js
- Express
- PostgreSQL
- Prisma
- JWT
- bcrypt
- Socket.io
- Zod
- Multer
- Swagger

### Web

- React
- Vite
- Tailwind CSS
- Recharts
- socket.io-client
- lucide-react

### Mobile

- React Native Expo
- React Native Web
- AsyncStorage
- expo-image-picker
- expo-notifications
- socket.io-client

### Deploy Targets

- Railway for backend and PostgreSQL
- Vercel for web dashboard
- Expo/EAS for mobile build

## System Architecture

```text
Mobile Operator App        Web Dashboard
        |                       |
        | REST API              | REST API
        | Socket.io             | Socket.io
        v                       v
              Express Backend
                    |
       Service Layer / Business Rules
                    |
              Prisma ORM
                    |
              PostgreSQL
```

Important design decision:

```text
REST API writes data.
Socket.io only announces committed changes.
PostgreSQL is the source of truth.
```

This prevents UI-only state bugs. Even if the mobile or web UI behaves incorrectly, critical factory rules are enforced in the backend service layer.

## Architecture Highlights

MES Lite intentionally uses a hybrid backend architecture. The project does not force every database operation through the same pattern.

### Prisma ORM for Business Workflows

Prisma is used for transactional factory workflows where data consistency, relation handling and maintainable service-layer code are more important than raw aggregation speed.

Prisma-backed areas:

- authentication and users
- work orders and operation assignments
- production logs
- notifications
- downtime records
- machines and operator skills
- quality checks
- shift planning

Reason:

```text
These flows change core factory state.
They need readable business rules, transactions and relation-safe writes.
```

### SQL for Reporting and Analytics

Advanced reports use raw SQL through Prisma `$queryRaw` in:

```text
backend/src/modules/reports/reportSql.service.js
```

SQL-backed areas:

- OEE dashboard metrics
- production KPIs
- shift performance analysis
- monthly planned vs actual production
- scrap/fire trends
- machine efficiency reports
- downtime and delay analysis
- operator and machine performance reports

Reason:

```text
Reports need grouping, date buckets, joins and aggregations.
SQL is clearer and more efficient than loading large datasets into JavaScript.
```

The data-access strategy is:

```text
Prisma ORM = transactional business consistency
Raw SQL    = analytical reporting and KPI aggregation
PostgreSQL = source of truth
```

### Domain Event Layer

MES Lite includes a lightweight domain event layer:

```text
backend/src/events/domainEventBus.js
backend/src/events/domainEvents.js
backend/src/events/registerDomainEventHandlers.js
```

Important backend actions emit domain events after database transactions are completed:

- `workOrder.created`
- `workOrder.started`
- `workOrder.paused`
- `productionLog.created`
- `operation.paused`
- `operation.completed`
- `scrapActionWorkOrder.created`
- `qualityCheck.failed`
- `shift.started`
- `notification.created`

Reason:

```text
The business action and its side effects are separated.
Notifications, realtime updates, push delivery, audit extensions and future ERP integrations
can react to events without making the core services harder to maintain.
```

For this MVP, the event bus is in-process with Node.js `EventEmitter`. It is intentionally simple, but the structure can later evolve into RabbitMQ, Kafka or cloud queues if MES Lite becomes a multi-service system.

## Production Flow

A work order can be linked to a route:

```text
Cutting -> Assembly -> Quality Control
```

Each operation has its own:

- status
- assigned operator
- machine
- planned quantity
- produced quantity
- scrap quantity
- downtime records
- operation messages
- production logs

The system can therefore answer:

```text
The work order is in Assembly.
Cutting produced 120 units and 20 scrap.
Assembly can continue with only 100 transferable units.
```

## Quantity Transfer Rule

For the first operation:

```text
transfer quantity = work order planned quantity
```

For later operations:

```text
transfer quantity = previous operation produced quantity - previous operation scrap quantity
```

Why this matters:

```text
If Cutting produced 120 and 20 became scrap, Assembly must not produce 120.
It can only continue with 100 usable units.
```

This rule is enforced in the backend, not only in the UI.

## Realtime and Notifications

When an important backend action happens:

1. Data is written to PostgreSQL.
2. A persistent notification is created.
3. Socket.io emits an event to active clients.
4. If a mobile push token exists, Expo Push API can send a device notification.

Example events:

```text
notification:created
workOrder:updated
workOrderOperation:updated
production:logged
operationMessage:created
operationDowntime:created
productionAlert:created
productionAlert:updated
quality:checked
```

This means:

- If the app is open, Socket.io updates the screen.
- If the user opens the app later, the notification is still in PostgreSQL.
- If native push is configured, mobile can receive background notifications.

## Quality Flow

Quality checks are linked to the work order and the checked operation.

If a quality check fails or is partially accepted, the system creates a production alert. The production manager can then choose a quality action decision:

```text
REWORK_OPERATION
SCRAP
CONDITIONAL_ACCEPT
```

This turns quality from a simple result field into a tracked decision workflow.

## Reporting

The web reports page uses backend-generated metrics from:

```text
GET /api/reports/overview
```

Report areas:

- Shift performance
- Operator performance by shift
- Machine performance by shift
- Downtime reason analysis
- Downtime by operation, machine and shift
- Operation time and delay analysis
- Quality traceability
- Quality action decision analysis

## Roles

| Role | Main Responsibility |
| --- | --- |
| `ADMIN` | Full system access, master data and user management |
| `PRODUCTION_MANAGER` | Work order planning, monitoring, overrides, reports |
| `QUALITY_STAFF` | Quality checks and quality-related follow-up |
| `OPERATOR` | Mobile production entry, operation status, notes, downtime |

## Demo Users

All demo users use this password:

```text
Admin123!
```

| User | Email | Role |
| --- | --- | --- |
| MES Lite Admin | `admin@meslite.local` | `ADMIN` |
| Production Manager | `manager@meslite.local` | `PRODUCTION_MANAGER` |
| Line Operator | `operator@meslite.local` | `OPERATOR` |
| Ali Kaya | `assembly.operator@meslite.local` | `OPERATOR` |
| Zeynep Demir | `quality.operator@meslite.local` | `OPERATOR` |
| Quality Staff | `quality@meslite.local` | `QUALITY_STAFF` |

These credentials are for local demo data only.

## Demo Walkthrough

A repeatable demo can be presented with this story:

1. Login to the web dashboard as admin or production manager.
2. Create or inspect a route-based work order.
3. Assign operation steps to operators and machines.
4. Login to the mobile app as an operator.
5. Start the assigned operation, enter produced quantity, scrap quantity, downtime reason, note and visual evidence.
6. Complete the operation and verify that the next operation becomes ready.
7. Open the web dashboard and inspect realtime updates, operation messages and notifications.
8. Enter a quality check and, if needed, create a rework, scrap or conditional acceptance decision.
9. Review reports for shift, downtime, machine, operator and quality decision metrics.

The same scenario is documented in `docs/e2e-demo-scenario.md` and backed by acceptance tests.

## Project Structure

```text
backend/  Express API, Prisma schema, Socket.io, Swagger, acceptance tests
web/      React management dashboard
mobile/   Expo operator application
docs/     Architecture, phase notes, technical reviews and demo scenario
scripts/  Local development helper scripts
```

## Local Development

### 1. Install dependencies

```powershell
npm.cmd install
```

### 2. Configure environment files

Backend:

```powershell
Copy-Item backend\.env.example backend\.env
```

Default PostgreSQL connection:

```text
postgresql://postgres:postgres@localhost:5432/mes_lite?schema=public
```

Web:

```powershell
Copy-Item web\.env.example web\.env
```

Mobile:

```powershell
Copy-Item mobile\.env.example mobile\.env
```

For mobile web on the same computer:

```text
EXPO_PUBLIC_API_URL=http://localhost:4000/api
```

For Android emulator:

```text
EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api
```

For a physical phone:

```text
EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LOCAL_IP:4000/api
```

### 3. Prepare database

```powershell
cd backend
npm.cmd run prisma:migrate
npm.cmd run seed:demo
```

To reset repeatable demo work orders:

```powershell
npm.cmd run reset:demo
```

### 4. Start all services

From the project root:

```powershell
npm.cmd run dev
```

URLs:

- Backend API: `http://localhost:4000`
- Swagger docs: `http://localhost:4000/api/docs`
- Web dashboard: `http://localhost:5173`
- Mobile operator web: `http://localhost:8081` or the Expo port shown in terminal

If only one service is needed:

```powershell
npm.cmd run dev:backend
npm.cmd run dev:web
npm.cmd run dev:mobile:web
```

## Backend Acceptance Tests

Run from `backend/`:

```powershell
npm.cmd run test:phase2
npm.cmd run test:phase3:shifts
npm.cmd run test:phase3:downtimes
npm.cmd run test:phase3:time
npm.cmd run test:phase3:quality
npm.cmd run test:phase3:quality-action
npm.cmd run test:phase3:quality-decision
npm.cmd run test:phase3:quality-decision-report
npm.cmd run test:phase3:quality-pending
npm.cmd run test:phase3:transfer
npm.cmd run test:phase3:notifications
npm.cmd run test:phase3:push
npm.cmd run check:production-consistency
```

The tests focus on backend business rules because factory data consistency is more important than UI-only behavior.

## Key Documentation

- `docs/architecture.md`: system principles and module boundaries
- `docs/system-flow.md`: role-based factory workflow
- `docs/phase-2-technical-review.md`: Phase 2 technical review
- `docs/phase-3-technical-review.md`: Phase 3 technical review
- `docs/phase-3-operation-transfer-control.md`: quantity transfer rules
- `docs/phase-3-shift-reporting.md`: shift-based reporting
- `docs/phase-3-downtime-tracking.md`: downtime reason tracking
- `docs/phase-3-quality-action-decision.md`: quality decision workflow
- `docs/phase-4-deployment-plan.md`: deployment and production demo preparation
- `docs/phase-4-production-env-checklist.md`: Railway, Vercel and mobile production env checklist
- `docs/phase-4-mobile-build-plan.md`: Expo/EAS mobile APK build plan
- `docs/e2e-demo-scenario.md`: repeatable demo scenario
- `docs/demo-data-management.md`: demo reset and cleanup commands

## Phase Summary

### MVP

- Authentication
- Users, products, machines, shifts
- Work orders
- Basic production and quality tracking
- Dashboard and reports

### Phase 2

- Route-based production flow
- Work order operations
- Mobile operator production entry
- Operation messages
- Operation-level quality context
- Realtime synchronization

### Phase 3

- Quantity transfer control
- Downtime reason tracking
- Shift-based reports
- Operation time and delay analysis
- Quality action decisions
- Notification routing
- Web notification center
- Mobile push token infrastructure
- Production consistency checks

### Phase 4

- Railway backend and PostgreSQL deployment
- Vercel web deployment
- Expo EAS Android preview APK build
- Production environment variable separation
- Production health checks and Swagger validation
- README and demo documentation for portfolio presentation
- Mobile notification diagnostics for Android push setup

Future Phase 4+ candidates:

- Docker Compose local setup
- Stronger audit log UI
- Report filters and export
- Mobile offline queue
- Role-specific UI polishing
- Final Firebase/FCM push credential hardening

## Interview-Level Technical Summary

MES Lite models work orders as route-based operation flows. Each operation has its own operator, machine, production quantity, scrap quantity, downtime and messages. The backend enforces production rules such as quantity transfer, operator authorization and incomplete completion guards. Socket.io is used only for realtime synchronization after database commits, while PostgreSQL remains the source of truth. Quality issues are tracked as production alerts with explicit decisions such as rework, scrap or conditional acceptance. Reports aggregate production by shift, machine, operator, downtime reason and quality decision.

This makes the project closer to a real MES workflow than a standard admin panel.
