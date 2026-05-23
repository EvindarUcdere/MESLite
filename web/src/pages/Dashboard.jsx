import { LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboardSummary, getLiveOverview } from "../api/dashboard.api.js";
import { useAuthStore } from "../store/authStore.js";

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const [summary, setSummary] = useState(null);
  const [live, setLive] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      try {
        const [summaryData, liveData] = await Promise.all([getDashboardSummary(), getLiveOverview()]);

        if (isMounted) {
          setSummary(summaryData);
          setLive(liveData);
        }
      } catch (_error) {
        if (isMounted) {
          setError("Dashboard data could not be loaded.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleLogout() {
    clearSession();
    navigate("/login");
  }

  const cards = [
    ["Active Orders", summary?.activeWorkOrders ?? 0],
    ["Today Produced", summary?.todayProducedQuantity ?? 0],
    ["Today Scrap Rate", `${summary?.todayScrapRate ?? 0}%`],
    ["Running Machines", summary?.runningMachines ?? 0]
  ];

  return (
    <main className="dashboard-page">
      <header>
        <div>
          <h1>MES Lite Dashboard</h1>
          <p>{user?.name ?? "Production overview"}</p>
        </div>
        <button className="icon-button" type="button" onClick={handleLogout} aria-label="Sign out" title="Sign out">
          <LogOut size={18} />
        </button>
      </header>
      {error ? <p className="form-error">{error}</p> : null}
      <section className="summary-grid">
        {cards.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{isLoading ? "..." : value}</strong>
          </article>
        ))}
      </section>
      <section className="operations-grid">
        <article className="panel">
          <h2>Machines</h2>
          <div className="status-list">
            {(live?.machines ?? []).map((machine) => (
              <div key={machine.id} className="status-row">
                <div>
                  <strong>{machine.code}</strong>
                  <span>{machine.name}</span>
                </div>
                <span className={`status-pill status-${machine.status.toLowerCase()}`}>{machine.status}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <h2>Active Work Orders</h2>
          <div className="status-list">
            {(live?.activeWorkOrders ?? []).map((workOrder) => (
              <div key={workOrder.id} className="status-row">
                <div>
                  <strong>{workOrder.orderNo}</strong>
                  <span>{workOrder.product.name}</span>
                </div>
                <span>{workOrder.progressPercent}%</span>
              </div>
            ))}
            {!isLoading && (live?.activeWorkOrders ?? []).length === 0 ? <p className="empty-state">No active work orders.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}
