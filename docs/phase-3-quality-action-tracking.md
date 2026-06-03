# Phase 3.5 - Quality Action Tracking

## Goal

Quality defects should not stay as passive records. When a quality check is `FAILED` or `PARTIAL`, the system now opens an actionable production alert.

Factory problem solved:

- Quality staff can record a defect.
- Production management immediately gets a follow-up action.
- The action stays open until reviewed and resolved.
- The alert history shows who created, reviewed, assigned, or resolved the issue.

## Technical Approach

No new table was added. The implementation reuses the existing action model:

- `QualityCheck`
- `ProductionAlert`
- `ProductionAlertEvent`
- `Notification`
- `ProductionLog`

This keeps the system simple and avoids parallel workflows for production and quality issues.

## Backend Flow

Implemented in:

```txt
backend/src/modules/quality-checks/qualityCheck.service.js
backend/src/modules/production-alerts/productionAlert.service.js
```

When a quality check is created:

1. Backend validates the work order and selected operation.
2. Backend saves the `QualityCheck`.
3. If status is `FAILED` or `PARTIAL`, backend finds the latest production log for the checked operation.
4. Backend creates a `ProductionAlert`.
5. Backend assigns the alert to the active production manager, or admin if no manager exists.
6. Backend creates notifications for admin, production manager, and quality staff.
7. Socket.io emits `quality:checked` and `productionAlert:created`.

## Why This Design

The quality defect belongs to quality, but the corrective action belongs to production management.

Using `ProductionAlert` means the same review and resolution workflow is used for:

- operator critical notes
- machine/process problems
- quality nonconformities

That is closer to a real MES workflow than creating isolated screens for every issue type.

## Acceptance Test

Command:

```txt
npm run test:phase3:quality-action
```

The test verifies:

- partial quality result creates a production alert
- alert is assigned to the production manager
- notification is created
- event history is created

## Interview Explanation

This is a transactional workflow.

The quality result and its follow-up action are handled in the backend service layer with Prisma transactions. The frontend does not decide whether an action is needed; it only displays the result.

That prevents missed quality actions and keeps the audit trail reliable.
