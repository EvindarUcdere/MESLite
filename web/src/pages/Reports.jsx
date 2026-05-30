import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getOverviewReport } from "../api/reports.api.js";

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

const DOWNTIME_REASON_COLORS = ["#dc2626", "#d97706", "#2563eb", "#7c3aed", "#be123c", "#64748b", "#94a3b8"];

function mapCountsToChartData(counts = {}) {
  return Object.entries(counts).map(([status, value]) => ({
    status,
    name: STATUS_LABELS[status] ?? SCRAP_REASON_LABELS[status] ?? status,
    value
  }));
}

export default function Reports() {
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadReport() {
      try {
        const data = await getOverviewReport();

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
  }, []);

  const summary = report?.summary ?? {};
  const summaryCards = [
    ["İş Emri", summary.workOrderCount ?? 0],
    ["Üretim Kaydı", summary.productionLogCount ?? 0],
    ["Toplam Üretim", summary.producedQuantity ?? 0],
    ["Fire Oranı", `${summary.scrapRate ?? 0}%`],
    ["Kalite Kontrol", summary.qualityCheckCount ?? 0],
    ["Hatalı Adet", summary.defectQuantity ?? 0]
  ];
  const workOrderStatusData = mapCountsToChartData(report?.workOrderStatusCounts);
  const machineStatusData = mapCountsToChartData(report?.machineStatusCounts);
  const qualityStatusData = mapCountsToChartData(report?.qualityStatusCounts);
  const machinePerformanceData = report?.machinePerformance ?? [];
  const productPerformanceData = report?.productPerformance ?? [];
  const scrapReasonData = mapCountsToChartData(report?.scrapReasonCounts);
  const machineDowntimeReasonData = Object.entries(report?.machineDowntimeReasonCounts ?? {}).map(([reason, value]) => ({
    status: reason,
    name: reason === "UNKNOWN" ? "Belirtilmemiş" : reason,
    value
  }));

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Raporlar</h1>
          <p>Üretim, fire, makine ve kalite performansını özetleyin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-grid">
        {summaryCards.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{isLoading ? "..." : value}</strong>
          </article>
        ))}
      </section>

      <section className="operations-grid">
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
                <th>Kayıt</th>
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
