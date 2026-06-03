# Phase 3.6 - Pending Quality Result Flow

## Goal

The system now separates two concepts clearly:

- mobile quality operation completion
- official web quality result entry

Factory problem solved:

- A quality operator can complete the physical inspection operation on mobile.
- Quality staff can then see that the work order is waiting for an official result.
- Work orders with completed quality operations are no longer hidden in the generic quality form.

## Flow

1. Production route reaches the quality operation.
2. The assigned quality operator completes the operation on mobile.
3. The work order appears in the web Quality page as `waiting for quality result`.
4. Quality staff selects the pending item.
5. The form is prefilled with the work order and quality operation.
6. Quality staff saves `PASSED`, `PARTIAL`, or `FAILED`.
7. If result is `PARTIAL` or `FAILED`, the quality action flow creates a production alert.

## Technical Rule

A work order is waiting for quality result when:

- it has a completed operation whose name contains `kalite` or `quality`
- that operation produced quantity greater than zero
- no `QualityCheck` exists for that operation

## Frontend

Implemented in:

```txt
web/src/pages/Quality.jsx
web/src/styles.css
```

The Quality page now includes a top panel:

```txt
Kalite Sonucu Bekleyen Isler
```

Clicking a pending card selects the correct work order and operation.

## Demo Data

The demo scenario includes:

```txt
E2E-DEMO-QUALITY-PENDING
```

Its quality operation is complete, but it has no official quality result yet.

## Acceptance Test

Command:

```txt
npm run test:phase3:quality-pending
```

The test verifies:

- completed quality operation without result is pending
- completed quality operation with existing result is not pending
- pending item carries operation production quantity

## Interview Explanation

This design avoids mixing an operation event with a quality decision.

The mobile app records that quality work was physically completed. The web quality role records the official quality decision. This keeps production flow and quality approval traceable but separate.
