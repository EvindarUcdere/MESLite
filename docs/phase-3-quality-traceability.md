# Phase 3.4 - Quality Traceability

## Goal

Quality results are now connected to the production route instead of being treated as an isolated pass/fail record.

Factory problem solved:

- A quality defect must be traced back to the operations that happened before the check.
- Managers need to see which machine, operator, downtime, message, scrap, or delay may explain the defect.
- Quality staff should not manually search work order history across multiple screens.

## Technical Approach

No new table was added. The existing relational model already had the correct ownership:

- `QualityCheck.workOrderId`
- `QualityCheck.workOrderOperationId`
- `WorkOrder.operations`
- `WorkOrderOperation.productionLogs`
- `WorkOrderOperation.messages`
- `WorkOrderOperation.downtimes`
- `WorkOrderOperation.routeOperation.estimatedMinutes`

The backend enriches each quality check with a computed `traceability` payload.

## Backend Logic

Implemented in:

```txt
backend/src/modules/quality-checks/qualityCheck.service.js
```

For every quality check, the service returns:

- checked work order summary
- checked operation
- full route operation list
- machine and assigned operator per operation
- production and scrap totals per operation
- latest production logs
- latest operation messages
- latest downtimes
- planned, actual, downtime, net, and delay minutes
- suspect operation list

Signal rules:

- Scrap creates a `SCRAP` signal.
- Delay creates a `DELAY` signal.
- Downtime creates a `DOWNTIME` signal.
- `QUALITY_ALERT`, `STOPPAGE`, and `WARNING` messages create message signals.
- The operation selected in the quality check is marked as `CHECKED_OPERATION`.

Impact rules:

- `FAILED` or `PARTIAL` quality checks make upstream scrap or critical signals high impact.
- Delay, downtime, or warning signals are medium impact.
- Operations after the checked operation are neutral for that check.

## Frontend

Implemented in:

```txt
web/src/pages/Quality.jsx
web/src/styles.css
```

The Quality page now shows:

- selected work order traceability before saving a check
- risk summary for recent quality checks
- suspect operation cards
- full route cards with machine, operator, status, production, scrap, duration, and delay data

## Acceptance Test

Command:

```txt
npm run test:phase3:quality
```

The test verifies:

- the quality check is still linked to the checked operation
- the full route is returned
- the Montaj scrap signal is detected
- the checked operation is marked correctly
- downtime minutes are included in the traceability payload

## Interview Explanation

This is rule-based traceability, not AI guessing.

The system uses PostgreSQL relations through Prisma, then computes a deterministic quality context in the backend service layer. React only renders the result.

That design is safer for MES software because every quality risk shown on screen can be traced back to a persisted production event.
