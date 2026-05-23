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

## Development Order

1. Backend foundation and Prisma schema
2. Auth and role middleware
3. Core master data modules
4. Work order workflow
5. Production and quality tracking
6. Dashboard, reports, and realtime events
7. Web dashboard
8. Mobile operator flow
