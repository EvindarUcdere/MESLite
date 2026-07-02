import { Activity, AlertTriangle, BarChart3, Bell, Boxes, CalendarDays, ClipboardCheck, ClipboardList, Cpu, FileBarChart, GitBranch, History, LogOut, MessageSquareText, PackageSearch, ShoppingCart, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { getNotifications } from "../../api/notifications.api.js";
import { useSocket } from "../../hooks/useSocket.js";
import { useAuthStore } from "../../store/authStore.js";
import { hasRole, ROLE_GROUPS, ROLE_LABELS } from "../../utils/roles.js";

function getDashboardLabel(role) {
  if (role === "ADMIN") {
    return "Yönetim Paneli";
  }

  if (role === "PLANNER") {
    return "Planlama Paneli";
  }

  if (role === "QUALITY_STAFF") {
    return "Kalite Paneli";
  }

  return "Üretim Paneli";
}

const WORKSPACE_LABELS = {
  management: "Yönetim Alanı",
  production: "Üretim Alanı",
  quality: "Kalite Alanı",
  system: "Sistem Alanı"
};

function getWorkspace(pathname, role) {
  if (["/users", "/audit-logs", "/event-logs"].some((path) => pathname.startsWith(path))) {
    return "system";
  }

  if (["/quality", "/alerts"].some((path) => pathname.startsWith(path))) {
    return "quality";
  }

  if (["/work-orders", "/sales-orders", "/shift-planning", "/field-notes", "/inventory", "/routes", "/products", "/machines"].some((path) => pathname.startsWith(path))) {
    return "production";
  }

  if (role === "QUALITY_STAFF") {
    return "quality";
  }

  if (role === "PLANNER" || role === "OPERATOR") {
    return "production";
  }

  return "management";
}

const navigationItems = [
  {
    to: "/",
    end: true,
    label: (user) => getDashboardLabel(user?.role),
    icon: BarChart3,
    roles: ROLE_GROUPS.dashboard
  },
  {
    to: "/work-orders",
    label: "İş Emirleri",
    icon: ClipboardList,
    roles: ROLE_GROUPS.planningWork
  },
  {
    to: "/sales-orders",
    label: "Satış & MRP",
    icon: ShoppingCart,
    roles: ROLE_GROUPS.planningWork
  },
  {
    to: "/shift-planning",
    label: "Vardiya Planı",
    icon: CalendarDays,
    roles: ROLE_GROUPS.shiftPlanningWork
  },
  {
    to: "/alerts",
    label: "Uyarılar",
    icon: AlertTriangle,
    roles: ROLE_GROUPS.operationsAndQuality
  },
  {
    to: "/field-notes",
    label: "Saha Notları",
    icon: MessageSquareText,
    roles: ROLE_GROUPS.operationsAndQuality
  },
  {
    to: "/quality",
    label: "Kalite",
    icon: ClipboardCheck,
    roles: ROLE_GROUPS.qualityWork
  },
  {
    to: "/inventory",
    label: "Stok",
    icon: PackageSearch,
    roles: ROLE_GROUPS.masterData
  },
  {
    to: "/routes",
    label: "Rotalar",
    icon: GitBranch,
    roles: ROLE_GROUPS.masterData
  },
  {
    to: "/products",
    label: "Ürünler",
    icon: Boxes,
    roles: ROLE_GROUPS.masterData
  },
  {
    to: "/machines",
    label: "Makineler",
    icon: Cpu,
    roles: ROLE_GROUPS.masterData
  },
  {
    to: "/notifications",
    label: "Bildirimler",
    icon: Bell,
    roles: ROLE_GROUPS.allAuthenticated
  },
  {
    to: "/reports",
    label: "Raporlar",
    icon: FileBarChart,
    roles: ROLE_GROUPS.reports
  },
  {
    to: "/audit-logs",
    label: "İşlem Geçmişi",
    icon: History,
    roles: ROLE_GROUPS.reports
  },
  {
    to: "/event-logs",
    label: "Sistem Olayları",
    icon: Activity,
    roles: ROLE_GROUPS.reports
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
  const workspace = getWorkspace(location.pathname, user?.role);

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
    <main className="app-shell" data-workspace={workspace}>
      <aside className="sidebar">
        <div className="brand">
          <strong>MES Lite</strong>
          <span>{ROLE_LABELS[user?.role] ?? "Kullanıcı"}</span>
          <em>{WORKSPACE_LABELS[workspace]}</em>
        </div>
        <nav>
          {navigationItems
            .filter((item) => hasRole(user, item.roles))
            .map((item) => {
              const Icon = item.icon;
              const label = typeof item.label === "function" ? item.label(user) : item.label;

              return (
                <NavLink key={item.to} to={item.to} end={item.end}>
                  <Icon size={18} />
                  <span className="sidebar-link-label">{label}</span>
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
