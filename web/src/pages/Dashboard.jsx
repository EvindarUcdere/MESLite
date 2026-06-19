import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ArrowRight, Award, Bell, CheckCircle2, Factory, Flame, Gauge, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
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

const SCRAP_DISPOSITION_LABELS = {
  PENDING_REVIEW: "İnceleme Bekliyor",
  REWORK: "Yeniden İşlenecek",
  SCRAP: "Hurda",
  REPRODUCE: "Yeniden Üretilecek",
  CONDITIONAL_ACCEPT: "Şartlı Kabul"
};

const ALERT_STATUS_LABELS = {
  OPEN: "Yeni",
  IN_REVIEW: "İnceleniyor",
  RESOLVED: "Çözüldü"
};

const SCRAP_PRIORITY_LABELS = {
  CRITICAL: "Aksiyon Gerekli",
  WARNING: "Takip",
  INFO: "Bilgi"
};

const SCRAP_ACTION_STATUS_LABELS = {
  PENDING: "Aksiyon Bekliyor",
  CREATED: "Aksiyon Oluştu",
  NOT_REQUIRED: "Aksiyon Gerekmiyor"
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

function CockpitCard({ card, isLoading }) {
  const Icon = card.icon;

  return (
    <Link className={`cockpit-card cockpit-${card.tone}`} to={card.to}>
      <span className="cockpit-icon">
        <Icon size={20} />
      </span>
      <span className="cockpit-label">{card.label}</span>
      <strong>{isLoading ? "..." : card.value}</strong>
      <small>{card.hint}</small>
    </Link>
  );
}

function EmptyDashboardVisual({ icon: Icon = Award, text }) {
  return (
    <div className="dashboard-empty-visual">
      <span>
        <Icon size={54} strokeWidth={1.5} />
      </span>
      <p>{text}</p>
    </div>
  );
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
  const scrapTrackingQueue = live?.scrapTrackingQueue ?? [];

  const cockpitCards = [
    {
      label: "Aktif İş Emri",
      value: summary?.activeWorkOrders ?? 0,
      hint: `${summary?.pausedWorkOrders ?? 0} duraklatıldı`,
      tone: "teal",
      icon: Activity,
      to: "/reports#work-order-status"
    },
    {
      label: "Geciken İş",
      value: summary?.overdueWorkOrders ?? overdueWorkOrders.length,
      hint: "Plan bitişi geçenler",
      tone: "red",
      icon: Gauge,
      to: "/reports#delayed-operations"
    },
    {
      label: "Kalite Bekleyen",
      value: pendingQualityOperations.length,
      hint: "Sonuç bekleyen kalite adımı",
      tone: "green",
      icon: ShieldCheck,
      to: "/reports#quality-results"
    },
    {
      label: "Kritik Uyarı",
      value: summary?.criticalAlerts ?? criticalAlerts.length,
      hint: `${summary?.openAlerts ?? openAlerts.length} açık uyarı`,
      tone: "amber",
      icon: AlertTriangle,
      to: "/alerts"
    },
    {
      label: "Bugünkü Üretim",
      value: summary?.todayProducedQuantity ?? 0,
      hint: "Son adımdan çıkan bitmiş ürün",
      tone: "blue",
      icon: PackageCheck,
      to: "/reports#daily-production-trend"
    },
    {
      label: "Makine İşlem Adedi",
      value: summary?.todayProcessProducedQuantity ?? 0,
      hint: "Bugün girilen operasyon kayıtları",
      tone: "violet",
      icon: Factory,
      to: "/reports#machine-performance-detail"
    },
    {
      label: "Fire Oranı",
      value: `${summary?.todayScrapRate ?? 0}%`,
      hint: `${summary?.todayFinalScrapQuantity ?? 0} final fire / ${summary?.todayScrapQuantity ?? 0} proses firesi`,
      tone: "green",
      icon: Flame,
      to: "/reports#scrap-reasons"
    },
    {
      label: "Çalışan Makine",
      value: summary?.runningMachines ?? 0,
      hint: `${summary?.stoppedMachines ?? 0} duruş/bakım`,
      tone: "teal",
      icon: Factory,
      to: "/reports#machine-status"
    }
  ];

  const productionChartData = [
    {
      name: "Bugün",
      produced: summary?.todayProducedQuantity ?? 0,
      scrap: summary?.todayScrapQuantity ?? 0
    },
    {
      name: "Makine İşlem",
      produced: summary?.todayProcessProducedQuantity ?? 0,
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
  const machineStatusTotal = machineStatusData.reduce((total, item) => total + item.value, 0);
  const workOrderStatusTotal = workOrderStatusData.reduce((total, item) => total + item.value, 0);
  const qualityStatusTotal = qualityStatusData.reduce((total, item) => total + item.value, 0);

  return (
    <div className="page-stack dashboard-page">
      <header className="page-header dashboard-header">
        <div>
          <span className="dashboard-eyebrow">Üretim Kokpiti</span>
          <h1>MES Lite Admin</h1>
          <p>Hoş geldiniz, üretim akışını buradan takip edebilirsiniz.</p>
        </div>
        <div className="dashboard-header-actions">
          <div className="live-indicator">
            <span />
            {lastUpdatedAt ? `Canlı - ${lastUpdatedAt.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : "Canlı bağlantı"}
          </div>
          <button className="secondary-action" type="button" onClick={() => loadDashboard({ showLoading: true })} disabled={isLoading}>
            <RefreshCw size={16} />
            Yenile
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="cockpit-grid">
        {cockpitCards.map((card) => (
          <CockpitCard card={card} isLoading={isLoading} key={card.label} />
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
              İş emirleri <ArrowRight size={15} />
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
              Kalite <ArrowRight size={15} />
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
            {!isLoading && pendingQualityOperations.length === 0 ? <EmptyDashboardVisual icon={Award} text="Kalite bekleyen operasyon yok." /> : null}
          </div>
        </article>
      </section>

      <section className="panel scrap-queue-panel">
        <div className="section-title-row">
          <div>
            <h2>{"Fire Takip Kuyru\u011fu"}</h2>
            <p className="muted-text">{"Hurda, yeniden \u00fcretim ve onar\u0131m kararlar\u0131 teslim plan\u0131n\u0131 etkilemeden takip edilir."}</p>
          </div>
          <div className="scrap-queue-summary">
            <span>{scrapTrackingQueue.filter((item) => item.priority === "CRITICAL").length} aksiyon</span>
            <strong>{scrapTrackingQueue.length} {"kay\u0131t"}</strong>
          </div>
        </div>
        <div className="scrap-queue-list">
          {scrapTrackingQueue.slice(0, 6).map((item) => (
            <Link
              className={`scrap-queue-item scrap-priority-${item.priority.toLowerCase()}`}
              key={item.id}
              to={item.scrapActionWorkOrderId ? `/work-orders?workOrderId=${item.scrapActionWorkOrderId}` : `/work-orders?workOrderId=${item.workOrderId ?? ""}`}
            >
              <div className="scrap-queue-main">
                <div>
                  <strong>{item.orderNo}</strong>
                  <span>{item.productCode ? `${item.productCode} - ${item.productName}` : item.productName}</span>
                </div>
                <div className="scrap-queue-badges">
                  <span className={`scrap-priority-badge scrap-priority-badge-${item.priority.toLowerCase()}`}>{SCRAP_PRIORITY_LABELS[item.priority] ?? item.priority}</span>
                  <span className={`scrap-action-badge scrap-action-${(item.scrapActionStatus ?? "PENDING").toLowerCase()}`}>{SCRAP_ACTION_STATUS_LABELS[item.scrapActionStatus] ?? item.scrapActionStatus}</span>
                  <span className="reason-chip">{SCRAP_DISPOSITION_LABELS[item.scrapDisposition] ?? item.scrapDisposition}</span>
                  <span className="reason-chip">{SCRAP_REASON_LABELS[item.scrapReason] ?? item.scrapReason}</span>
                </div>
              </div>
              <div className="scrap-queue-metrics">
                <span>
                  <small>Plan</small>
                  <strong>{item.plannedQuantity}</strong>
                </span>
                <span>
                  <small>{"Sa\u011flam"}</small>
                  <strong>{item.producedQuantity}</strong>
                </span>
                <span>
                  <small>Fire</small>
                  <strong>{item.logScrapQuantity}</strong>
                </span>
                <span>
                  <small>Eksik</small>
                  <strong>{item.missingQuantity}</strong>
                </span>
                <span>
                  <small>{"\u00c7\u00f6z\u00fcm"}</small>
                  <strong>{item.scrapResolutionQuantity}</strong>
                </span>
              </div>
              <div className="scrap-queue-meta">
                <span>{item.operationName ?? "Operasyon belirtilmemi\u015f"}</span>
                <span>{item.machineCode ? `${item.machineCode} - ${item.machineName}` : "Makine yok"}</span>
                <span>{item.operatorName ?? "Operat\u00f6r yok"}</span>
                <span>{formatDateShort(item.createdAt)}</span>
                {item.scrapActionWorkOrderNo ? <span>{item.scrapActionWorkOrderNo}</span> : null}
              </div>
              <div className={`scrap-evidence-strip ${item.hasVisualEvidence ? "has-evidence" : "no-evidence"}`}>
                <div>
                  <small>Görsel Kanıt</small>
                  <strong>{item.hasVisualEvidence ? `${item.attachments.length} fotoğraf eklendi` : "Fotoğraf eklenmemiş"}</strong>
                  <span>{item.hasVisualEvidence ? "Kalite kararı için operatörün eklediği saha görseli incelenebilir." : "Karar yalnızca fire nedeni ve operatör notuna göre verilecek."}</span>
                </div>
                {item.hasVisualEvidence ? (
                  <div className="scrap-evidence-thumbs">
                    {item.attachments.slice(0, 3).map((attachment) => (
                      <button
                        key={attachment.id}
                        type="button"
                        className="scrap-evidence-thumb"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          window.open(getAttachmentUrl(attachment), "_blank", "noopener,noreferrer");
                        }}
                      >
                        <img src={getAttachmentUrl(attachment)} alt={attachment.fileName || "Fire görsel kanıtı"} />
                        <span>{attachment.fileName || "Görseli aç"}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="scrap-action-flow">
                <div className="scrap-action-source">
                  <small>Kaynak fire</small>
                  <strong>{item.orderNo}</strong>
                  <span>
                    {item.logScrapQuantity} adet fire / {SCRAP_DISPOSITION_LABELS[item.scrapDisposition] ?? item.scrapDisposition}
                  </span>
                </div>
                <div className="scrap-action-arrow">→</div>
                <div className="scrap-action-target">
                  <small>Telafi / rework iş emri</small>
                  {item.scrapActionWorkOrder ? (
                    <>
                      <div className="scrap-action-target-head">
                        <strong>{item.scrapActionWorkOrder.orderNo}</strong>
                        <span>{STATUS_LABELS[item.scrapActionWorkOrder.status] ?? item.scrapActionWorkOrder.status}</span>
                      </div>
                      <div className="scrap-action-progress">
                        <span style={{ width: `${item.scrapActionWorkOrder.progressPercent ?? 0}%` }} />
                      </div>
                      <p>
                        {item.scrapActionWorkOrder.producedQuantity}/{item.scrapActionWorkOrder.plannedQuantity} adet tamamlandı,
                        {" "}
                        {item.scrapActionWorkOrder.remainingQuantity} adet kaldı.
                      </p>
                      <p>
                        {item.scrapActionWorkOrder.currentOperationName ?? "Operasyon bekliyor"} ·{" "}
                        {item.scrapActionWorkOrder.responsibleOperatorName ?? "Operatör atanmamış"}
                      </p>
                    </>
                  ) : (
                    <p>{item.scrapActionStatus === "NOT_REQUIRED" ? "Bu fire için ek iş emri gerekmiyor." : "Telafi iş emri henüz oluşmadı."}</p>
                  )}
                </div>
              </div>
              {item.scrapDispositionNote || item.scrapActionNote ? (
                <p className="scrap-queue-note">{[item.scrapDispositionNote, item.scrapActionNote].filter(Boolean).join(" / ")}</p>
              ) : null}
            </Link>
          ))}
          {!isLoading && scrapTrackingQueue.length === 0 ? <p className="empty-state">{"Takip bekleyen fire kayd\u0131 yok."}</p> : null}
        </div>
      </section>

      <section className="panel dashboard-signal-panel">
        <div className="section-title-row">
          <div>
            <h2>Saha Sinyalleri</h2>
            <p className="muted-text">Son 24 saatte operatörden gelen notlar ve açık uyarılar.</p>
          </div>
          <div className="link-group">
            <Link className="text-link" to="/alerts">
              Uyarılar <ArrowRight size={15} />
            </Link>
            <Link className="text-link" to="/field-notes">
              Tüm notlar <ArrowRight size={15} />
            </Link>
          </div>
        </div>
        <div className="dashboard-signal-grid">
          <article className="signal-summary-card">
            <Bell size={34} strokeWidth={1.5} />
            <span>Açık uyarı</span>
            <strong>{isLoading ? "..." : openAlerts.length}</strong>
            <small>{criticalAlerts.length} kritik</small>
          </article>
          <article className="signal-summary-card signal-success-card">
            <CheckCircle2 size={34} strokeWidth={1.5} />
            <span>Son İşlemler</span>
            <strong>{isLoading ? "..." : live?.recentProductionLogs?.length ?? 0}</strong>
            <small>Bugünkü saha kayıtları</small>
          </article>
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
        </div>
      </section>

      <section className="operations-grid dashboard-chart-grid">
        <article className="panel chart-panel">
          <div className="chart-card-header">
            <div>
              <h2>Üretim ve Fire</h2>
              <p>Bugünkü bitmiş ürün, proses kaydı ve toplam fire karşılaştırması.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={productionChartData}>
              <CartesianGrid stroke="#edf1f5" vertical={false} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="produced" name="Üretim" fill="#0f766e" radius={[6, 6, 0, 0]} />
              <Bar dataKey="scrap" name="Fire" fill="#ef4444" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="panel chart-panel donut-panel">
          <div className="chart-card-header">
            <div>
              <h2>Makine Durumları</h2>
              <p>Canlı makine parkı çalışma özeti.</p>
            </div>
          </div>
          {machineStatusData.length ? (
            <div className="donut-chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={machineStatusData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={92} paddingAngle={4}>
                    {machineStatusData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center-label">
                <strong>{machineStatusTotal}</strong>
                <span>Toplam</span>
              </div>
            </div>
          ) : (
            <p className="empty-state">Makine durum verisi yok.</p>
          )}
        </article>
        <article className="panel chart-panel donut-panel">
          <div className="chart-card-header">
            <div>
              <h2>İş Emri Durumları</h2>
              <p>Planlanan, üretimde, duraklatılan ve tamamlanan işler.</p>
            </div>
          </div>
          {workOrderStatusData.length ? (
            <div className="donut-chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={workOrderStatusData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={92} paddingAngle={4}>
                    {workOrderStatusData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center-label">
                <strong>{workOrderStatusTotal}</strong>
                <span>Toplam</span>
              </div>
            </div>
          ) : (
            <p className="empty-state">İş emri durum verisi yok.</p>
          )}
        </article>
        <article className="panel chart-panel donut-panel">
          <div className="chart-card-header">
            <div>
              <h2>Kalite Sonuçları</h2>
              <p>Geçti, kısmi kabul ve red dağılımı.</p>
            </div>
          </div>
          {qualityStatusData.length ? (
            <div className="donut-chart-wrap">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={qualityStatusData} dataKey="value" nameKey="name" innerRadius={64} outerRadius={92} paddingAngle={4}>
                    {qualityStatusData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? "#64748b"} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center-label">
                <strong>{qualityStatusTotal}</strong>
                <span>Toplam</span>
              </div>
            </div>
          ) : (
            <p className="empty-state">Kalite sonucu verisi yok.</p>
          )}
        </article>
      </section>

      <section className="operations-grid dashboard-list-grid">
        <article className="panel dashboard-list-panel">
          <div className="chart-card-header">
            <div>
              <h2>Makineler</h2>
              <p>Makine parkının anlık saha durumu.</p>
            </div>
          </div>
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
        <article className="panel dashboard-list-panel">
          <div className="chart-card-header">
            <div>
              <h2>Aktif İş Emirleri</h2>
              <p>Sahada devam eden işlerin ilerleme yüzdesi.</p>
            </div>
          </div>
          <div className="status-list">
            {activeWorkOrders.slice(0, 8).map((workOrder) => (
              <div key={workOrder.id} className="status-row status-row-progress">
                <div>
                  <strong>{workOrder.orderNo}</strong>
                  <span>{workOrder.product.name}</span>
                </div>
                <div className="mini-progress-cell">
                  <span>{workOrder.progressPercent}%</span>
                  <div className="mini-progress-track">
                    <i style={{ width: `${Math.min(workOrder.progressPercent ?? 0, 100)}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {!isLoading && activeWorkOrders.length === 0 ? <p className="empty-state">Aktif iş emri yok.</p> : null}
          </div>
        </article>
      </section>

      <section className="panel production-log-panel">
        <div className="chart-card-header">
          <div>
            <h2>Son Üretim Kayıtları</h2>
            <p>Operatörlerin sahadan girdiği son üretim, fire, görsel ve not kayıtları.</p>
          </div>
          <span className="record-count">{live?.recentProductionLogs?.length ?? 0} kayıt</span>
        </div>
        <div className="table-wrap dashboard-table-wrap">
          <table className="dashboard-data-table">
            <thead>
              <tr>
                <th>İş Emri</th>
                <th>Ürün</th>
                <th>Makine</th>
                <th>Operatör</th>
                <th>Üretim</th>
                <th>Fire</th>
                <th>Fire Nedeni</th>
                <th>Fire Kararı</th>
                <th>Görsel</th>
                <th>Not</th>
              </tr>
            </thead>
            <tbody>
              {(live?.recentProductionLogs ?? []).map((log) => (
                <tr key={log.id}>
                  <td>
                    <strong className="table-primary">{log.workOrder.orderNo}</strong>
                  </td>
                  <td>
                    <span className="table-secondary">{log.workOrder.product.name}</span>
                  </td>
                  <td>
                    <span className="machine-code-chip">{log.machine.code}</span>
                  </td>
                  <td>{log.operator.name}</td>
                  <td>
                    <span className="quantity-chip quantity-produced">+{log.producedQuantity}</span>
                  </td>
                  <td>
                    <span className={`quantity-chip ${log.scrapQuantity > 0 ? "quantity-scrap" : "quantity-zero"}`}>{log.scrapQuantity}</span>
                  </td>
                  <td>{log.scrapQuantity > 0 ? <span className="reason-chip">{SCRAP_REASON_LABELS[log.scrapReason ?? "UNKNOWN"] ?? log.scrapReason}</span> : "-"}</td>
                  <td>
                    {log.scrapQuantity > 0 ? (
                      <span className="reason-chip">
                        {SCRAP_DISPOSITION_LABELS[log.scrapDisposition ?? "PENDING_REVIEW"] ?? log.scrapDisposition}
                        {log.scrapResolutionQuantity > 0 ? ` (${log.scrapResolutionQuantity})` : ""}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>
                    {log.attachments?.[0] ? (
                      <a className="image-proof-link" href={getAttachmentUrl(log.attachments[0])} target="_blank" rel="noreferrer">
                        <img className="table-thumb" src={getAttachmentUrl(log.attachments[0])} alt="Üretim görseli" />
                        Aç
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
                  <td colSpan="10">Henüz üretim kaydı yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
