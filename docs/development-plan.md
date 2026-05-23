# Development Plan

## Phase 1: Foundation

- Initialize independent Git repository in `MESLite`.
- Add monorepo workspaces for backend, web, and mobile.
- Define Prisma schema and seed data.
- Build auth, role, error, validation, and socket foundations.

## Phase 2: Backend MVP

- Complete CRUD for users, production lines, machines, products, and shifts.
- Add work order lifecycle actions.
- Add production logs and quality checks.
- Add dashboard and report aggregations.

### Current Backend Progress

- `users`: admin-only user administration with safe password hashing and password-free responses.
- `production-lines`: line master data with machine relations.
- `shifts`: shift master data for production reports.
- `machines`: machine CRUD plus status changes and status history.
- `work-orders`: assignment and lifecycle actions for start, pause, and completion.
- `production-logs`: operator entries update work order totals in a transaction.
- `quality-checks`: quality outcomes are tracked by work order and quality staff.
- `dashboard`: summary and live overview data for operational monitoring.

The production log transaction is important because dashboard totals should never depend on a log existing without the related work order totals being updated.

### Current Web Progress

- Login is connected to the backend JWT flow.
- Dashboard reads real summary and live overview data from the API.
- Work Orders screen supports creating, starting, pausing, and completing orders.
- Production Entry records produced and scrap quantities against started work orders.
- Quality screen records inspection results and defect information for produced work orders.

## Phase 3: Web MVP

- Login and protected routes.
- Operational dashboard.
- Work orders, machines, products, quality, reports, and users.
- Realtime live monitor.

## Phase 4: Mobile MVP

- Operator login.
- Assigned work orders.
- Work order detail and lifecycle actions.
- Production, scrap, machine status, and quality entries.

## Extension Rule

Every new feature should be added as a module with its own route, controller, service, validation, and tests. Shared behavior belongs in `middlewares`, `config`, or `utils` only when at least two modules need it.
