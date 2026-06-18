import { useEffect, useMemo, useState } from "react";
import { getDomainEventLogs } from "../api/domainEventLogs.api.js";

const EVENT_LABELS = {
  "notification.created": "Bildirim oluştu",
  "workOrder.created": "İş emri oluşturuldu",
  "workOrder.started": "İş emri başlatıldı",
  "workOrder.paused": "İş emri duraklatıldı",
  "productionLog.created": "Üretim kaydı",
  "operation.paused": "Operasyon durakladı",
  "operation.completed": "Operasyon tamamlandı",
  "scrapActionWorkOrder.created": "Telafi iş emri",
  "qualityCheck.failed": "Kalite uyarısı",
  "shift.started": "Vardiya başladı"
};

const ENTITY_LABELS = {
  WorkOrder: "İş Emri",
  WorkOrderOperation: "Operasyon",
  ProductionLog: "Üretim Kaydı",
  QualityCheck: "Kalite",
  Notification: "Bildirim",
  Shift: "Vardiya"
};

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function normalize(value) {
  return value?.toLocaleLowerCase("tr-TR") ?? "";
}

function getEventTone(type) {
  if (type?.includes("scrap") || type?.includes("quality")) {
    return "warning";
  }

  if (type?.includes("paused")) {
    return "danger";
  }

  if (type?.includes("completed") || type?.includes("started")) {
    return "success";
  }

  return "info";
}

function getPayloadPreview(payload) {
  if (!payload) {
    return "-";
  }

  const entries = Object.entries(payload)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 6)
    .map(([key, value]) => {
      if (typeof value === "object") {
        return `${key}: ${JSON.stringify(value).slice(0, 80)}`;
      }

      return `${key}: ${value}`;
    });

  return entries.length ? entries.join(" • ") : "-";
}

export default function EventLogs() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadEventLogs() {
    try {
      const data = await getDomainEventLogs({ limit: 200 });
      setLogs(data);
      setError("");
    } catch (_error) {
      setError("Sistem olayları yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadEventLogs();
  }, []);

  const typeOptions = useMemo(() => [...new Set(logs.map((log) => log.type))].sort(), [logs]);
  const entityOptions = useMemo(() => [...new Set(logs.map((log) => log.entityType).filter(Boolean))].sort(), [logs]);

  const filteredLogs = useMemo(() => {
    const searchText = normalize(search.trim());

    return logs.filter((log) => {
      const matchesType = typeFilter === "ALL" || log.type === typeFilter;
      const matchesEntity = entityFilter === "ALL" || log.entityType === entityFilter;
      const searchableText = [
        log.type,
        EVENT_LABELS[log.type],
        log.summary,
        log.entityType,
        log.entityId,
        getPayloadPreview(log.payload)
      ].join(" ");

      return matchesType && matchesEntity && (!searchText || normalize(searchableText).includes(searchText));
    });
  }, [entityFilter, logs, search, typeFilter]);

  const lastEvent = logs[0];

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Sistem Olayları</h1>
          <p>İş emri, üretim, kalite, fire telafisi ve bildirim olaylarının sistem içinde nasıl aktığını izleyin.</p>
        </div>
        <button type="button" className="secondary-button" onClick={loadEventLogs}>
          Yenile
        </button>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-grid event-log-summary-grid">
        <article>
          <span>Toplam Olay</span>
          <strong>{isLoading ? "..." : logs.length}</strong>
        </article>
        <article>
          <span>Filtrelenen</span>
          <strong>{isLoading ? "..." : filteredLogs.length}</strong>
        </article>
        <article>
          <span>Son Olay</span>
          <strong>{isLoading || !lastEvent ? "-" : EVENT_LABELS[lastEvent.type] ?? lastEvent.type}</strong>
        </article>
        <article>
          <span>Son Zaman</span>
          <strong>{isLoading || !lastEvent ? "-" : formatDateTime(lastEvent.occurredAt)}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="event-log-filter-grid">
          <label>
            Arama
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="İş emri, olay tipi, özet veya payload ara" />
          </label>
          <label>
            Olay Tipi
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="ALL">Tüm olaylar</option>
              {typeOptions.map((type) => (
                <option key={type} value={type}>
                  {EVENT_LABELS[type] ?? type}
                </option>
              ))}
            </select>
          </label>
          <label>
            Hedef
            <select value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
              <option value="ALL">Tüm hedefler</option>
              {entityOptions.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {ENTITY_LABELS[entityType] ?? entityType}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table className="event-log-table">
            <thead>
              <tr>
                <th>Zaman</th>
                <th>Olay</th>
                <th>Özet</th>
                <th>Hedef</th>
                <th>Teknik Detay</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.occurredAt)}</td>
                  <td>
                    <span className={`event-log-badge event-log-badge-${getEventTone(log.type)}`}>{EVENT_LABELS[log.type] ?? log.type}</span>
                    <span className="table-subtext">{log.type}</span>
                  </td>
                  <td>{log.summary ?? "-"}</td>
                  <td>
                    <strong>{ENTITY_LABELS[log.entityType] ?? log.entityType ?? "-"}</strong>
                    <span className="table-subtext">{log.entityId ?? "-"}</span>
                  </td>
                  <td className="event-log-payload" title={JSON.stringify(log.payload ?? {}, null, 2)}>
                    {getPayloadPreview(log.payload)}
                  </td>
                </tr>
              ))}
              {!isLoading && filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="5">Sistem olayı bulunamadı.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
