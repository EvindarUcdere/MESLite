import { prisma } from "../../config/db.js";
import { DOMAIN_EVENTS } from "../../events/domainEvents.js";

const ENTITY_BY_PAYLOAD_KEY = [
  ["workOrderId", "WorkOrder"],
  ["workOrderOperationId", "WorkOrderOperation"],
  ["operationId", "WorkOrderOperation"],
  ["productionLogId", "ProductionLog"],
  ["qualityCheckId", "QualityCheck"],
  ["notificationId", "Notification"],
  ["shiftId", "Shift"]
];

function sanitizePayload(value) {
  if (value === undefined) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizePayload(entry)]));
  }

  return value;
}

function inferEntity(payload = {}) {
  for (const [key, entityType] of ENTITY_BY_PAYLOAD_KEY) {
    if (payload[key]) {
      return {
        entityType,
        entityId: payload[key]
      };
    }
  }

  return {
    entityType: payload.entityType ?? null,
    entityId: payload.entityId ?? null
  };
}

function getWorkOrderNo(payload = {}) {
  return payload.workOrderNo ?? payload.orderNo ?? payload.workOrder?.orderNo ?? payload.notification?.metadata?.workOrderNo;
}

function getOperationName(payload = {}) {
  return payload.operationName ?? payload.operation?.operationName ?? payload.workOrderOperation?.operationName;
}

export function buildDomainEventSummary(type, payload = {}) {
  const workOrderNo = getWorkOrderNo(payload);
  const operationName = getOperationName(payload);

  switch (type) {
    case DOMAIN_EVENTS.NOTIFICATION_CREATED:
      return payload.notification?.title ?? "Bildirim oluşturuldu";
    case DOMAIN_EVENTS.WORK_ORDER_CREATED:
      return `${workOrderNo ?? "İş emri"} oluşturuldu`;
    case DOMAIN_EVENTS.WORK_ORDER_STARTED:
      return `${workOrderNo ?? "İş emri"} başlatıldı`;
    case DOMAIN_EVENTS.WORK_ORDER_PAUSED:
      return `${workOrderNo ?? "İş emri"} duraklatıldı`;
    case DOMAIN_EVENTS.PRODUCTION_LOG_CREATED:
      return `${workOrderNo ?? "İş emri"} için üretim kaydı oluşturuldu`;
    case DOMAIN_EVENTS.OPERATION_PAUSED:
      return `${operationName ?? "Operasyon"} duraklatıldı`;
    case DOMAIN_EVENTS.OPERATION_COMPLETED:
      return `${operationName ?? "Operasyon"} tamamlandı`;
    case DOMAIN_EVENTS.SCRAP_ACTION_WORK_ORDER_CREATED:
      return `${workOrderNo ?? "Fire"} için telafi/rework iş emri oluşturuldu`;
    case DOMAIN_EVENTS.QUALITY_CHECK_FAILED:
      return `${workOrderNo ?? "İş emri"} kalite kontrolden geçemedi`;
    case DOMAIN_EVENTS.SHIFT_STARTED:
      return `${payload.shiftName ?? "Vardiya"} başladı`;
    default:
      return type;
  }
}

export async function recordDomainEventLog(event) {
  if (!event?.id || !event?.type) {
    return null;
  }

  const payload = sanitizePayload(event.payload ?? {});
  const entity = inferEntity(payload);

  return prisma.domainEventLog.upsert({
    where: { eventId: event.id },
    update: {},
    create: {
      eventId: event.id,
      type: event.type,
      entityType: entity.entityType,
      entityId: entity.entityId,
      summary: buildDomainEventSummary(event.type, payload),
      payload,
      occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date()
    }
  });
}

export function findDomainEventLogs({ limit = 100, type, entityType, entityId } = {}) {
  return prisma.domainEventLog.findMany({
    where: {
      ...(type ? { type } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {})
    },
    orderBy: { occurredAt: "desc" },
    take: Math.min(Number(limit) || 100, 300)
  });
}
