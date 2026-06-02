import { useEffect, useMemo, useState } from "react";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications.api.js";
import { useSocket } from "../hooks/useSocket.js";
import { useAuthStore } from "../store/authStore.js";

const TYPE_LABELS = {
  OPERATION_HANDOFF: "Operasyon Devri",
  OPERATION_MESSAGE: "Operasyon Mesajı",
  CRITICAL_PRODUCTION_ALERT: "Kritik Uyarı"
};

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function Notifications() {
  const user = useAuthStore((state) => state.user);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadNotifications() {
    try {
      const response = await getNotifications({ limit: 150 });
      setNotifications(response.data);
      setUnreadCount(response.meta.unreadCount);
      setError("");
    } catch (_error) {
      setError("Bildirimler yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  useSocket({
    "notification:created": (notification) => {
      if (notification.recipientId !== user?.id) {
        return;
      }

      setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)]);
      setUnreadCount((current) => current + 1);
    }
  });

  const filteredNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (filter === "UNREAD") {
          return !notification.readAt;
        }

        return filter === "ALL" || notification.type === filter;
      }),
    [filter, notifications]
  );

  async function handleMarkRead(notificationId) {
    const response = await markNotificationRead(notificationId);
    setNotifications((current) =>
      current.map((notification) => (notification.id === notificationId ? { ...notification, readAt: notification.readAt ?? new Date().toISOString() } : notification))
    );
    setUnreadCount(response.meta.unreadCount);
  }

  async function handleMarkAllRead() {
    const response = await markAllNotificationsRead();
    const now = new Date().toISOString();
    setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? now })));
    setUnreadCount(response.meta.unreadCount);
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Bildirim Merkezi</h1>
          <p>Size atanan operasyonları, gelen mesajları ve kritik üretim uyarılarını takip edin.</p>
        </div>
        <button className="primary-button" type="button" onClick={handleMarkAllRead} disabled={!unreadCount}>
          Tümünü Okundu Yap
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-grid">
        <article>
          <span>Toplam Bildirim</span>
          <strong>{isLoading ? "..." : notifications.length}</strong>
        </article>
        <article>
          <span>Okunmamış</span>
          <strong>{isLoading ? "..." : unreadCount}</strong>
        </article>
        <article>
          <span>Filtrelenen</span>
          <strong>{isLoading ? "..." : filteredNotifications.length}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="notification-filter-row">
          {[
            { value: "ALL", label: "Tümü" },
            { value: "UNREAD", label: "Okunmamış" },
            { value: "OPERATION_HANDOFF", label: "Operasyon Devri" },
            { value: "OPERATION_MESSAGE", label: "Mesajlar" },
            { value: "CRITICAL_PRODUCTION_ALERT", label: "Kritik Uyarılar" }
          ].map((option) => (
            <button key={option.value} className={filter === option.value ? "filter-chip-active" : ""} type="button" onClick={() => setFilter(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <section className="notification-list">
        {filteredNotifications.map((notification) => (
          <article key={notification.id} className={`notification-card ${notification.readAt ? "" : "notification-unread"}`}>
            <div>
              <div className="notification-heading">
                <strong>{notification.title}</strong>
                <span>{TYPE_LABELS[notification.type] ?? notification.type}</span>
              </div>
              <p>{notification.message}</p>
              <small>{formatDateTime(notification.createdAt)}</small>
            </div>
            {!notification.readAt ? (
              <button type="button" onClick={() => handleMarkRead(notification.id)}>
                Okundu
              </button>
            ) : (
              <span className="read-state">Okundu</span>
            )}
          </article>
        ))}
        {!isLoading && filteredNotifications.length === 0 ? <p className="empty-state">Bu filtrede bildirim yok.</p> : null}
      </section>
    </div>
  );
}
