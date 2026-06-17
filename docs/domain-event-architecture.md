# MES Lite Domain Event Architecture

MES Lite currently uses a lightweight in-process domain event bus. The goal is to separate business facts from side effects.

## Why this exists

Factory workflows create many secondary actions:

- a production log should refresh dashboards,
- a completed operation should notify the next operator,
- a scrap decision may create a compensation work order,
- a notification should be sent through Socket.io and mobile push.

If every service directly knows every side effect, the code becomes hard to extend. Domain events keep the core transaction focused on the factory rule and let handlers react to what happened.

## Current implementation

Files:

- `backend/src/events/domainEvents.js`
- `backend/src/events/domainEventBus.js`
- `backend/src/events/registerDomainEventHandlers.js`

Registered events:

- `notification.created`
- `workOrder.created`
- `workOrder.started`
- `workOrder.paused`
- `productionLog.created`
- `operation.paused`
- `operation.completed`
- `scrapActionWorkOrder.created`
- `qualityCheck.failed`
- `shift.started`

## Current handlers

`notification.created` is handled centrally:

1. emits `notification:created` through Socket.io,
2. sends Expo push notification to the target user.

This keeps `notification.service.js` responsible for database persistence only. Realtime and push delivery are now side effects of a domain event.

## Why not Kafka/RabbitMQ yet?

This is still an MVP/portfolio-scale MES. An in-process event bus is enough for the current deployment because:

- there is one backend process,
- events are immediate side effects,
- there is no cross-service architecture yet.

If MES Lite later grows into separate services, this event layer can be replaced with an out-of-process broker without rewriting every business service.

## Event coverage

The current coverage focuses on high-value factory moments:

- work order planning and start/stop transitions,
- operator shift start notifications,
- operation pause/completion,
- production entry,
- scrap compensation/rework creation,
- failed or partial quality decisions,
- notification delivery.

## Next event candidates

- `machine.statusChanged`
- `workOrder.completed`
- `qualityCheck.passed`
- `maintenance.created`
- `operator.assigned`

These can later feed audit trails, email/SMS, webhook integrations, reporting snapshots, or external ERP synchronization.
