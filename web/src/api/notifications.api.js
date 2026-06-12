import { apiClient } from "./client.js";

export async function getNotifications(params = {}) {
  const response = await apiClient.get("/notifications", { params });
  return response.data;
}

export async function markNotificationRead(notificationId) {
  const response = await apiClient.patch(`/notifications/${notificationId}/read`);
  return response.data;
}

export async function markAllNotificationsRead() {
  const response = await apiClient.patch("/notifications/read-all");
  return response.data;
}

export async function clearNotifications() {
  const response = await apiClient.delete("/notifications");
  return response.data;
}
