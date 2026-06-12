import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearNotifications, getNotifications, markAllNotificationsRead, markNotificationRead } from "../api/notifications.api.js";
import { useSocket } from "../hooks/useSocket.js";
import { useAuthStore } from "../store/authStore.js";

const TYPE_LABELS = {
  OPERATION_HANDOFF: "Operasyon Devri",
  OPERATION_MESSAGE: "Operasyon Mesajı",
  OPERATION_RESTARTED: "Operasyon Başlatıldı",
  OPERATION_REOPENED: "Operasyon Yeniden Açıldı",
  WORK_ORDER_RESTARTED: "İş Emri Başlatıldı",
  OPERATOR_FIELD_MESSAGE: "Saha Mesajı",
  QUALITY_NONCONFORMITY: "Kalite Uygunsuzluğu",
  QUALITY_REWORK_ASSIGNED: "Kalite Geri İşleme",
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

function getNotificationTarget(notification) {
  if (notification.entityType === "WorkOrderOperation") {
    const params = new URLSearchParams();

    if (notification.metadata?.workOrderId) {
      params.set("workOrderId", notification.metadata.workOrderId);
    }

    params.set("operationId", notification.entityId);
    return { label: "Operasyona git", path: `/work-orders?${params.toString()}` };
  }

  if (notification.entityType === "WorkOrder") {
    const workOrderId = notification.metadata?.workOrderId ?? notification.entityId;
    return { label: "İş emrine git", path: `/work-orders?workOrderId=${workOrderId}` };
  }

  if (notification.entityType === "ProductionAlert") {
    return { label: "Uyarıya git", path: "/alerts" };
  }

  return null;
}

export default function Notifications() {
  const navigate = useNavigate();
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
    window.dispatchEvent(new CustomEvent("mes-lite:notifications-unread-changed", { detail: { unreadCount: response.meta.unreadCount } }));
  }

  async function handleMarkAllRead() {
    const response = await markAllNotificationsRead();
    const now = new Date().toISOString();
    setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? now })));
    setUnreadCount(response.meta.unreadCount);
    window.dispatchEvent(new CustomEvent("mes-lite:notifications-unread-changed", { detail: { unreadCount: response.meta.unreadCount } }));
  }

  async function handleClearNotifications() {
    const response = await clearNotifications();
    setNotifications([]);
    setUnreadCount(response.meta.unreadCount);
    window.dispatchEvent(new CustomEvent("mes-lite:notifications-unread-changed", { detail: { unreadCount: response.meta.unreadCount } }));
  }

  async function handleOpenNotification(notification) {
    if (!notification.readAt) {
      await handleMarkRead(notification.id);
    }

    const target = getNotificationTarget(notification);
    if (target) {
      navigate(target.path);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Bildirim Merkezi</h1>
          <p>Size atanan operasyonları, saha mesajlarını ve kritik üretim uyarılarını takip edin.</p>
        </div>
        <div className="action-row">
          <button className="primary-button" type="button" onClick={handleMarkAllRead} disabled={!unreadCount}>
            Tümünü Okundu Yap
          </button>
          <button className="ghost-button" type="button" onClick={handleClearNotifications} disabled={!notifications.length}>
            Bildirimleri Temizle
          </button>
        </div>
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
            { value: "OPERATION_RESTARTED", label: "Tekrar Başlatılan" },
            { value: "OPERATOR_FIELD_MESSAGE", label: "Saha Mesajları" },
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
        {filteredNotifications.map((notification) => {
          const target = getNotificationTarget(notification);

          return (
            <article key={notification.id} className={`notification-card ${notification.readAt ? "" : "notification-unread"}`}>
              <div>
                <div className="notification-heading">
                  <strong>{notification.title}</strong>
                  <span>{TYPE_LABELS[notification.type] ?? notification.type}</span>
                </div>
                <p>{notification.message}</p>
                <small>{formatDateTime(notification.createdAt)}</small>
              </div>
              <div className="notification-actions">
                {target ? (
                  <button type="button" onClick={() => handleOpenNotification(notification)}>
                    {target.label}
                  </button>
                ) : null}
                {!notification.readAt ? (
                  <button type="button" onClick={() => handleMarkRead(notification.id)}>
                    Okundu
                  </button>
                ) : (
                  <span className="read-state">Okundu</span>
                )}
              </div>
            </article>
          );
        })}
        {!isLoading && filteredNotifications.length === 0 ? <p className="empty-state">Bu filtrede bildirim yok.</p> : null}
      </section>
    </div>
  );
}

