# MES Lite

MES Lite is a realistic factory production tracking MVP built for portfolio, internship, technopark and junior/mid-level engineering interviews.

The project is not only a CRUD dashboard. It models a real production flow where a work order moves through multiple operations, operators enter production data from mobile, managers monitor the process from web, quality decisions are tracked, and realtime notifications keep both sides synchronized.

## Turkce Kisa Ozet

MES Lite, fabrika uretim sureclerini takip etmek icin gelistirilen gercekci bir MVP projesidir. Sistem; is emirlerini rota ve operasyon adimlariyla takip eder, operatorlerin mobil uygulama uzerinden uretim, fire, durus ve not bilgisi girmesini saglar, uretim yoneticisinin web panelden sureci anlik izlemesine imkan verir.

Projede ozellikle su gercek uretim problemleri ele alindi:

- Urunun hangi operasyon adiminda oldugunu izleme.
- Operasyonlar arasi fire sonrasi aktarilabilir miktari hesaplama.
- Operatorun eksik uretimi tamamlandi diye kapatmasini engelleme.
- Kalite uygunsuzluklarinda geri isleme, hurda veya sartli kabul karari verme.
- Vardiya, makine, operator ve durus nedeni bazli raporlama.
- Web ve mobil arasinda anlik bildirim ve operasyon bazli mesaj akisi.

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

### Planned Phase 4

- Deployment preparation for Railway and Vercel
- Production env validation and health checks
- Docker Compose local setup
- Real phone push testing with EAS Development Build
- Stronger audit log UI
- Report filters and export
- Mobile offline queue
- Role-specific UI polishing

## Interview-Level Technical Summary

MES Lite models work orders as route-based operation flows. Each operation has its own operator, machine, production quantity, scrap quantity, downtime and messages. The backend enforces production rules such as quantity transfer, operator authorization and incomplete completion guards. Socket.io is used only for realtime synchronization after database commits, while PostgreSQL remains the source of truth. Quality issues are tracked as production alerts with explicit decisions such as rework, scrap or conditional acceptance. Reports aggregate production by shift, machine, operator, downtime reason and quality decision.

This makes the project closer to a real MES workflow than a standard admin panel.
