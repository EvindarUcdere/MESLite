import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

const SCRAP_REASON_LABELS = {
  MATERIAL_DEFECT: "Malzeme Hatası",
  MACHINE_SETUP: "Makine Ayarı",
  OPERATOR_ERROR: "Operatör Hatası",
  PROCESS_DEVIATION: "Proses Sapması",
  QUALITY_REJECT: "Kalite Reddi",
  OTHER: "Diğer",
  UNKNOWN: "Belirtilmemiş"
};

const ALERT_STATUS_LABELS = {
  OPEN: "Yeni",
  IN_REVIEW: "İnceleniyor",
  RESOLVED: "Çözüldü"
};

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");

function mapCountsToChartData(counts = {}) {
  return Object.entries(counts).map(([status, value]) => ({
    status,
    name: STATUS_LABELS[status] ?? status,
    value
  }));
}

function getAttachmentUrl(attachment) {
  if (!attachment?.fileUrl) {
    return "";
  }

  return `${API_ORIGIN}${attachment.fileUrl}`;
}

function formatTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDateShort(value) {
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

function isWorkOrderOverdue(workOrder) {
  return Boolean(workOrder?.plannedEndDate && new Date(workOrder.plannedEndDate) < new Date() && !["COMPLETED", "CANCELLED"].includes(workOrder.status));
}

function getMachineLabel(machine) {
  if (!machine) {
    return "-";
  }

  return `${machine.code} - ${machine.name}`;
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
    "workOrderOperation:updated": () => loadDashboard(),
    "operationMessage:created": () => loadDashboard(),
    "production:logged": () => loadDashboard(),
    "productionAlert:created": () => loadDashboard(),
    "productionAlert:updated": () => loadDashboard(),
    "quality:checked": () => loadDashboard()
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      loadDashboard({ showLoading: false });
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, []);

  const activeWorkOrders = live?.activeWorkOrders ?? [];
  const openAlerts = live?.openAlerts ?? [];
  const operatorNotes = live?.operatorNotes ?? [];
  const pendingQualityOperations = live?.pendingQualityOperations ?? [];
  const overdueWorkOrders = activeWorkOrders.filter(isWorkOrderOverdue);
  const pausedWorkOrders = activeWorkOrders.filter((workOrder) => workOrder.status === "PAUSED");
  const criticalAlerts = openAlerts.filter((alert) => alert.severity === "CRITICAL");
  const priorityWorkOrders = [...overdueWorkOrders, ...pausedWorkOrders.filter((workOrder) => !overdueWorkOrders.some((item) => item.id === workOrder.id))].slice(0, 5);
  const latestOperatorNotes = operatorNotes.slice(0, 4);
  const latestOpenAlerts = openAlerts.slice(0, 4);

  const cockpitCards = [
    {
      label: "Aktif İş Emri",
      value: summary?.activeWorkOrders ?? 0,
      hint: `${summary?.pausedWorkOrders ?? 0} duraklatıldı`,
      tone: "neutral",
      to: "/work-orders"
    },
    {
      label: "Geciken İş",
      value: summary?.overdueWorkOrders ?? overdueWorkOrders.length,
      hint: "Plan bitişi geçenler",
      tone: (summary?.overdueWorkOrders ?? overdueWorkOrders.length) > 0 ? "danger" : "good",
      to: "/work-orders"
    },
    {
      label: "Kalite Bekleyen",
      value: pendingQualityOperations.length,
      hint: "Sonuç bekleyen kalite adımı",
      tone: pendingQualityOperations.length > 0 ? "warning" : "good",
      to: "/quality"
    },
    {
      label: "Kritik Uyarı",
      value: summary?.criticalAlerts ?? criticalAlerts.length,
      hint: `${summary?.openAlerts ?? openAlerts.length} açık uyarı`,
      tone: (summary?.criticalAlerts ?? criticalAlerts.length) > 0 ? "danger" : "good",
      to: "/alerts"
    },
    {
      label: "Bugünkü Üretim",
      value: summary?.todayProducedQuantity ?? 0,
      hint: `${summary?.todayScrapQuantity ?? 0} fire`,
      tone: "neutral",
      to: "/reports"
    },
    {
      label: "Fire Orani",
      value: `${summary?.todayScrapRate ?? 0}%`,
      hint: "Bugünkü üretime göre",
      tone: (summary?.todayScrapRate ?? 0) > 5 ? "warning" : "good",
      to: "/reports"
    },
    {
      label: "Çalışan Makine",
      value: summary?.runningMachines ?? 0,
      hint: `${summary?.stoppedMachines ?? 0} duruş/bakım`,
      tone: "neutral",
      to: "/machines"
    }
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
    <div className="page-stack dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <h1>Üretim Kokpiti</h1>
          <p>{user?.name ?? "Canlı üretim genel görünümü"}</p>
        </div>
        <div className="dashboard-header-actions">
          <div className="live-indicator">
            <span />
            {lastUpdatedAt ? `Canlı - ${lastUpdatedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Canlı bağlantı"}
          </div>
          <button className="secondary-action" type="button" onClick={() => loadDashboard({ showLoading: true })} disabled={isLoading}>
            Yenile
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="cockpit-grid">
        {cockpitCards.map((card) => (
          <Link className={`cockpit-card cockpit-${card.tone}`} key={card.label} to={card.to}>
            <span>{card.label}</span>
            <strong>{isLoading ? "..." : card.value}</strong>
            <small>{card.hint}</small>
          </Link>
        ))}
      </section>

      <section className="dashboard-action-grid">
        <article className="panel action-panel">
          <div className="section-title-row">
            <div>
              <h2>Müdahale Kuyruğu</h2>
              <p className="muted-text">Geciken veya duraklayan işler önce ele alınmalı.</p>
            </div>
            <Link className="text-link" to="/work-orders">
              İş emirleri
            </Link>
          </div>
          <div className="priority-list">
            {priorityWorkOrders.map((workOrder) => (
              <Link className="priority-row" key={workOrder.id} to="/work-orders">
                <div>
                  <strong>{workOrder.orderNo}</strong>
                  <span>{workOrder.product.name}</span>
                </div>
                <div>
                  <span className={`status-pill status-${workOrder.status.toLowerCase().replace("_", "-")}`}>{STATUS_LABELS[workOrder.status] ?? workOrder.status}</span>
                  <small>{workOrder.plannedEndDate ? formatDateShort(workOrder.plannedEndDate) : `${workOrder.progressPercent}%`}</small>
                </div>
              </Link>
            ))}
            {!isLoading && priorityWorkOrders.length === 0 ? <p className="empty-state">Müdahale gerektiren iş yok.</p> : null}
          </div>
        </article>

        <article className="panel action-panel">
          <div className="section-title-row">
            <div>
              <h2>Kalite Bekleyenler</h2>
              <p className="muted-text">Üretim tamamlanmış, kalite sonucu bekleyen operasyonlar.</p>
            </div>
            <Link className="text-link" to="/quality">
              Kalite
            </Link>
          </div>
          <div className="priority-list">
            {pendingQualityOperations.slice(0, 5).map((operation) => (
              <Link className="priority-row" key={operation.id} to="/quality">
                <div>
                  <strong>{operation.workOrder.orderNo}</strong>
                  <span>
                    {operation.sequenceNo}. {operation.operationName}
                  </span>
                </div>
                <div>
                  <span>{operation.producedQuantity} adet</span>
                  <small>{getMachineLabel(operation.machine)}</small>
                </div>
              </Link>
            ))}
            {!isLoading && pendingQualityOperations.length === 0 ? <p className="empty-state">Kalite bekleyen operasyon yok.</p> : null}
          </div>
        </article>
      </section>

      <section className="panel dashboard-signal-panel">
        <div className="section-title-row">
          <div>
            <h2>Saha Sinyalleri</h2>
            <p className="muted-text">Son 24 saatte operatörden gelen notlar ve açık uyarılar.</p>
          </div>
          <div className="link-group">
            <Link className="text-link" to="/alerts">
              Uyarılar
            </Link>
            <Link className="text-link" to="/field-notes">
              Tüm notlar
            </Link>
          </div>
        </div>
        <div className="dashboard-signal-grid">
          <article className="signal-summary-card">
            <span>Açık uyarı</span>
            <strong>{isLoading ? "..." : openAlerts.length}</strong>
            <small>{criticalAlerts.length} kritik</small>
          </article>
          <div className="compact-feed">
            <h3>Son Uyarılar</h3>
            {latestOpenAlerts.map((alert) => (
              <div key={alert.id} className="compact-feed-row">
                <span className={`severity-dot severity-${alert.severity.toLowerCase()}`} />
                <div>
                  <strong>{alert.workOrder.orderNo}</strong>
                  <p>
                    {alert.productionLog?.machine?.code ?? "-"} - {alert.message}
                  </p>
                </div>
                <small>{ALERT_STATUS_LABELS[alert.status] ?? alert.status}</small>
              </div>
            ))}
            {!isLoading && latestOpenAlerts.length === 0 ? <p className="empty-state">Açık uyarı yok.</p> : null}
          </div>
          <div className="compact-feed">
            <h3>Son Operatör Notları</h3>
            {latestOperatorNotes.map((log) => (
              <div key={log.id} className="compact-feed-row">
                <span className="note-dot" />
                <div>
                  <strong>{log.workOrder.orderNo}</strong>
                  <p>
                    {log.machine.code} - {log.note}
                  </p>
                </div>
                <small>{formatTime(log.createdAt)}</small>
              </div>
            ))}
            {!isLoading && latestOperatorNotes.length === 0 ? <p className="empty-state">Henüz operatör notu yok.</p> : null}
          </div>
        </div>
      </section>

      <section className="operations-grid dashboard-chart-grid">
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
      </section>

      <section className="operations-grid dashboard-list-grid">
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
            {activeWorkOrders.slice(0, 8).map((workOrder) => (
              <div key={workOrder.id} className="status-row">
                <div>
                  <strong>{workOrder.orderNo}</strong>
                  <span>{workOrder.product.name}</span>
                </div>
                <span>{workOrder.progressPercent}%</span>
              </div>
            ))}
            {!isLoading && activeWorkOrders.length === 0 ? <p className="empty-state">Aktif iş emri yok.</p> : null}
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
                <th>Fire Nedeni</th>
                <th>Görsel</th>
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
                  <td>{log.scrapQuantity > 0 ? SCRAP_REASON_LABELS[log.scrapReason ?? "UNKNOWN"] ?? log.scrapReason : "-"}</td>
                  <td>
                    {log.attachments?.[0] ? (
                      <a href={getAttachmentUrl(log.attachments[0])} target="_blank" rel="noreferrer">
                        <img className="table-thumb" src={getAttachmentUrl(log.attachments[0])} alt="Üretim görseli" />
                      </a>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{log.note ? <span className="note-chip">{log.note}</span> : "-"}</td>
                </tr>
              ))}
              {!isLoading && (live?.recentProductionLogs ?? []).length === 0 ? (
                <tr>
                  <td colSpan="9">Henüz üretim kaydı yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
