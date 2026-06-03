# Demo Data Management

## Goal

Keep the demo environment understandable while the system is being tested from web and mobile.

During development, manual test work orders such as `MOB-TEST-*`, `MOB-DEMO-*`, `denem`, or `Deneme*` can pollute reports and make production totals look inconsistent.

## Commands

Clean known manual/mobile test work orders:

```txt
npm run cleanup:test-data
```

Clean test work orders and recreate the official E2E demo scenario:

```txt
npm run reset:demo
```

Recreate only the official E2E demo scenario:

```txt
npm run seed:demo
```

Check production consistency without changing data:

```txt
npm run check:production-consistency
```

Reconcile work order totals with operation totals:

```txt
npm run reconcile:production
```

## What Gets Cleaned

Default cleanup prefixes:

- `MOB-TEST-`
- `MOB-DEMO-`
- `denem`
- `Deneme`

The cleanup deletes related:

- notifications
- alert events
- production alerts
- production log attachments
- production logs
- quality checks
- operation messages
- operation downtimes
- work order operations
- work orders

## What Is Preserved

The official demo scenario is preserved unless `seed:demo` recreates it:

- `E2E-DEMO-RUN`
- `E2E-DEMO-PAUSE`
- `E2E-DEMO-QUALITY`
- `E2E-DEMO-QUALITY-PENDING`
- `E2E-DEMO-REOPEN`

Master data is preserved:

- products
- product routes
- machines
- users
- shifts

## Interview Explanation

This is operational hygiene.

In MES projects, reports and traceability screens are only useful if test data does not silently distort production totals. The cleanup command is intentionally prefix-based and scoped to work orders, so it does not destroy master data or the official demo scenario.
