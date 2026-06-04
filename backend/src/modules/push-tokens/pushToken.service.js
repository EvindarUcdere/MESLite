import { prisma } from "../../config/db.js";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

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

export async function sendPushNotificationToUser(userId, notification) {
  const tokens = await prisma.pushToken.findMany({
    where: {
      userId,
      isActive: true
    }
  });

  const expoMessages = tokens
    .filter((entry) => isExpoPushToken(entry.token))
    .map((entry) => ({
      to: entry.token,
      sound: "default",
      title: notification.title,
      body: notification.message,
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
    }
  }

  return { sent: expoMessages.length, disabled };
}
