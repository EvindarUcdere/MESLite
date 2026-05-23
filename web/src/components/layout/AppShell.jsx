import { BarChart3, Boxes, ClipboardCheck, ClipboardList, Cpu, LogOut, Users } from "lucide-react";
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
            Üretim Paneli
          </NavLink>
          <NavLink to="/work-orders">
            <ClipboardList size={18} />
            İş Emirleri
          </NavLink>
          <NavLink to="/products">
            <Boxes size={18} />
            Ürünler
          </NavLink>
          <NavLink to="/machines">
            <Cpu size={18} />
            Makineler
          </NavLink>
          <NavLink to="/quality">
            <ClipboardCheck size={18} />
            Kalite
          </NavLink>
          <NavLink to="/users">
            <Users size={18} />
            Kullanıcılar
          </NavLink>
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
