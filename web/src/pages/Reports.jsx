import { useEffect, useState } from "react";
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

export default function Reports() {
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

      <section className="report-insight-grid">
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
                    <td>{item.machineCode}</td>
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

      <section className="operations-grid">
        <article className="panel chart-panel">
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

      <section className="panel chart-panel report-wide-chart">
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
        <article className="panel chart-panel">
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

        <article className="panel chart-panel">
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

        <article className="panel chart-panel">
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

        <article className="panel chart-panel">
          <h2>Fire Nedenleri</h2>
          {scrapReasonData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={scrapReasonData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {scrapReasonData.map((entry) => (
                    <Cell key={entry.status} fill={SCRAP_REASON_COLORS[entry.status] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">Fire nedeni verisi yok.</p>
          )}
        </article>

        <article className="panel chart-panel">
          <h2>Operasyon Duruş Nedenleri</h2>
          {operationDowntimeReasonData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={operationDowntimeReasonData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {operationDowntimeReasonData.map((entry, index) => (
                    <Cell key={entry.status} fill={DOWNTIME_REASON_COLORS[index % DOWNTIME_REASON_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">Operasyon duruş nedeni verisi yok.</p>
          )}
        </article>

        <article className="panel chart-panel">
          <h2>Makine Duruş Nedenleri</h2>
          {machineDowntimeReasonData.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={machineDowntimeReasonData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                  {machineDowntimeReasonData.map((entry, index) => (
                    <Cell key={entry.status} fill={DOWNTIME_REASON_COLORS[index % DOWNTIME_REASON_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">Makine duruş nedeni verisi yok.</p>
          )}
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
      </section>

      <section className="panel">
        <h2>Operasyon Bazlı Kalite Kararları</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.orderNo}</td>
                  <td>{item.productCode}</td>
                  <td>{item.operationName}</td>
                  <td>{item.machineCode}</td>
                  <td>{item.totalCount}</td>
                  <td>{item.reworkCount}</td>
                  <td>{item.scrapCount}</td>
                  <td>{item.conditionalAcceptCount}</td>
                  <td>{item.criticalCount}</td>
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
      </section>

      <section className="panel">
        <h2>Makine Bazlı Kalite Kararları</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.machineCode}</td>
                  <td>{item.machineName}</td>
                  <td>{item.totalCount}</td>
                  <td>{item.reworkCount}</td>
                  <td>{item.scrapCount}</td>
                  <td>{item.conditionalAcceptCount}</td>
                  <td>{item.criticalCount}</td>
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
      </section>

      <section className="panel">
        <h2>Son Kalite Kararları</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.orderNo}</td>
                  <td>{item.productCode}</td>
                  <td>{QUALITY_DECISION_LABELS[item.decision] ?? item.decision}</td>
                  <td>{item.operationName}</td>
                  <td>{item.machineCode}</td>
                  <td>{item.operatorName}</td>
                  <td>{item.note ?? "-"}</td>
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
      </section>

      <section className="panel">
        <h2>Vardiya Performans Detayı</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{shift.producedQuantity}</td>
                  <td>{shift.scrapQuantity}</td>
                  <td>{shift.scrapRate}%</td>
                  <td>{shift.operatorCount}</td>
                  <td>{shift.machineCount}</td>
                  <td>{shift.logCount}</td>
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
      </section>

      <section className="panel">
        <h2>Vardiya Bazlı Operatör Performansı</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.producedQuantity}</td>
                  <td>{item.scrapQuantity}</td>
                  <td>{item.scrapRate}%</td>
                  <td>{item.logCount}</td>
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
      </section>

      <section className="panel">
        <h2>Vardiya Bazlı Makine Performansı</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.machineCode}</td>
                  <td>{item.machineName}</td>
                  <td>{item.producedQuantity}</td>
                  <td>{item.scrapQuantity}</td>
                  <td>{item.scrapRate}%</td>
                  <td>{item.logCount}</td>
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
      </section>

      <section className="panel">
        <h2>Vardiya Bazlı Duruş Analizi</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.totalCount}</td>
                  <td>
                    {Object.entries(item.reasonCounts)
                      .map(([reason, count]) => `${DOWNTIME_REASON_LABELS[reason] ?? reason}: ${count}`)
                      .join(", ")}
                  </td>
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
      </section>

      <section className="panel">
        <h2>Makine Bazlı Duruş Analizi</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.machineCode}</td>
                  <td>{item.machineName}</td>
                  <td>{item.totalCount}</td>
                  <td>
                    {Object.entries(item.reasonCounts)
                      .map(([reason, count]) => `${DOWNTIME_REASON_LABELS[reason] ?? reason}: ${count}`)
                      .join(", ")}
                  </td>
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
      </section>

      <section className="panel">
        <h2>Operasyon Bazlı Duruş Analizi</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.orderNo}</td>
                  <td>{item.productCode}</td>
                  <td>{item.operationName}</td>
                  <td>{item.totalCount}</td>
                  <td>
                    {Object.entries(item.reasonCounts)
                      .map(([reason, count]) => `${DOWNTIME_REASON_LABELS[reason] ?? reason}: ${count}`)
                      .join(", ")}
                  </td>
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
      </section>

      <section className="panel">
        <h2>En Çok Geciken Operasyonlar</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.orderNo}</td>
                  <td>{item.productCode}</td>
                  <td>{item.operationName}</td>
                  <td>{item.machineCode}</td>
                  <td>{item.operatorName}</td>
                  <td>{item.plannedMinutes} dk</td>
                  <td>{item.actualMinutes} dk</td>
                  <td>{item.downtimeMinutes} dk</td>
                  <td>{item.netMinutes} dk</td>
                  <td>+{item.delayMinutes} dk</td>
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
      </section>

      <section className="panel">
        <h2>Makine Bazlı Süre Performansı</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.machineCode}</td>
                  <td>{item.machineName}</td>
                  <td>{item.operationCount}</td>
                  <td>{item.completedOperationCount}</td>
                  <td>{item.plannedMinutes} dk</td>
                  <td>{item.actualMinutes} dk</td>
                  <td>{item.downtimeMinutes} dk</td>
                  <td>{item.netMinutes} dk</td>
                  <td>{item.delayMinutes} dk</td>
                  <td>{item.avgDelayMinutes} dk</td>
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
      </section>

      <section className="panel">
        <h2>Operatör Bazlı Süre Performansı</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{item.operationCount}</td>
                  <td>{item.completedOperationCount}</td>
                  <td>{item.plannedMinutes} dk</td>
                  <td>{item.actualMinutes} dk</td>
                  <td>{item.downtimeMinutes} dk</td>
                  <td>{item.netMinutes} dk</td>
                  <td>{item.delayMinutes} dk</td>
                  <td>{item.avgDelayMinutes} dk</td>
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
      </section>

      <section className="panel">
        <h2>Makine Performans Detayı</h2>
        <div className="table-wrap">
          <table>
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
                  <td>{machine.machineCode}</td>
                  <td>{machine.machineName}</td>
                  <td>{machine.producedQuantity}</td>
                  <td>{machine.scrapQuantity}</td>
                  <td>{machine.scrapRate}%</td>
                  <td>{machine.logCount}</td>
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
      </section>
    </div>
  );
}
