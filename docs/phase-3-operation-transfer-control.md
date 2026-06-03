# Phase 3.7 - Operation Transfer Quantity Control

## Goal

Downstream operations can no longer produce more than the quantity transferred from the previous operation.

Factory problem solved:

- If an upstream operation creates scrap, the next operation must continue with the remaining usable quantity.
- Operators cannot accidentally produce more units than physically available.
- Operation completion is based on transferred quantity, not always the original work order plan.

## Rule

For the first operation:

```txt
transfer quantity = work order planned quantity
```

For later operations:

```txt
transfer quantity = previous operation produced quantity - previous operation scrap quantity
```

Production log rule:

```txt
current operation produced quantity + new produced quantity <= transfer quantity
```

Operator completion rule:

```txt
current operation produced quantity >= transfer quantity
```

Managers can still override operation completion where the business process allows it.

## Example

```txt
Work order plan: 100

1. Kesim
Produced: 100
Scrap: 5
Transferred to Montaj: 95

2. Montaj
Maximum producible quantity: 95
```

## Backend

Implemented in:

```txt
backend/src/modules/production-logs/productionLog.service.js
backend/src/modules/work-order-operations/workOrderOperation.service.js
```

The backend calculates the transfer quantity inside the service layer. This means the rule cannot be bypassed from mobile or web.

## Mobile

Implemented in:

```txt
mobile/App.js
```

The mobile production screen now shows:

- quantity transferred from the previous operation
- remaining quantity for the selected operation
- operation completion warning based on transferred quantity

## Acceptance Test

Command:

```txt
npm run test:phase3:transfer
```

The test verifies:

- previous operation scrap reduces transferable quantity
- downstream operation cannot exceed transferred quantity
- rejected production logs do not mutate the database

## Interview Explanation

This is an important MES rule because production flow is not only status-based; it is quantity-based.

The operation handoff is valid only for the quantity that physically survived the previous operation. PostgreSQL stores operation totals, Prisma fetches the previous operation, and the backend service enforces the transfer limit before writing production logs.
