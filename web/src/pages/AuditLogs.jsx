import { useEffect, useMemo, useState } from "react";
import { getAuditLogs } from "../api/auditLogs.api.js";

const ACTION_LABELS = {
  WORK_ORDER_CREATED: "İş emri oluşturuldu",
  WORK_ORDER_STATUS_CHANGED: "İş emri durumu değişti",
  WORK_ORDER_OPERATOR_ASSIGNED: "Operatör atandı",
  WORK_ORDER_MACHINE_ASSIGNED: "Makine atandı",
  WORK_ORDER_STARTED: "İş emri başlatıldı",
  WORK_ORDER_PAUSED: "İş emri duraklatıldı",
  WORK_ORDER_COMPLETED: "İş emri tamamlandı",
  OPERATION_STARTED: "Operasyon başlatıldı",
  OPERATION_REOPENED: "Operasyon yeniden açıldı",
  OPERATION_PAUSED: "Operasyon duraklatıldı",
  OPERATION_COMPLETED: "Operasyon tamamlandı",
  OPERATION_MESSAGE_CREATED: "Operasyon mesajı",
  PRODUCTION_LOG_CREATED: "Üretim girişi",
  PRODUCTION_LOG_UPDATED: "Üretim kaydı güncellendi",
  PRODUCTION_ATTACHMENT_ADDED: "Görsel kanıt eklendi",
  QUALITY_CHECK_CREATED: "Kalite sonucu",
  QUALITY_CHECK_UPDATED: "Kalite sonucu güncellendi"
};

const ENTITY_LABELS = {
  WorkOrder: "İş Emri",
  WorkOrderOperation: "Operasyon",
  ProductionLog: "Üretim Kaydı",
  QualityCheck: "Kalite"
};

function formatDateTime(value) {
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

function normalize(value) {
  return value?.toLocaleLowerCase("tr-TR") ?? "";
}

function formatMetadata(metadata) {
  if (!metadata) {
    return "-";
  }

  return Object.entries(metadata)
    .filter(([, value]) => value !== null && value !== "")
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
    .join(" • ");
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAuditLogs() {
    try {
      const data = await getAuditLogs({ limit: 150 });
      setLogs(data);
      setError("");
    } catch (_error) {
      setError("İşlem geçmişi yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const actionOptions = useMemo(() => [...new Set(logs.map((log) => log.action))].sort(), [logs]);

  const filteredLogs = useMemo(() => {
    const searchText = normalize(search.trim());

    return logs.filter((log) => {
      const matchesAction = actionFilter === "ALL" || log.action === actionFilter;
      const searchableText = [
        log.summary,
        ACTION_LABELS[log.action],
        ENTITY_LABELS[log.entityType],
        log.entityId,
        log.actor?.name,
        log.actor?.email,
        log.actor?.role,
        formatMetadata(log.metadata)
      ].join(" ");

      return matchesAction && (!searchText || normalize(searchableText).includes(searchText));
    });
  }, [actionFilter, logs, search]);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>İşlem Geçmişi</h1>
          <p>Üretim, operasyon, kalite ve yönetici müdahalelerinin kim tarafından ne zaman yapıldığını izleyin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-grid">
        <article>
          <span>Toplam Kayıt</span>
          <strong>{isLoading ? "..." : logs.length}</strong>
        </article>
        <article>
          <span>Filtrelenen</span>
          <strong>{isLoading ? "..." : filteredLogs.length}</strong>
        </article>
        <article>
          <span>Son İşlem</span>
          <strong>{isLoading || !logs[0] ? "-" : formatDateTime(logs[0].createdAt)}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="audit-filter-grid">
          <label>
            Arama
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="İş emri, kullanıcı, işlem veya detay ara" />
          </label>
          <label>
            İşlem Tipi
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option value="ALL">Tüm işlemler</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action] ?? action}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zaman</th>
                <th>Kullanıcı</th>
                <th>İşlem</th>
                <th>Hedef</th>
                <th>Özet</th>
                <th>Detay</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDateTime(log.createdAt)}</td>
                  <td>
                    <strong>{log.actor?.name ?? "-"}</strong>
                    <span className="table-subtext">{log.actor?.role ?? "-"}</span>
                  </td>
                  <td>
                    <span className="status-pill">{ACTION_LABELS[log.action] ?? log.action}</span>
                  </td>
                  <td>{ENTITY_LABELS[log.entityType] ?? log.entityType}</td>
                  <td>{log.summary}</td>
                  <td className="audit-metadata">{formatMetadata(log.metadata)}</td>
                </tr>
              ))}
              {!isLoading && filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="6">İşlem geçmişi kaydı bulunamadı.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
