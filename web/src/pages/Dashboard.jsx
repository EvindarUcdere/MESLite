import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getDashboardSummary, getLiveOverview } from "../api/dashboard.api.js";
import { useSocket } from "../hooks/useSocket.js";
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

const STATUS_LABELS = {
  PLANNED: "Planlandı",
  IN_PROGRESS: "Üretimde",
  PAUSED: "Duraklatıldı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal",
  IDLE: "Boşta",
  RUNNING: "Çalışıyor",
  STOPPED: "Duruşta",
  MAINTENANCE: "Bakımda",
  PASSED: "Geçti",
  PARTIAL: "Kısmi",
  FAILED: "Kaldı"
};

function mapCountsToChartData(counts = {}) {
  return Object.entries(counts).map(([status, value]) => ({
    status,
    name: STATUS_LABELS[status] ?? status,
    value
  }));
}

export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [summary, setSummary] = useState(null);
  const [live, setLive] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  async function loadDashboard({ showLoading = false } = {}) {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const [summaryData, liveData] = await Promise.all([getDashboardSummary(), getLiveOverview()]);

      setSummary(summaryData);
      setLive(liveData);
      setLastUpdatedAt(new Date());
      setError("");
    } catch (_error) {
      setError("Panel verileri yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialDashboard() {
      try {
        const [summaryData, liveData] = await Promise.all([getDashboardSummary(), getLiveOverview()]);

        if (isMounted) {
          setSummary(summaryData);
          setLive(liveData);
          setLastUpdatedAt(new Date());
        }
      } catch (_error) {
        if (isMounted) {
          setError("Panel verileri yüklenemedi.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialDashboard();

    return () => {
      isMounted = false;
    };
  }, []);

  useSocket({
    "machine:statusChanged": () => loadDashboard(),
    "workOrder:updated": () => loadDashboard(),
    "production:logged": () => loadDashboard(),
    "quality:checked": () => loadDashboard()
  });

  const cards = [
    ["Aktif İş Emirleri", summary?.activeWorkOrders ?? 0],
    ["Bugünkü Üretim", summary?.todayProducedQuantity ?? 0],
    ["Bugünkü Fire Oranı", `${summary?.todayScrapRate ?? 0}%`],
    ["Çalışan Makineler", summary?.runningMachines ?? 0]
  ];
  const productionChartData = [
    {
      name: "Bugün",
      produced: summary?.todayProducedQuantity ?? 0,
      scrap: summary?.todayScrapQuantity ?? 0
    },
    {
      name: "Toplam",
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
          <h1>Üretim Paneli</h1>
          <p>{user?.name ?? "Üretim genel görünümü"}</p>
        </div>
        <div className="live-indicator">
          <span />
          {lastUpdatedAt ? `Canlı - ${lastUpdatedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Canlı bağlantı"}
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
          <h2>Üretim ve Fire</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={productionChartData}>
              <CartesianGrid stroke="#edf1f5" vertical={false} />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="produced" name="Üretim" fill="#256f6c" radius={[4, 4, 0, 0]} />
              <Bar dataKey="scrap" name="Fire" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="panel chart-panel">
          <h2>Makine Durumları</h2>
          {machineStatusData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={machineStatusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {machineStatusData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">Makine durum verisi yok.</p>
          )}
        </article>
        <article className="panel chart-panel">
          <h2>İş Emri Durumları</h2>
          {workOrderStatusData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={workOrderStatusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {workOrderStatusData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">İş emri durum verisi yok.</p>
          )}
        </article>
        <article className="panel chart-panel">
          <h2>Kalite Sonuçları</h2>
          {qualityStatusData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={qualityStatusData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {qualityStatusData.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">Kalite sonucu verisi yok.</p>
          )}
        </article>
        <article className="panel">
          <h2>Makineler</h2>
          <div className="status-list">
            {(live?.machines ?? []).map((machine) => (
              <div key={machine.id} className="status-row">
                <div>
                  <strong>{machine.code}</strong>
                  <span>{machine.name}</span>
                </div>
                <span className={`status-pill status-${machine.status.toLowerCase()}`}>{STATUS_LABELS[machine.status] ?? machine.status}</span>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <h2>Aktif İş Emirleri</h2>
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
            {!isLoading && (live?.activeWorkOrders ?? []).length === 0 ? <p className="empty-state">Aktif iş emri yok.</p> : null}
          </div>
        </article>
      </section>
      <section className="panel">
        <h2>Son Üretim Kayıtları</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>İş Emri</th>
                <th>Ürün</th>
                <th>Makine</th>
                <th>Operatör</th>
                <th>Üretim</th>
                <th>Fire</th>
                <th>Not</th>
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
                  <td>{log.note ? <span className="note-chip">{log.note}</span> : "-"}</td>
                </tr>
              ))}
              {!isLoading && (live?.recentProductionLogs ?? []).length === 0 ? (
                <tr>
                  <td colSpan="7">Henüz üretim kaydı yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
