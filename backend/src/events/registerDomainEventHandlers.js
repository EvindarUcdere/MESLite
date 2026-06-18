import { emitEvent } from "../config/socket.js";
import { recordDomainEventLog } from "../modules/domain-event-logs/domainEventLog.service.js";
import { sendPushNotificationToUser } from "../modules/push-tokens/pushToken.service.js";
import { DOMAIN_EVENTS } from "./domainEvents.js";
import { onDomainEvent } from "./domainEventBus.js";

let registered = false;

export function registerDomainEventHandlers() {
  if (registered) {
    return;
  }

  registered = true;

  onDomainEvent(DOMAIN_EVENTS.NOTIFICATION_CREATED, async ({ payload }) => {
    const { notification, recipientId } = payload;

    if (!notification || !recipientId) {
      return;
    }

    emitEvent("notification:created", notification);
    await sendPushNotificationToUser(recipientId, notification);
  });

  onDomainEvent("*", async (event) => {
    await recordDomainEventLog(event);

    if (process.env.DOMAIN_EVENT_DEBUG === "true") {
      const { type, id } = event;
      console.log(`[domain-event] ${type} ${id}`);
    }
  });
}
