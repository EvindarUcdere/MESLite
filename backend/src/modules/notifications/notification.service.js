import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";

const includeRecipient = {
  recipient: {
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

export function findNotificationsForUser(userId, { unreadOnly = false, limit = 100 } = {}) {
  return prisma.notification.findMany({
    where: {
      recipientId: userId,
      ...(unreadOnly ? { readAt: null } : {})
    },
    include: includeRecipient,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limit) || 100, 250)
  });
}

export function countUnreadNotifications(userId) {
  return prisma.notification.count({
    where: {
      recipientId: userId,
      readAt: null
    }
  });
}

export async function createNotification(
  {
    recipientId,
    type,
    title,
    message,
    entityType,
    entityId,
    metadata
  },
  tx = prisma
) {
  if (!recipientId) {
    return null;
  }

  const notification = await tx.notification.create({
    data: {
      recipientId,
      type,
      title,
      message,
      entityType,
      entityId,
      metadata: sanitizeMetadata(metadata)
    },
    include: includeRecipient
  });

  emitEvent("notification:created", notification);
  return notification;
}

export async function createNotificationsForRoles(roles, payload, tx = prisma) {
  const users = await tx.user.findMany({
    where: {
      role: { in: roles },
      isActive: true
    },
    select: { id: true }
  });

  return Promise.all(
    users.map((user) =>
      createNotification(
        {
          ...payload,
          recipientId: user.id
        },
        tx
      )
    )
  );
}

export function markNotificationRead(userId, id) {
  return prisma.notification.updateMany({
    where: {
      id,
      recipientId: userId
    },
    data: {
      readAt: new Date()
    }
  });
}

export function markAllNotificationsRead(userId) {
  return prisma.notification.updateMany({
    where: {
      recipientId: userId,
      readAt: null
    },
    data: {
      readAt: new Date()
    }
  });
}
