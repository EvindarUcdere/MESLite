import { prisma } from "../../config/db.js";
import { emitEvent } from "../../config/socket.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const NOTIFICATION_CHANNEL_ID = "mes-lite-alerts-v2";

function isExpoPushToken(token) {
  return typeof token === "string" && (token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken["));
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function registerPushToken(userId, data) {
  const token = data.token.trim();

  return prisma.pushToken.upsert({
    where: { token },
    update: {
      userId,
      platform: data.platform,
      deviceName: data.deviceName,
      isActive: true,
      lastSeenAt: new Date()
    },
    create: {
      userId,
      token,
      platform: data.platform,
      deviceName: data.deviceName
    }
  });
}

export async function deactivatePushToken(userId, token) {
  return prisma.pushToken.updateMany({
    where: { userId, token },
    data: { isActive: false }
  });
}

export function findPushTokensForUser(userId) {
  return prisma.pushToken.findMany({
    where: { userId },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      platform: true,
      deviceName: true,
      isActive: true,
      lastSeenAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function createPushTestNotification(user) {
  const notification = await prisma.notification.create({
    data: {
      recipientId: user.id,
      type: "PUSH_TEST",
      title: "MES Lite test bildirimi",
      message: "Bu bildirim telefon bildirim cubugunda sesli olarak gorunmeli.",
      entityType: "User",
      entityId: user.id,
      metadata: {
        test: true,
        requestedById: user.id,
        requestedByName: user.name
      }
    },
    include: {
      recipient: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true
        }
      }
    }
  });

  emitEvent("notification:created", notification);
  const push = await sendPushNotificationToUser(user.id, notification);

  return { notification, push };
}

export async function sendPushNotificationToUser(userId, notification) {
  const tokens = await prisma.pushToken.findMany({
    where: {
      userId,
      isActive: true
    }
  });
  let unreadCount = 1;
  try {
    unreadCount = await prisma.notification.count({
      where: {
        recipientId: userId,
        readAt: null
      }
    });
  } catch (_error) {
    unreadCount = 1;
  }

  const expoMessages = tokens
    .filter((entry) => isExpoPushToken(entry.token))
    .map((entry) => ({
      to: entry.token,
      sound: "default",
      channelId: NOTIFICATION_CHANNEL_ID,
      priority: "high",
      title: notification.title,
      body: notification.message,
      badge: unreadCount,
      data: {
        notificationId: notification.id,
        type: notification.type,
        entityType: notification.entityType,
        entityId: notification.entityId,
        metadata: notification.metadata
      }
    }));

  if (!expoMessages.length) {
    return { sent: 0, disabled: 0 };
  }

  let disabled = 0;
  const tickets = [];
  for (const batch of chunk(expoMessages, 100)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(batch)
      });

      const payload = await response.json();
      const results = Array.isArray(payload.data) ? payload.data : [];
      tickets.push(...results);
      console.log(
        "Expo push response",
        JSON.stringify({
          notificationId: notification.id,
          sent: batch.length,
          tickets: results
        })
      );
      const disabledTokens = results
        .map((result, index) => ({ result, token: batch[index]?.to }))
        .filter(({ result }) => result?.status === "error" && result?.details?.error === "DeviceNotRegistered")
        .map(({ token }) => token)
        .filter(Boolean);

      if (disabledTokens.length) {
        const updateResult = await prisma.pushToken.updateMany({
          where: { token: { in: disabledTokens } },
          data: { isActive: false }
        });
        disabled += updateResult.count;
      }
    } catch (error) {
      console.warn("Expo push notification failed", error.message);
      tickets.push({ status: "error", message: error.message });
    }
  }

  return { sent: expoMessages.length, disabled, tickets };
}
