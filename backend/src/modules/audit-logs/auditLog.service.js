import { prisma } from "../../config/db.js";

const includeActor = {
  actor: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  }
};

function sanitizeMetadata(value) {
  if (value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMetadata(item));
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeMetadata(entry)]));
  }

  return value;
}

export function findAuditLogs({ limit = 100, entityType, entityId, actorId } = {}) {
  return prisma.auditLog.findMany({
    where: {
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(actorId ? { actorId } : {})
    },
    include: includeActor,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limit) || 100, 250)
  });
}

export function recordAuditLog(
  {
    actorId,
    action,
    entityType,
    entityId,
    summary,
    metadata
  },
  tx = prisma
) {
  if (!actorId) {
    return null;
  }

  return tx.auditLog.create({
    data: {
      actorId,
      action,
      entityType,
      entityId,
      summary,
      metadata: sanitizeMetadata(metadata)
    }
  });
}
