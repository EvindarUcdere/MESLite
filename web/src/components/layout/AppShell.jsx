import { BarChart3, ClipboardList, LogOut } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/authStore.js";

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
          <span>{user?.role ?? "USER"}</span>
        </div>
        <nav>
          <NavLink to="/" end>
            <BarChart3 size={18} />
            Dashboard
          </NavLink>
          <NavLink to="/work-orders">
            <ClipboardList size={18} />
            Work Orders
          </NavLink>
        </nav>
        <button className="logout-button" type="button" onClick={handleLogout}>
          <LogOut size={18} />
          Sign out
        </button>
      </aside>
      <section className="content-shell">
        <Outlet />
      </section>
    </main>
  );
}
