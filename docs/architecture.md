# MES Lite Architecture

## Design Principles

- Keep the MVP focused on production tracking, not full ERP.
- Separate route, controller, service, and database responsibilities.
- Make every feature module isolated so new modules can be added without touching unrelated code.
- Use enums for stable business states such as roles, work order status, and machine status.
- Keep realtime events as notifications of committed backend changes, not a replacement for REST APIs.

## Core Workflow

1. Production manager creates a work order.
2. Manager assigns the work order to an operator and machine.
3. Operator starts production from mobile.
4. Operator logs produced and scrap quantities.
5. Quality staff adds quality checks when needed.
6. Web dashboard updates through REST and Socket.io events.

## Backend Consistency Rules

- Production quantity changes are recorded through `production-logs`.
- A production log write also updates the related work order totals in the same database transaction.
- Machine status changes write both the current machine state and a status history record.
- API responses never expose password hashes.
- Role checks stay in route files so access rules are visible at the API boundary.
- Operators use lifecycle actions such as start, pause, and complete instead of free-form status updates.
- A work order must have both an operator and a machine before production can start.
- Dashboard endpoints provide operational summaries; detailed historical analytics belong in the reports module.

## Module Boundaries

- `auth`: login, token issuing, current user.
- `users`: user administration and role assignment.
- `products`: product master data.
- `production-lines`: factory line definitions.
- `machines`: machine master data and status changes.
- `shifts`: shift definitions.
- `work-orders`: planning and lifecycle state.
- `production-logs`: operator production entries.
- `quality-checks`: basic quality outcomes.
- `dashboard`: operational summaries.
- `reports`: aggregated historical views.
