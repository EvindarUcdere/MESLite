import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDashboardSummary, getLiveOverview } from "../api/dashboard.api.js";
import { useAuthStore } from "../store/authStore.js";

const STATUS_COLORS = {
  PLANNED: "#64748b",
  IN_PROGRESS: "#256f6c",
  PAUSED: "#d97706",
  COMPLETED: "#2563eb",
  CANCELLED: "#dc2626",
  IDLE: "#64748b",
  RUNNING: "#16a34a",
  STOPPED: "#d97706",
  MAINTENANCE: "#7c3aed",
  PASSED: "#16a34a",
  PARTIAL: "#d97706",
  FAILED: "#dc2626"
};

function mapCountsToChartData(counts = {}) {
  return Object.entries(counts).map(([name, value]) => ({ name, value }));
}

export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
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

  const cards = [
    ["Active Orders", summary?.activeWorkOrders ?? 0],
    ["Today Produced", summary?.todayProducedQuantity ?? 0],
    ["Today Scrap Rate", `${summary?.todayScrapRate ?? 0}%`],
    ["Running Machines", summary?.runningMachines ?? 0]
  ];
  const productionChartData = [
    {
      name: "Today",
      produced: summary?.todayProducedQuantity ?? 0,
      scrap: summary?.todayScrapQuantity ?? 0
    },
    {
      name: "Total",
      produced: summary?.producedQuantity ?? 0,
      scrap: summary?.scrapQuantity ?? 0
    }
  ];
  const machineStatusData = mapCountsToChartData(summary?.machineStatusCounts);
  const workOrderStatusData = mapCountsToChartData(summary?.workOrderStatusCounts);
  const qualityStatusData = mapCountsToChartData(summary?.qualityStatusCounts);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>MES Lite Dashboard</h1>
          <p>{user?.name ?? "Production overview"}</p>
        </div>
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
        <article className="panel chart-panel">
          <h2>Production vs Scrap</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={productionChartData}>
              <CartesianGrid stroke="#edf1f5" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="produced" name="Produced" fill="#256f6c" radius={[4, 4, 0, 0]} />
              <Bar dataKey="scrap" name="Scrap" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="panel chart-panel">
          <h2>Machine Status</h2>
          {machineStatusData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={machineStatusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {machineStatusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">No machine status data.</p>
          )}
        </article>
        <article className="panel chart-panel">
          <h2>Work Order Status</h2>
          {workOrderStatusData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={workOrderStatusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {workOrderStatusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">No work order status data.</p>
          )}
        </article>
        <article className="panel chart-panel">
          <h2>Quality Results</h2>
          {qualityStatusData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={qualityStatusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {qualityStatusData.map((entry) => (
                    <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">No quality result data.</p>
          )}
        </article>
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
      <section className="panel">
        <h2>Recent Production Logs</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Work Order</th>
                <th>Product</th>
                <th>Machine</th>
                <th>Operator</th>
                <th>Produced</th>
                <th>Scrap</th>
              </tr>
            </thead>
            <tbody>
              {(live?.recentProductionLogs ?? []).map((log) => (
                <tr key={log.id}>
                  <td>{log.workOrder.orderNo}</td>
                  <td>{log.workOrder.product.name}</td>
                  <td>{log.machine.code}</td>
                  <td>{log.operator.name}</td>
                  <td>{log.producedQuantity}</td>
                  <td>{log.scrapQuantity}</td>
                </tr>
              ))}
              {!isLoading && (live?.recentProductionLogs ?? []).length === 0 ? (
                <tr>
                  <td colSpan="6">No production logs yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
