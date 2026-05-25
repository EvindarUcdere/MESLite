import { BarChart3, Boxes, ClipboardCheck, ClipboardList, Cpu, FileBarChart, LogOut, Users } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore.js";
import { hasRole, ROLE_GROUPS, ROLE_LABELS } from "../../utils/roles.js";

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
    to: "/users",
    label: "Kullanıcılar",
    icon: Users,
    roles: ROLE_GROUPS.adminOnly
  }
];

export function AppShell() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

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
                  {item.label}
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
