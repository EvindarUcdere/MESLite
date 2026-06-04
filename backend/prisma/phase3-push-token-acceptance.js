import { prisma } from "../src/config/db.js";
import { registerPushToken } from "../src/modules/push-tokens/pushToken.service.js";
import { createNotification } from "../src/modules/notifications/notification.service.js";

const token = "ExpoPushToken[acceptance-test-token]";
let notificationId = null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const operator = await prisma.user.findUnique({ where: { email: "assembly.operator@meslite.local" } });
  assert(operator, "Ali Kaya operator is missing");

  const registered = await registerPushToken(operator.id, {
    token,
    platform: "android",
    deviceName: "Acceptance Test Device"
  });

  assert(registered.userId === operator.id, "Push token must be linked to operator");
  assert(registered.isActive === true, "Push token must be active");

  const updated = await registerPushToken(operator.id, {
    token,
    platform: "android",
    deviceName: "Acceptance Test Device Updated"
  });

  assert(updated.id === registered.id, "Registering same token must update existing record");
  assert(updated.deviceName === "Acceptance Test Device Updated", "Existing push token metadata must update");

  const notification = await createNotification({
    recipientId: operator.id,
    type: "PUSH_ACCEPTANCE",
    title: "Push kabul testi",
    message: "Push token entegrasyonu calisiyor.",
    entityType: "PushToken",
    entityId: registered.id,
    metadata: { acceptance: true }
  });
  notificationId = notification.id;

  assert(notification.recipientId === operator.id, "Notification must be created for operator");

  console.log({
    acceptance: "ok",
    checkedRules: [
      "push token registration",
      "push token upsert",
      "notification creation remains compatible with push delivery"
    ]
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (notificationId) {
      await prisma.notification.deleteMany({ where: { id: notificationId } });
    }

    await prisma.pushToken.deleteMany({ where: { token } });
    await prisma.$disconnect();
  });
