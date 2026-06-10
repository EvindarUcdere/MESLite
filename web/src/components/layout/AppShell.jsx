import { AlertTriangle, BarChart3, Bell, Boxes, CalendarDays, ClipboardCheck, ClipboardList, Cpu, FileBarChart, GitBranch, History, LogOut, MessageSquareText, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getNotifications } from "../../api/notifications.api.js";
import { useSocket } from "../../hooks/useSocket.js";
import { useAuthStore } from "../../store/authStore.js";
import { hasRole, ROLES, ROLE_GROUPS, ROLE_LABELS } from "../../utils/roles.js";

const navigationItems = [
  {
    to: "/",
    end: true,
    label: "Üretim Paneli",
    icon: BarChart3,
    roles: [...ROLE_GROUPS.management, ...ROLE_GROUPS.production, ...ROLE_GROUPS.quality]
  },
  {
    to: "/work-orders",
    label: "İş Emirleri",
    icon: ClipboardList,
    roles: ROLE_GROUPS.planning
  },
  {
    to: "/notifications",
    label: "Bildirimler",
    icon: Bell,
    roles: [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER, ROLES.OPERATOR, ROLES.QUALITY_STAFF, ROLES.VIEWER]
  },
  {
    to: "/routes",
    label: "Rotalar",
    icon: GitBranch,
    roles: ROLE_GROUPS.planning
  },
  {
    to: "/shift-planning",
    label: "Vardiya Planı",
    icon: CalendarDays,
    roles: ROLE_GROUPS.planning
  },
  {
    to: "/alerts",
    label: "Uyarılar",
    icon: AlertTriangle,
    roles: ROLE_GROUPS.managementPlusQuality
  },
  {
    to: "/field-notes",
    label: "Saha Notları",
    icon: MessageSquareText,
    roles: ROLE_GROUPS.managementPlusQuality
  },
  {
    to: "/products",
    label: "Ürünler",
    icon: Boxes,
    roles: ROLE_GROUPS.planning
  },
  {
    to: "/machines",
    label: "Makineler",
    icon: Cpu,
    roles: ROLE_GROUPS.planning
  },
  {
    to: "/quality",
    label: "Kalite",
    icon: ClipboardCheck,
    roles: ROLE_GROUPS.quality
  },
  {
    to: "/reports",
    label: "Raporlar",
    icon: FileBarChart,
    roles: ROLE_GROUPS.management
  },
  {
    to: "/audit-logs",
    label: "İşlem Geçmişi",
    icon: History,
    roles: ROLE_GROUPS.management
  },
  {
    to: "/users",
    label: "Kullanıcılar",
    icon: Users,
    roles: ROLE_GROUPS.adminOnly
  }
];

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  async function loadUnreadNotificationCount() {
    try {
      const response = await getNotifications({ unreadOnly: true, limit: 1 });
      setUnreadNotificationCount(response.meta.unreadCount ?? response.data.length);
    } catch (_error) {
      setUnreadNotificationCount(0);
    }
  }

  useEffect(() => {
    if (!user) {
      setUnreadNotificationCount(0);
      return;
    }

    loadUnreadNotificationCount();
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      loadUnreadNotificationCount();
    }
  }, [location.pathname, user?.id]);

  useEffect(() => {
    function handleUnreadCountChanged(event) {
      setUnreadNotificationCount(Number(event.detail?.unreadCount ?? 0));
    }

    window.addEventListener("mes-lite:notifications-unread-changed", handleUnreadCountChanged);
    return () => window.removeEventListener("mes-lite:notifications-unread-changed", handleUnreadCountChanged);
  }, []);

  useSocket({
    "notification:created": (notification) => {
      if (notification.recipientId === user?.id) {
        setUnreadNotificationCount((current) => current + 1);
      }
    }
  });

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>MES Lite</strong>
          <span>{ROLE_LABELS[user?.role] ?? "Kullanıcı"}</span>
        </div>
        <nav>
          {navigationItems
            .filter((item) => hasRole(user, item.roles))
            .map((item) => {
              const Icon = item.icon;

              return (
                <NavLink key={item.to} to={item.to} end={item.end}>
                  <Icon size={18} />
                  <span className="sidebar-link-label">{item.label}</span>
                  {item.to === "/notifications" && unreadNotificationCount > 0 ? (
                    <span className="sidebar-notification-badge">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>
                  ) : null}
                </NavLink>
              );
            })}
        </nav>
        <button className="logout-button" type="button" onClick={handleLogout}>
          <LogOut size={18} />
          Çıkış Yap
        </button>
      </aside>
      <section className="content-shell">
        <Outlet />
      </section>
    </main>
  );
}
