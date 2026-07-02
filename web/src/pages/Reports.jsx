import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Download,
  Factory,
  FileText,
  Filter,
  Gauge,
  Layers,
  Recycle,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getMachines, getProducts, getUsers } from "../api/masterData.api.js";
import { getProductRoutes } from "../api/productRoutes.api.js";
import { getOverviewReport } from "../api/reports.api.js";
import { getShifts } from "../api/shiftPlanning.api.js";

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

const SCRAP_REASON_COLORS = {
  MATERIAL_DEFECT: "#dc2626",
  MACHINE_SETUP: "#d97706",
  OPERATOR_ERROR: "#7c3aed",
  PROCESS_DEVIATION: "#2563eb",
  QUALITY_REJECT: "#be123c",
  OTHER: "#64748b",
  UNKNOWN: "#94a3b8"
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

const DOWNTIME_REASON_LABELS = {
  MACHINE_FAILURE: "Makine Arızası",
  MATERIAL_WAITING: "Malzeme Bekleniyor",
  QUALITY_WAITING: "Kalite Bekleniyor",
  MAINTENANCE: "Bakım",
  SETUP: "Ayar/Setup",
  OPERATOR_BREAK: "Mola",
  OTHER: "Diğer",
  UNKNOWN: "Belirtilmemiş"
};

const DOWNTIME_REASON_COLORS = ["#dc2626", "#d97706", "#2563eb", "#7c3aed", "#be123c", "#64748b", "#94a3b8"];

const QUALITY_DECISION_LABELS = {
  REWORK_OPERATION: "Geri İşleme",
  SCRAP: "Hurda",
  CONDITIONAL_ACCEPT: "Şartlı Kabul",
  UNKNOWN: "Karar Yok"
};

const QUALITY_DECISION_COLORS = {
  REWORK_OPERATION: "#2563eb",
  SCRAP: "#dc2626",
  CONDITIONAL_ACCEPT: "#d97706",
  UNKNOWN: "#94a3b8"
};

function mapCountsToChartData(counts = {}) {
  return Object.entries(counts).map(([status, value]) => ({
    status,
    name: STATUS_LABELS[status] ?? SCRAP_REASON_LABELS[status] ?? DOWNTIME_REASON_LABELS[status] ?? QUALITY_DECISION_LABELS[status] ?? status,
    value
  }));
}

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

function getDefaultReportFilters() {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);

  return {
    from: toDateInputValue(from),
    to: toDateInputValue(to),
    productId: "",
    machineId: "",
    shiftId: "",
    operatorId: "",
    routeId: "",
    status: ""
  };
}

const REPORT_PERIOD_PRESETS = [
  { label: "1 Ay", months: 1 },
  { label: "3 Ay", months: 3 },
  { label: "6 Ay", months: 6 },
  { label: "9 Ay", months: 9 },
  { label: "12 Ay", months: 12 }
];

const WORK_ORDER_STATUS_OPTIONS = [
  { value: "PLANNED", label: "Planlandı" },
  { value: "IN_PROGRESS", label: "Üretimde" },
  { value: "PAUSED", label: "Duraklatıldı" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "CANCELLED", label: "İptal" }
];

function getPresetRange(months) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(1);
  from.setMonth(from.getMonth() - months + 1);

  return {
    from: toDateInputValue(from),
    to: toDateInputValue(to)
  };
}

function ReasonBarList({ data, emptyText, getColor }) {
  const maxValue = Math.max(...data.map((item) => item.value), 0);
  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  if (!data.length) {
    return <p className="empty-state">{emptyText}</p>;
  }

  return (
    <div className="reason-bar-list">
      {data.slice(0, 6).map((item, index) => {
        const width = maxValue ? Math.max((item.value / maxValue) * 100, 6) : 0;
        const rate = totalValue ? ((item.value / totalValue) * 100).toFixed(1) : "0.0";

        return (
          <div className="reason-bar-row" key={`${item.status}-${item.name}`}>
            <div className="reason-bar-label">
              <span>{item.name}</span>
              <strong>{rate}%</strong>
            </div>
            <div className="reason-bar-track">
              <span style={{ width: `${width}%`, background: getColor(item, index) }} />
            </div>
            <small>{item.value} kayıt</small>
          </div>
        );
      })}
    </div>
  );
}

function ReportDetailSection({ id, title, description, count, children }) {
  return (
    <details id={id} className="report-detail-panel">
      <summary>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className="report-section-count">{count} kayıt</span>
      </summary>
      {children}
    </details>
  );
}

function QualityDecisionBadge({ decision }) {
  return <span className={`report-badge decision-${decision?.toLowerCase?.().replaceAll("_", "-") ?? "unknown"}`}>{QUALITY_DECISION_LABELS[decision] ?? decision}</span>;
}

function MachineBadge({ children }) {
  if (!children || children === "-") {
    return "-";
  }

  return <span className="report-machine-badge">{children}</span>;
}

function NumberBadge({ children, tone = "neutral" }) {
  return <span className={`report-number-badge report-number-${tone}`}>{children}</span>;
}

function ReasonChips({ counts, labels }) {
  const entries = Object.entries(counts ?? {});

  if (!entries.length) {
    return "-";
  }

  return (
    <span className="report-reason-chip-list">
      {entries.map(([reason, count]) => (
        <span key={reason} className="report-reason-chip">
          {labels[reason] ?? reason}: {count}
        </span>
      ))}
    </span>
  );
}

