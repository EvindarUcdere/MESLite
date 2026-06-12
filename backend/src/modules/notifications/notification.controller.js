import * as notificationService from "./notification.service.js";

export async function list(req, res) {
  const notifications = await notificationService.findNotificationsForUser(req.user.id, {
    unreadOnly: req.query.unreadOnly === "true",
    limit: req.query.limit
  });
  const unreadCount = await notificationService.countUnreadNotifications(req.user.id);

  res.json({ data: notifications, meta: { unreadCount } });
}

export async function markRead(req, res) {
  await notificationService.markNotificationRead(req.user.id, req.params.id);
  const unreadCount = await notificationService.countUnreadNotifications(req.user.id);

  res.json({ data: { id: req.params.id, read: true }, meta: { unreadCount } });
}

export async function markAllRead(req, res) {
  await notificationService.markAllNotificationsRead(req.user.id);

  res.json({ data: { read: true }, meta: { unreadCount: 0 } });
}

export async function clearAll(req, res) {
  const result = await notificationService.clearNotificationsForUser(req.user.id);

  res.json({ data: { deletedCount: result.count }, meta: { unreadCount: 0 } });
}
