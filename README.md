# MES Lite

MES Lite is a realistic MVP for factory production tracking. It focuses on work orders, machine status, operator production entries, quality checks, and live dashboards.

## Stack

- Backend: Node.js, Express, PostgreSQL, Prisma
- Auth: JWT, bcrypt
- Realtime: Socket.io
- Web: React, Vite, Tailwind, Recharts
- Mobile: React Native Expo
- API Docs: Swagger
- Deploy targets: Railway and Vercel

## MVP Scope

- Role-based authentication
- Users, products, production lines, machines, shifts
- Work order planning and operator assignment
- Production quantity and scrap tracking
- Basic quality checks
- Realtime production monitor
- Dashboard and reports

## Project Structure

```txt
backend/  Express API, Prisma schema, Socket.io, Swagger
web/      React dashboard
mobile/   Expo operator app
docs/     Architecture and implementation notes
```

## Key Documentation

- `docs/architecture.md`: system principles and module boundaries
- `docs/system-flow.md`: role-based factory workflow
- `docs/phase-2-routing-plan.md`: operation routing implementation plan and progress
- `docs/phase-2-technical-review.md`: Phase 2 technical review for portfolio/interview use
- `docs/e2e-demo-scenario.md`: repeatable demo data and acceptance test scenario

## Local Development

Start backend, web dashboard, and mobile web together:

```powershell
npm.cmd run dev
```

URLs:

- Backend API: `http://localhost:4000`
- Web dashboard: `http://localhost:5173`
- Mobile operator web: `http://localhost:8081`

If only one service is needed:

```powershell
npm.cmd run dev:backend
npm.cmd run dev:web
npm.cmd run dev:mobile:web
```

## Development Order

1. Backend foundation and Prisma schema
2. Auth and role middleware
3. Core master data modules
4. Work order workflow
5. Production and quality tracking
6. Dashboard, reports, and realtime events
7. Web dashboard
8. Mobile operator flow