export default function Reports() {
  const location = useLocation();
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(getDefaultReportFilters);
  const [filterOptions, setFilterOptions] = useState({
    products: [],
    machines: [],
    shifts: [],
    operators: [],
    routes: []
  });

  useEffect(() => {
    let isMounted = true;

    async function loadFilterOptions() {
      try {
        const [products, machines, shifts, users, routes] = await Promise.all([
          getProducts(),
          getMachines(),
          getShifts(),
          getUsers(),
          getProductRoutes()
        ]);

        if (isMounted) {
          setFilterOptions({
            products,
            machines,
            shifts,
            operators: users.filter((user) => user.role === "OPERATOR" && user.isActive),
            routes
          });
        }
      } catch (_error) {
        if (isMounted) {
          setFilterOptions({ products: [], machines: [], shifts: [], operators: [], routes: [] });
        }
      }
    }

    loadFilterOptions();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadReport() {
      setIsLoading(true);
      setError("");

      try {
        const data = await getOverviewReport(filters);

        if (isMounted) {
          setReport(data);
        }
      } catch (_error) {
        if (isMounted) {
          setError("Rapor verileri yüklenemedi.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadReport();

    return () => {
      isMounted = false;
    };
  }, [filters]);

  useEffect(() => {
    if (isLoading || !location.hash) {
      return undefined;
    }

    const targetId = decodeURIComponent(location.hash.slice(1));
    const timeoutId = window.setTimeout(() => {
      const target = document.getElementById(targetId);

      if (!target) {
        return;
      }

      if (target.tagName.toLowerCase() === "details") {
        target.setAttribute("open", "");
      }

      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [isLoading, location.hash, report]);

  const summary = report?.summary ?? {};
  const summaryCards = [
    ["İş Emri", summary.workOrderCount ?? 0],
    ["Üretim Kaydı", summary.productionLogCount ?? 0],
    ["Planlanan Adet", summary.plannedQuantity ?? 0],
    ["Toplam Üretim", summary.producedQuantity ?? 0],
    ["Plan Gerçekleşme", `${summary.planCompletionRate ?? 0}%`],
    ["Kalan Üretim", summary.productionGapQuantity ?? 0],
    ["OEE", `${summary.oee ?? 0}%`],
    ["Kullanılabilirlik", `${summary.availability ?? 0}%`],
    ["Performans", `${summary.performance ?? 0}%`],
    ["Kalite", `${summary.quality ?? 0}%`],
    ["Fire Oranı", `${summary.scrapRate ?? 0}%`],
    ["Kalite Kontrol", summary.qualityCheckCount ?? 0],
    ["Hatalı Adet", summary.defectQuantity ?? 0],
    ["Kalite Kararı", summary.qualityDecisionCount ?? 0],
    ["Geri İşleme", summary.qualityReworkCount ?? 0],
    ["Hurda Kararı", summary.qualityScrapDecisionCount ?? 0],
    ["Şartlı Kabul", summary.qualityConditionalAcceptCount ?? 0]
  ];
  const oeeValue = summary.oee ?? 0;
  const reportMetricCards = [
    { label: "İş Emri", value: summary.workOrderCount ?? 0, icon: FileText },
    { label: "Üretim Kaydı", value: summary.productionLogCount ?? 0, icon: ClipboardList },
    { label: "Makine", value: summary.machineCount ?? 0, icon: Factory },
    { label: "Kalan Üretim", value: summary.productionGapQuantity ?? 0, icon: Gauge },
    { label: "Kalite Kararı", value: summary.qualityDecisionCount ?? 0, icon: ShieldCheck },
    { label: "Geri İşleme", value: summary.qualityReworkCount ?? 0, icon: Recycle },
    { label: "Hurda Kararı", value: summary.qualityScrapDecisionCount ?? 0, icon: Trash2 },
    { label: "Şartlı Kabul", value: summary.qualityConditionalAcceptCount ?? 0, icon: CheckCircle2 }
  ];
  const reportUpdatedAt = new Date().toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
  const workOrderStatusData = mapCountsToChartData(report?.workOrderStatusCounts);
  const machineStatusData = mapCountsToChartData(report?.machineStatusCounts);
  const qualityStatusData = mapCountsToChartData(report?.qualityStatusCounts);
  const qualityDecisionData = mapCountsToChartData(report?.qualityDecisionCounts);
  const qualityDecisionByOperation = report?.qualityDecisionByOperation ?? [];
  const qualityDecisionByMachine = report?.qualityDecisionByMachine ?? [];
  const recentQualityDecisions = report?.recentQualityDecisions ?? [];
  const machinePerformanceData = report?.machinePerformance ?? [];
  const productPerformanceData = report?.productPerformance ?? [];
  const shiftPerformanceData = report?.shiftPerformance ?? [];
  const operatorShiftPerformanceData = report?.operatorShiftPerformance ?? [];
  const machineShiftPerformanceData = report?.machineShiftPerformance ?? [];
  const scrapReasonData = mapCountsToChartData(report?.scrapReasonCounts);
  const operationDowntimeReasonData = mapCountsToChartData(report?.operationDowntimeReasonCounts);
  const operationDowntimeByShift = report?.operationDowntimeByShift ?? [];
  const operationDowntimeByMachine = report?.operationDowntimeByMachine ?? [];
  const operationDowntimeByOperation = report?.operationDowntimeByOperation ?? [];
  const delayedOperations = report?.delayedOperations ?? [];
  const operationTimeByMachine = report?.operationTimeByMachine ?? [];
  const operationTimeByOperator = report?.operationTimeByOperator ?? [];
  const operatorPerformance = report?.operatorPerformance ?? [];
  const productionTrendData = report?.productionTrend ?? [];
  const planActualData = report?.planActualPerformance ?? [];
  const oeeSummary = report?.oeeSummary ?? {};
  const oeeByMachineData = report?.oeeByMachine ?? [];
  const oeeByOperationData = report?.oeeByOperation ?? [];
  const oeeComponentData = [
    { name: "Kullanılabilirlik", value: oeeSummary.availability ?? 0 },
    { name: "Performans", value: oeeSummary.performance ?? 0 },
    { name: "Kalite", value: oeeSummary.quality ?? 0 },
    { name: "OEE", value: oeeSummary.oee ?? 0 }
  ];
  const oeeRingStyle = {
    background: `conic-gradient(#087f7b ${Math.min(oeeValue, 100) * 3.6}deg, #edf2f5 0deg)`
  };
  const managementInsights = report?.managementInsights ?? [];
  const machineDowntimeReasonData = Object.entries(report?.machineDowntimeReasonCounts ?? {}).map(([reason, value]) => ({
    status: reason,
    name: reason === "UNKNOWN" ? "Belirtilmemiş" : reason,
    value
  }));
  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };
  const clearReportFilters = () => {
    setFilters(getDefaultReportFilters());
  };

  return (
    <div className="page-stack">
      <header className="report-dashboard-header">
        <div className="report-topline">
        <div className="report-page-title">
          <h1>Raporlar</h1>
          <p>Üretim performansınızı özetleyin</p>
        </div>
          <button type="button" className="secondary-button report-download-button" onClick={() => window.print()}>
            <Download size={16} />
            Raporu İndir
          </button>
        </div>
        <div className="report-filter-bar">
          <div className="period-preset-row" aria-label="Hazır rapor dönemleri">
            {REPORT_PERIOD_PRESETS.map((preset) => (
              <button key={preset.months} type="button" onClick={() => setFilters((current) => ({ ...current, ...getPresetRange(preset.months) }))}>
                {preset.label}
              </button>
            ))}
          </div>
          <label>
            Başlangıç
            <input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
          </label>
          <label>
            Bitiş
            <input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
          </label>
          <label>
            Ürün
            <select value={filters.productId} onChange={(event) => updateFilter("productId", event.target.value)}>
              <option value="">Tüm ürünler</option>
              {filterOptions.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code} - {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Makine
            <select value={filters.machineId} onChange={(event) => updateFilter("machineId", event.target.value)}>
              <option value="">Tüm makineler</option>
              {filterOptions.machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.code} - {machine.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Vardiya
            <select value={filters.shiftId} onChange={(event) => updateFilter("shiftId", event.target.value)}>
              <option value="">Tüm vardiyalar</option>
              {filterOptions.shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name} ({shift.startTime}-{shift.endTime})
                </option>
              ))}
            </select>
          </label>
          <label>
            Operatör
            <select value={filters.operatorId} onChange={(event) => updateFilter("operatorId", event.target.value)}>
              <option value="">Tüm operatörler</option>
              {filterOptions.operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rota
            <select value={filters.routeId} onChange={(event) => updateFilter("routeId", event.target.value)}>
              <option value="">Tüm rotalar</option>
              {filterOptions.routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.product?.code ? `${route.product.code} - ` : ""}
                  {route.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Durum
            <select value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              <option value="">Tüm durumlar</option>
              {WORK_ORDER_STATUS_OPTIONS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="report-filter-submit" onClick={() => setFilters((current) => ({ ...current }))}>
            <Filter size={16} />
            Filtrele
          </button>
          <button type="button" className="secondary-button report-clear-button" onClick={clearReportFilters}>
            Temizle
          </button>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="report-kpi-grid">
        <article className="report-kpi-card report-oee-card">
          <div className="report-card-heading">
            <span>OEE</span>
          </div>
          <div className="report-oee-main">
            <strong>{isLoading ? "..." : `${oeeValue}%`}</strong>
            <div className="report-oee-ring" style={oeeRingStyle} aria-label={`OEE ${oeeValue}%`}>
              <span>{isLoading ? "..." : `${Math.round(oeeValue)}%`}</span>
            </div>
          </div>
          <div className="report-oee-track">
            <span style={{ width: `${Math.min(oeeValue, 100)}%` }} />
          </div>
          <div className="report-oee-foot">
            <small>Hedef: 85%</small>
            <small className={oeeValue >= 85 ? "positive" : "warning"}>{oeeValue >= 85 ? "Hedef üstü" : "İyileştirme gerekli"}</small>
          </div>
        </article>

        <article className="report-kpi-card">
          <div className="report-card-heading">
            <Layers size={18} />
            <span>Üretim</span>
          </div>
          <dl>
            <div>
              <dt>Toplam Üretim</dt>
              <dd>{isLoading ? "..." : summary.producedQuantity ?? 0}</dd>
            </div>
            <div>
              <dt>Planlanan Adet</dt>
              <dd>{isLoading ? "..." : summary.plannedQuantity ?? 0}</dd>
            </div>
            <div>
              <dt>Plan Gerçekleşme</dt>
              <dd>{isLoading ? "..." : `${summary.planCompletionRate ?? 0}%`}</dd>
            </div>
          </dl>
        </article>

        <article className="report-kpi-card">
          <div className="report-card-heading">
            <ArrowUpRight size={18} />
            <span>Verimlilik</span>
          </div>
          <dl>
            <div>
              <dt>Performans</dt>
              <dd>{isLoading ? "..." : `${summary.performance ?? 0}%`}</dd>
            </div>
            <div>
              <dt>Kullanılabilirlik</dt>
              <dd>{isLoading ? "..." : `${summary.availability ?? 0}%`}</dd>
            </div>
            <div>
              <dt>Kalite Performansı</dt>
              <dd>{isLoading ? "..." : `${summary.quality ?? 0}%`}</dd>
            </div>
          </dl>
        </article>

        <article className="report-kpi-card">
          <div className="report-card-heading">
            <ShieldCheck size={18} />
            <span>Kalite</span>
          </div>
          <dl>
            <div>
              <dt>Kalite</dt>
              <dd>{isLoading ? "..." : `${summary.quality ?? 0}%`}</dd>
            </div>
            <div>
              <dt>Fire Oranı</dt>
              <dd className="danger-text">{isLoading ? "..." : `${summary.scrapRate ?? 0}%`}</dd>
            </div>
            <div>
              <dt>Hatalı Adet</dt>
              <dd className="danger-text">{isLoading ? "..." : summary.defectQuantity ?? 0}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="report-metric-strip">
        {reportMetricCards.map(({ label, value, icon: Icon }) => (
          <article key={label}>
            <Icon size={18} />
            <div>
              <span>{label}</span>
              <strong>{isLoading ? "..." : value}</strong>
            </div>
          </article>
        ))}
      </section>

      <section id="management-insights" className="report-insight-grid">
        {managementInsights.length ? (
          managementInsights.map((insight) => (
            <article key={`${insight.type}-${insight.title}`} className={`report-insight-card insight-${insight.severity.toLowerCase()}`}>
              <span>{insight.severity === "CRITICAL" ? "Kritik" : insight.severity === "WARNING" ? "Uyarı" : "Bilgi"}</span>
              <strong>{insight.title}</strong>
              <p>{insight.message}</p>
            </article>
          ))
        ) : (
          <article className="report-insight-card">
            <span>Bilgi</span>
            <strong>Seçili dönem için risk sinyali yok</strong>
            <p>Üretim, fire, gecikme ve duruş verileri normal eşiklerin altında görünüyor.</p>
          </article>
        )}
      </section>

      <section className="operations-grid">
        <article className="panel oee-components-panel">
          <div className="panel-title-row">
            <h2>OEE Bileşenleri</h2>
            <span>Hedef 85%</span>
          </div>
          <div className="oee-component-list">
            {oeeComponentData.map((item) => {
              const tone = item.value >= 85 ? "good" : item.value >= 60 ? "warning" : "danger";

              return (
                <div key={item.name} className={`oee-component-row oee-${tone}`}>
                  <div className="oee-component-label">
                    <span>{item.name}</span>
                    <strong>{item.value}%</strong>
                  </div>
                  <div className="oee-component-track">
                    <span style={{ width: `${Math.min(item.value, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </article>

        <article className="panel">
          <h2>Makine Bazlı OEE</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Makine</th>
                  <th>Ad</th>
                  <th>OEE</th>
                  <th>Kullanılabilirlik</th>
                  <th>Performans</th>
                  <th>Kalite</th>
                  <th>Duruş</th>
                </tr>
              </thead>
              <tbody>
                {oeeByMachineData.slice(0, 10).map((item) => (
                  <tr key={item.machineId}>
                    <td><MachineBadge>{item.machineCode}</MachineBadge></td>
                    <td>{item.machineName}</td>
                    <td>{item.oee}%</td>
                    <td>{item.availability}%</td>
                    <td>{item.performance}%</td>
                    <td>{item.quality}%</td>
                    <td>{item.downtimeMinutes} dk</td>
                  </tr>
                ))}
                {!isLoading && oeeByMachineData.length === 0 ? (
                  <tr>
                    <td colSpan="7">Henüz OEE için yeterli makine verisi yok.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="panel">
        <h2>Operasyon Bazlı OEE</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Operasyon</th>
                <th>OEE</th>
                <th>Kullanılabilirlik</th>
                <th>Performans</th>
                <th>Kalite</th>
                <th>Operasyon</th>
                <th>Üretim</th>
                <th>Fire</th>
              </tr>
            </thead>
            <tbody>
              {oeeByOperationData.slice(0, 10).map((item) => (
                <tr key={item.operationKey}>
                  <td>{item.operationName}</td>
                  <td>{item.oee}%</td>
                  <td>{item.availability}%</td>
                  <td>{item.performance}%</td>
                  <td>{item.quality}%</td>
                  <td>{item.operationCount}</td>
                  <td>{item.producedQuantity}</td>
                  <td>{item.scrapQuantity}</td>
                </tr>
              ))}
              {!isLoading && oeeByOperationData.length === 0 ? (
                <tr>
                  <td colSpan="8">Henüz operasyon bazlı OEE verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="operations-grid report-chart-grid">
        <article id="plan-actual" className="panel chart-panel report-chart-card">
          <h2>Planlanan / Gerçekleşen Üretim</h2>
          {planActualData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={planActualData}>
                <CartesianGrid stroke="#edf1f5" vertical={false} />
                <XAxis dataKey="label" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="plannedQuantity" name="Planlanan" fill="#64748b" radius={[4, 4, 0, 0]} />
                <Bar dataKey="producedQuantity" name="Gerçekleşen" fill="#256f6c" radius={[4, 4, 0, 0]} />
                <Bar dataKey="gapQuantity" name="Kalan" fill="#d97706" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">Seçili dönemde plan/gerçekleşen verisi yok.</p>
          )}
        </article>

        <article className="panel">
          <h2>Aylık Plan Takibi</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dönem</th>
                  <th>İş Emri</th>
                  <th>Tamamlanan</th>
                  <th>Plan</th>
                  <th>Gerçekleşen</th>
                  <th>Kalan</th>
                  <th>Oran</th>
                </tr>
              </thead>
              <tbody>
                {planActualData.map((item) => (
                  <tr key={item.period}>
                    <td>{item.label}</td>
                    <td>{item.workOrderCount}</td>
                    <td>{item.completedWorkOrderCount}</td>
                    <td>{item.plannedQuantity}</td>
                    <td>{item.producedQuantity}</td>
                    <td>{item.gapQuantity}</td>
                    <td>{item.completionRate}%</td>
                  </tr>
                ))}
                {!isLoading && planActualData.length === 0 ? (
                  <tr>
                    <td colSpan="7">Henüz aylık plan verisi yok.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section id="daily-production-trend" className="panel chart-panel report-wide-chart">
        <h2>Günlük Üretim ve Fire Trendi</h2>
        {productionTrendData.length ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={productionTrendData}>
              <CartesianGrid stroke="#edf1f5" vertical={false} />
              <XAxis dataKey="date" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="producedQuantity" name="Üretim" stroke="#256f6c" strokeWidth={3} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="scrapQuantity" name="Fire" stroke="#dc2626" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="empty-state">Seçili tarih aralığında üretim kaydı yok.</p>
        )}
      </section>

      <section className="operations-grid">
        <article id="shift-performance" className="panel chart-panel report-chart-card">
          <h2>Vardiya Performansı</h2>
          {shiftPerformanceData.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={shiftPerformanceData}>
                <CartesianGrid stroke="#edf1f5" vertical={false} />
                <XAxis dataKey="shiftName" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="producedQuantity" name="Üretim" fill="#256f6c" radius={[4, 4, 0, 0]} />
                <Bar dataKey="scrapQuantity" name="Fire" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">Vardiya performans verisi yok.</p>
          )}
        </article>

        <article id="machine-performance" className="panel chart-panel report-chart-card">
          <h2>Makine Performansı</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={machinePerformanceData}>
              <CartesianGrid stroke="#edf1f5" vertical={false} />
              <XAxis dataKey="machineCode" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="producedQuantity" name="Üretim" fill="#256f6c" radius={[4, 4, 0, 0]} />
              <Bar dataKey="scrapQuantity" name="Fire" fill="#dc2626" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article id="product-performance" className="panel chart-panel report-chart-card">
          <h2>Ürün Performansı</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={productPerformanceData}>
              <CartesianGrid stroke="#edf1f5" vertical={false} />
              <XAxis dataKey="productCode" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="producedQuantity" name="Üretim" fill="#2563eb" radius={[4, 4, 0, 0]} />
              <Bar dataKey="scrapQuantity" name="Fire" fill="#d97706" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>

        <article id="work-order-status" className="panel chart-panel report-chart-card">
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

        <article id="quality-results" className="panel chart-panel report-chart-card">
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
            <p className="empty-state">Kalite verisi yok.</p>
          )}
        </article>

        <article className="panel chart-panel">
          <h2>Kalite Kararları</h2>
          {qualityDecisionData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={qualityDecisionData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {qualityDecisionData.map((entry) => (
                    <Cell key={entry.status} fill={QUALITY_DECISION_COLORS[entry.status] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">Kalite karar verisi yok.</p>
          )}
        </article>

        <article id="scrap-reasons" className="panel chart-panel report-chart-card">
          <h2>Fire Nedenleri</h2>
          <ReasonBarList
            data={scrapReasonData}
            emptyText="Fire nedeni verisi yok."
            getColor={(item) => SCRAP_REASON_COLORS[item.status] ?? "#64748b"}
          />
        </article>

        <article id="operation-downtime-reasons" className="panel chart-panel report-chart-card">
          <h2>Operasyon Duruş Nedenleri</h2>
          <ReasonBarList
            data={operationDowntimeReasonData}
            emptyText="Operasyon duruş nedeni verisi yok."
            getColor={(_item, index) => DOWNTIME_REASON_COLORS[index % DOWNTIME_REASON_COLORS.length]}
          />
        </article>

        <article id="machine-status" className="panel chart-panel report-chart-card">
          <h2>Makine Duruş Nedenleri</h2>
          <ReasonBarList
            data={machineDowntimeReasonData}
            emptyText="Makine duruş nedeni verisi yok."
            getColor={(_item, index) => DOWNTIME_REASON_COLORS[index % DOWNTIME_REASON_COLORS.length]}
          />
        </article>

        <article className="panel chart-panel report-chart-card">
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
      </section>

      <ReportDetailSection
        id="quality-decisions-by-operation"
        title="Operasyon Bazlı Kalite Kararları"
        description="Hangi iş emri ve operasyonlarda kalite kararı yoğunlaşıyor?"
        count={qualityDecisionByOperation.length}
        defaultOpen
      >
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>İş Emri</th>
                <th>Ürün</th>
                <th>Operasyon</th>
                <th>Makine</th>
                <th>Toplam</th>
                <th>Geri İşleme</th>
                <th>Hurda</th>
                <th>Şartlı Kabul</th>
                <th>Kritik</th>
              </tr>
            </thead>
            <tbody>
              {qualityDecisionByOperation.map((item) => (
                <tr key={item.operationId}>
                  <td>
                    <span className="report-order-link">{item.orderNo}</span>
                  </td>
                  <td>{item.productCode}</td>
                  <td>{item.operationName}</td>
                  <td><MachineBadge>{item.machineCode}</MachineBadge></td>
                  <td><NumberBadge>{item.totalCount}</NumberBadge></td>
                  <td><NumberBadge tone="info">{item.reworkCount}</NumberBadge></td>
                  <td><NumberBadge tone="danger">{item.scrapCount}</NumberBadge></td>
                  <td><NumberBadge tone="warning">{item.conditionalAcceptCount}</NumberBadge></td>
                  <td><NumberBadge tone={item.criticalCount > 0 ? "danger" : "neutral"}>{item.criticalCount}</NumberBadge></td>
                </tr>
              ))}
              {!isLoading && qualityDecisionByOperation.length === 0 ? (
                <tr>
                  <td colSpan="9">Henüz operasyon bazlı kalite karar verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection
        id="quality-decisions-by-machine"
        title="Makine Bazlı Kalite Kararları"
        description="Kalite kararlarının makine parkına göre dağılımını gösterir."
        count={qualityDecisionByMachine.length}
      >
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>Makine</th>
                <th>Ad</th>
                <th>Toplam</th>
                <th>Geri İşleme</th>
                <th>Hurda</th>
                <th>Şartlı Kabul</th>
                <th>Kritik</th>
              </tr>
            </thead>
            <tbody>
              {qualityDecisionByMachine.map((item) => (
                <tr key={item.machineId}>
                  <td><MachineBadge>{item.machineCode}</MachineBadge></td>
                  <td>{item.machineName}</td>
                  <td><NumberBadge>{item.totalCount}</NumberBadge></td>
                  <td><NumberBadge tone="info">{item.reworkCount}</NumberBadge></td>
                  <td><NumberBadge tone="danger">{item.scrapCount}</NumberBadge></td>
                  <td><NumberBadge tone="warning">{item.conditionalAcceptCount}</NumberBadge></td>
                  <td><NumberBadge tone={item.criticalCount > 0 ? "danger" : "neutral"}>{item.criticalCount}</NumberBadge></td>
                </tr>
              ))}
              {!isLoading && qualityDecisionByMachine.length === 0 ? (
                <tr>
                  <td colSpan="7">Henüz makine bazlı kalite karar verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection id="recent-quality-decisions" title="Son Kalite Kararları" description="Kalite ekibinin en son verdiği karar kayıtları." count={recentQualityDecisions.length}>
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>İş Emri</th>
                <th>Ürün</th>
                <th>Karar</th>
                <th>Operasyon</th>
                <th>Makine</th>
                <th>Operatör</th>
                <th>Not</th>
                <th>Zaman</th>
              </tr>
            </thead>
            <tbody>
              {recentQualityDecisions.map((item) => (
                <tr key={item.id}>
                  <td>
                    <span className="report-order-link">{item.orderNo}</span>
                  </td>
                  <td>{item.productCode}</td>
                  <td><QualityDecisionBadge decision={item.decision} /></td>
                  <td>{item.operationName}</td>
                  <td><MachineBadge>{item.machineCode}</MachineBadge></td>
                  <td>{item.operatorName}</td>
                  <td title={item.note ?? ""} className="report-truncate-cell">{item.note ?? "-"}</td>
                  <td>
                    {item.updatedAt
                      ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.updatedAt))
                      : "-"}
                  </td>
                </tr>
              ))}
              {!isLoading && recentQualityDecisions.length === 0 ? (
                <tr>
                  <td colSpan="8">Henüz kalite karar kaydı yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection id="shift-performance-detail" title="Vardiya Performans Detayı" description="Vardiya bazında üretim, fire, operatör ve makine yoğunluğu." count={shiftPerformanceData.length}>
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>Vardiya</th>
                <th>Saat</th>
                <th>Üretim</th>
                <th>Fire</th>
                <th>Fire Oranı</th>
                <th>Operatör</th>
                <th>Makine</th>
                <th>Üretim Girişi</th>
              </tr>
            </thead>
            <tbody>
              {shiftPerformanceData.map((shift) => (
                <tr key={shift.shiftId}>
                  <td>{shift.shiftName}</td>
                  <td>{shift.shiftTimeRange}</td>
                  <td><NumberBadge tone="success">{shift.producedQuantity}</NumberBadge></td>
                  <td><NumberBadge tone={shift.scrapQuantity > 0 ? "danger" : "neutral"}>{shift.scrapQuantity}</NumberBadge></td>
                  <td><NumberBadge tone={shift.scrapRate > 3 ? "warning" : "success"}>{shift.scrapRate}%</NumberBadge></td>
                  <td><NumberBadge>{shift.operatorCount}</NumberBadge></td>
                  <td><NumberBadge>{shift.machineCount}</NumberBadge></td>
                  <td><NumberBadge>{shift.logCount}</NumberBadge></td>
                </tr>
              ))}
              {!isLoading && shiftPerformanceData.length === 0 ? (
                <tr>
                  <td colSpan="8">Henüz vardiya performans verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection
        id="operator-shift-performance"
        title="Vardiya Bazlı Operatör Performansı"
        description="Operatör üretim ve fire sonuçlarını vardiya kırılımında gösterir."
        count={operatorShiftPerformanceData.length}
      >
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>Vardiya</th>
                <th>Operatör</th>
                <th>Üretim</th>
                <th>Fire</th>
                <th>Fire Oranı</th>
                <th>Üretim Girişi</th>
              </tr>
            </thead>
            <tbody>
              {operatorShiftPerformanceData.map((item) => (
                <tr key={`${item.shiftId}-${item.operatorId}`}>
                  <td>{item.shiftName}</td>
                  <td>{item.operatorName}</td>
                  <td><NumberBadge tone="success">{item.producedQuantity}</NumberBadge></td>
                  <td><NumberBadge tone={item.scrapQuantity > 0 ? "danger" : "neutral"}>{item.scrapQuantity}</NumberBadge></td>
                  <td><NumberBadge tone={item.scrapRate > 3 ? "warning" : "success"}>{item.scrapRate}%</NumberBadge></td>
                  <td><NumberBadge>{item.logCount}</NumberBadge></td>
                </tr>
              ))}
              {!isLoading && operatorShiftPerformanceData.length === 0 ? (
                <tr>
                  <td colSpan="6">Henüz vardiya bazlı operatör verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection
        id="machine-shift-performance"
        title="Vardiya Bazlı Makine Performansı"
        description="Makine üretim performansını vardiya bazında karşılaştırır."
        count={machineShiftPerformanceData.length}
      >
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>Vardiya</th>
                <th>Makine</th>
                <th>Ad</th>
                <th>Üretim</th>
                <th>Fire</th>
                <th>Fire Oranı</th>
                <th>Üretim Girişi</th>
              </tr>
            </thead>
            <tbody>
              {machineShiftPerformanceData.map((item) => (
                <tr key={`${item.shiftId}-${item.machineId}`}>
                  <td>{item.shiftName}</td>
                  <td><MachineBadge>{item.machineCode}</MachineBadge></td>
                  <td>{item.machineName}</td>
                  <td><NumberBadge tone="success">{item.producedQuantity}</NumberBadge></td>
                  <td><NumberBadge tone={item.scrapQuantity > 0 ? "danger" : "neutral"}>{item.scrapQuantity}</NumberBadge></td>
                  <td><NumberBadge tone={item.scrapRate > 3 ? "warning" : "success"}>{item.scrapRate}%</NumberBadge></td>
                  <td><NumberBadge>{item.logCount}</NumberBadge></td>
                </tr>
              ))}
              {!isLoading && machineShiftPerformanceData.length === 0 ? (
                <tr>
                  <td colSpan="7">Henüz vardiya bazlı makine verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection id="shift-downtime-analysis" title="Vardiya Bazlı Duruş Analizi" description="Duruş kayıtlarının vardiyalara göre yoğunlaştığı noktalar." count={operationDowntimeByShift.length}>
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>Vardiya</th>
                <th>Duruş Sayısı</th>
                <th>Nedenler</th>
              </tr>
            </thead>
            <tbody>
              {operationDowntimeByShift.map((item) => (
                <tr key={item.shiftId}>
                  <td>{item.shiftName}</td>
                  <td><NumberBadge tone={item.totalCount > 0 ? "warning" : "neutral"}>{item.totalCount}</NumberBadge></td>
                  <td><ReasonChips counts={item.reasonCounts} labels={DOWNTIME_REASON_LABELS} /></td>
                </tr>
              ))}
              {!isLoading && operationDowntimeByShift.length === 0 ? (
                <tr>
                  <td colSpan="3">Henüz vardiya bazlı duruş verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection id="machine-downtime-analysis" title="Makine Bazlı Duruş Analizi" description="Hangi makinelerde hangi duruş nedenleri öne çıkıyor?" count={operationDowntimeByMachine.length}>
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>Makine</th>
                <th>Ad</th>
                <th>Duruş Sayısı</th>
                <th>Nedenler</th>
              </tr>
            </thead>
            <tbody>
              {operationDowntimeByMachine.map((item) => (
                <tr key={item.machineId}>
                  <td><MachineBadge>{item.machineCode}</MachineBadge></td>
                  <td>{item.machineName}</td>
                  <td><NumberBadge tone={item.totalCount > 0 ? "warning" : "neutral"}>{item.totalCount}</NumberBadge></td>
                  <td><ReasonChips counts={item.reasonCounts} labels={DOWNTIME_REASON_LABELS} /></td>
                </tr>
              ))}
              {!isLoading && operationDowntimeByMachine.length === 0 ? (
                <tr>
                  <td colSpan="4">Henüz makine bazlı duruş verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection id="operation-downtime-analysis" title="Operasyon Bazlı Duruş Analizi" description="Duruşların iş emri ve operasyon adımı bazında dağılımı." count={operationDowntimeByOperation.length}>
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>İş Emri</th>
                <th>Ürün</th>
                <th>Operasyon</th>
                <th>Duruş Sayısı</th>
                <th>Nedenler</th>
              </tr>
            </thead>
            <tbody>
              {operationDowntimeByOperation.map((item) => (
                <tr key={item.operationId}>
                  <td><span className="report-order-link">{item.orderNo}</span></td>
                  <td>{item.productCode}</td>
                  <td>{item.operationName}</td>
                  <td><NumberBadge tone={item.totalCount > 0 ? "warning" : "neutral"}>{item.totalCount}</NumberBadge></td>
                  <td><ReasonChips counts={item.reasonCounts} labels={DOWNTIME_REASON_LABELS} /></td>
                </tr>
              ))}
              {!isLoading && operationDowntimeByOperation.length === 0 ? (
                <tr>
                  <td colSpan="5">Henüz operasyon bazlı duruş verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection id="delayed-operations" title="En Çok Geciken Operasyonlar" description="Hedef süreye göre en fazla sapma oluşturan operasyonlar." count={delayedOperations.length}>
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>İş Emri</th>
                <th>Ürün</th>
                <th>Operasyon</th>
                <th>Makine</th>
                <th>Operatör</th>
                <th>Hedef</th>
                <th>Gerçek</th>
                <th>Duruş</th>
                <th>Net</th>
                <th>Gecikme</th>
              </tr>
            </thead>
            <tbody>
              {delayedOperations.map((item) => (
                <tr key={item.operationId}>
                  <td><span className="report-order-link">{item.orderNo}</span></td>
                  <td>{item.productCode}</td>
                  <td>{item.operationName}</td>
                  <td><MachineBadge>{item.machineCode}</MachineBadge></td>
                  <td>{item.operatorName}</td>
                  <td><NumberBadge>{item.plannedMinutes} dk</NumberBadge></td>
                  <td><NumberBadge>{item.actualMinutes} dk</NumberBadge></td>
                  <td><NumberBadge tone={item.downtimeMinutes > 0 ? "warning" : "neutral"}>{item.downtimeMinutes} dk</NumberBadge></td>
                  <td><NumberBadge>{item.netMinutes} dk</NumberBadge></td>
                  <td><NumberBadge tone={item.delayMinutes > 0 ? "danger" : "success"}>+{item.delayMinutes} dk</NumberBadge></td>
                </tr>
              ))}
              {!isLoading && delayedOperations.length === 0 ? (
                <tr>
                  <td colSpan="10">Geciken operasyon verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection id="machine-time-performance" title="Makine Bazlı Süre Performansı" description="Makine bazında hedef, gerçek, duruş ve gecikme süreleri." count={operationTimeByMachine.length}>
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>Makine</th>
                <th>Ad</th>
                <th>Operasyon</th>
                <th>Tamamlanan</th>
                <th>Hedef</th>
                <th>Gerçek</th>
                <th>Duruş</th>
                <th>Net</th>
                <th>Gecikme</th>
                <th>Ort. Gecikme</th>
              </tr>
            </thead>
            <tbody>
              {operationTimeByMachine.map((item) => (
                <tr key={item.machineId}>
                  <td><MachineBadge>{item.machineCode}</MachineBadge></td>
                  <td>{item.machineName}</td>
                  <td><NumberBadge>{item.operationCount}</NumberBadge></td>
                  <td><NumberBadge tone="success">{item.completedOperationCount}</NumberBadge></td>
                  <td><NumberBadge>{item.plannedMinutes} dk</NumberBadge></td>
                  <td><NumberBadge>{item.actualMinutes} dk</NumberBadge></td>
                  <td><NumberBadge tone={item.downtimeMinutes > 0 ? "warning" : "neutral"}>{item.downtimeMinutes} dk</NumberBadge></td>
                  <td><NumberBadge>{item.netMinutes} dk</NumberBadge></td>
                  <td><NumberBadge tone={item.delayMinutes > 0 ? "danger" : "success"}>{item.delayMinutes} dk</NumberBadge></td>
                  <td><NumberBadge tone={item.avgDelayMinutes > 0 ? "warning" : "success"}>{item.avgDelayMinutes} dk</NumberBadge></td>
                </tr>
              ))}
              {!isLoading && operationTimeByMachine.length === 0 ? (
                <tr>
                  <td colSpan="10">Makine bazlı süre verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection id="operator-performance" title="Operatör Proses Performansı" description="Hedef işleme, tamamlanan operasyon süresi, kalite ve tamamlama bileşenlerinden oluşan destek önceliği." count={operatorPerformance.length}>
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>Operatör</th>
                <th>Proses Puanı</th>
                <th>Veri Güveni</th>
                <th>Operasyon</th>
                <th>Hedef</th>
                <th>Süre</th>
                <th>Kalite</th>
                <th>Tamamlama</th>
                <th>Üretim / Fire</th>
              </tr>
            </thead>
            <tbody>
              {operatorPerformance.map((item) => (
                <tr key={item.operatorId}>
                  <td>{item.operatorName}</td>
                  <td><NumberBadge tone={item.performanceScore < 70 ? "danger" : item.performanceScore < 85 ? "warning" : "success"}>{item.performanceScore}</NumberBadge></td>
                  <td><NumberBadge tone={item.dataConfidence === "HIGH" ? "success" : item.dataConfidence === "MEDIUM" ? "warning" : "neutral"}>{item.dataConfidence === "HIGH" ? "Yüksek" : item.dataConfidence === "MEDIUM" ? "Orta" : "Düşük"}</NumberBadge></td>
                  <td><NumberBadge>{item.completedOperationCount}/{item.operationCount}</NumberBadge></td>
                  <td><NumberBadge tone={item.targetAchievement >= 85 ? "success" : "warning"}>%{item.targetAchievement}</NumberBadge></td>
                  <td><NumberBadge tone={item.timeEfficiency === null ? "neutral" : item.timeEfficiency >= 85 ? "success" : "warning"}>{item.timeEfficiency === null ? "Veri yok" : `%${item.timeEfficiency}`}</NumberBadge></td>
                  <td><NumberBadge tone={item.qualityRate >= 95 ? "success" : "warning"}>%{item.qualityRate}</NumberBadge></td>
                  <td><NumberBadge tone={item.completionRate >= 85 ? "success" : "warning"}>%{item.completionRate}</NumberBadge></td>
                  <td>{item.producedQuantity} / {item.scrapQuantity}</td>
                </tr>
              ))}
              {!isLoading && operatorPerformance.length === 0 ? (
                <tr>
                  <td colSpan="9">Operatör proses verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection id="operator-time-performance" title="Operatör Bazlı Süre Performansı" description="Operatör bazında tamamlanan operasyon ve süre sapmaları." count={operationTimeByOperator.length}>
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>Operatör</th>
                <th>Operasyon</th>
                <th>Tamamlanan</th>
                <th>Hedef</th>
                <th>Gerçek</th>
                <th>Duruş</th>
                <th>Net</th>
                <th>Gecikme</th>
                <th>Ort. Gecikme</th>
              </tr>
            </thead>
            <tbody>
              {operationTimeByOperator.map((item) => (
                <tr key={item.operatorId}>
                  <td>{item.operatorName}</td>
                  <td><NumberBadge>{item.operationCount}</NumberBadge></td>
                  <td><NumberBadge tone="success">{item.completedOperationCount}</NumberBadge></td>
                  <td><NumberBadge>{item.plannedMinutes} dk</NumberBadge></td>
                  <td><NumberBadge>{item.actualMinutes} dk</NumberBadge></td>
                  <td><NumberBadge tone={item.downtimeMinutes > 0 ? "warning" : "neutral"}>{item.downtimeMinutes} dk</NumberBadge></td>
                  <td><NumberBadge>{item.netMinutes} dk</NumberBadge></td>
                  <td><NumberBadge tone={item.delayMinutes > 0 ? "danger" : "success"}>{item.delayMinutes} dk</NumberBadge></td>
                  <td><NumberBadge tone={item.avgDelayMinutes > 0 ? "warning" : "success"}>{item.avgDelayMinutes} dk</NumberBadge></td>
                </tr>
              ))}
              {!isLoading && operationTimeByOperator.length === 0 ? (
                <tr>
                  <td colSpan="9">Operatör bazlı süre verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>

      <ReportDetailSection id="machine-performance-detail" title="Makine Performans Detayı" description="Makine bazında üretim girişi, fire ve fire oranı detayı." count={machinePerformanceData.length}>
        <div className="table-wrap report-detail-table-wrap">
          <table className="report-detail-table">
            <thead>
              <tr>
                <th>Makine</th>
                <th>Ad</th>
                <th>Üretim</th>
                <th>Fire</th>
                <th>Fire Oranı</th>
                <th>Üretim Girişi</th>
              </tr>
            </thead>
            <tbody>
              {machinePerformanceData.map((machine) => (
                <tr key={machine.machineId}>
                  <td><MachineBadge>{machine.machineCode}</MachineBadge></td>
                  <td>{machine.machineName}</td>
                  <td><NumberBadge tone="success">{machine.producedQuantity}</NumberBadge></td>
                  <td><NumberBadge tone={machine.scrapQuantity > 0 ? "danger" : "neutral"}>{machine.scrapQuantity}</NumberBadge></td>
                  <td><NumberBadge tone={machine.scrapRate > 3 ? "warning" : "success"}>{machine.scrapRate}%</NumberBadge></td>
                  <td><NumberBadge>{machine.logCount}</NumberBadge></td>
                </tr>
              ))}
              {!isLoading && machinePerformanceData.length === 0 ? (
                <tr>
                  <td colSpan="6">Henüz makine performans verisi yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ReportDetailSection>
    </div>
  );
}
