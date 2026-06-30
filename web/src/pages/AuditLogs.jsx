import { useEffect, useMemo, useState } from "react";
import { getAuditLogs } from "../api/auditLogs.api.js";
import { getOfflineOperationLogs } from "../api/offlineOperationLogs.api.js";

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

const SYNC_TYPE_LABELS = {
  PRODUCTION_LOG: "Üretim / fire kaydı",
  OPERATION_START: "Operasyon başlatma",
  OPERATION_PAUSE: "Operasyon duraklatma",
  OPERATION_COMPLETE: "Operasyon tamamlama",
  OPERATION_MESSAGE: "Saha notu",
  QUALITY_CHECK: "Kalite sonucu",
  QUALITY_ACTION_DECISION: "Kalite aksiyonu",
  SCRAP_ACTION: "Fire kararı"
};

const SYNC_STATUS_LABELS = {
  PENDING: "Bekliyor",
  PROCESSING: "İşleniyor",
  SYNCED: "Senkronize",
  FAILED: "Başarısız"
};

const SOURCE_LABELS = {
  OFFLINE_SYNC: "Offline kuyruk",
  MOBILE_ONLINE: "Mobil online",
  EDGE_SYNC: "Yerel sunucu",
  UNKNOWN: "Eski kayıt"
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

function formatSyncError(message) {
  const translations = {
    "Only started operations can be completed": "Yalnızca başlatılmış operasyonlar tamamlanabilir.",
    "Only ready, paused or short-completed operations can be started": "Bu operasyon mevcut durumunda başlatılamaz.",
    "Operation is already being processed": "İşlem hâlihazırda işleniyor."
  };

  return translations[message] ?? message ?? "-";
}

export default function AuditLogs() {
  const [view, setView] = useState("AUDIT");
  const [logs, setLogs] = useState([]);
  const [syncLogs, setSyncLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("ALL");
  const [syncStatusFilter, setSyncStatusFilter] = useState("ALL");
  const [syncSourceFilter, setSyncSourceFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadAuditLogs() {
    try {
      const [auditData, syncData] = await Promise.all([getAuditLogs({ limit: 150 }), getOfflineOperationLogs({ limit: 200 })]);
      setLogs(auditData);
      setSyncLogs(syncData);
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

  const filteredSyncLogs = useMemo(() => {
    const searchText = normalize(search.trim());

    return syncLogs.filter((log) => {
      const source = log.clientContext?.source ?? "UNKNOWN";
      const matchesStatus = syncStatusFilter === "ALL" || log.status === syncStatusFilter;
      const matchesSource = syncSourceFilter === "ALL" || source === syncSourceFilter;
      const searchableText = [
        log.operationId,
        SYNC_TYPE_LABELS[log.type],
        log.type,
        log.user?.name,
        log.user?.email,
        log.workOrder?.orderNo,
        log.workOrder?.product?.code,
        log.errorMessage
      ].join(" ");

      return matchesStatus && matchesSource && (!searchText || normalize(searchableText).includes(searchText));
    });
  }, [search, syncLogs, syncSourceFilter, syncStatusFilter]);

  const activeLogs = view === "AUDIT" ? filteredLogs : filteredSyncLogs;
  const allActiveLogs = view === "AUDIT" ? logs : syncLogs;

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>İşlem Geçmişi</h1>
          <p>Üretim, operasyon, kalite ve yönetici müdahalelerinin kim tarafından ne zaman yapıldığını izleyin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <nav className="audit-view-tabs" aria-label="İzlenebilirlik görünümü">
        <button className={view === "AUDIT" ? "is-active" : ""} type="button" onClick={() => setView("AUDIT")}>İşlem Geçmişi</button>
        <button className={view === "SYNC" ? "is-active" : ""} type="button" onClick={() => setView("SYNC")}>Mobil Senkronizasyon</button>
      </nav>

      <section className="summary-grid">
        <article>
          <span>Toplam Kayıt</span>
          <strong>{isLoading ? "..." : allActiveLogs.length}</strong>
        </article>
        <article>
          <span>Filtrelenen</span>
          <strong>{isLoading ? "..." : activeLogs.length}</strong>
        </article>
        <article>
          <span>Son İşlem</span>
          <strong>{isLoading || !allActiveLogs[0] ? "-" : formatDateTime(allActiveLogs[0].createdAt)}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="audit-filter-grid">
          <label>
            Arama
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="İş emri, kullanıcı, işlem veya detay ara" />
          </label>
          {view === "AUDIT" ? <label>
            İşlem Tipi
            <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
              <option value="ALL">Tüm işlemler</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {ACTION_LABELS[action] ?? action}
                </option>
              ))}
            </select>
          </label> : (
            <>
              <label>
                Senkronizasyon Durumu
                <select value={syncStatusFilter} onChange={(event) => setSyncStatusFilter(event.target.value)}>
                  <option value="ALL">Tüm durumlar</option>
                  {Object.entries(SYNC_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                Kayıt Kaynağı
                <select value={syncSourceFilter} onChange={(event) => setSyncSourceFilter(event.target.value)}>
                  <option value="ALL">Tüm kaynaklar</option>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="table-wrap">
          {view === "AUDIT" ? <table>
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
          </table> : (
            <table className="sync-log-table">
              <thead>
                <tr>
                  <th>Sunucu Zamanı</th>
                  <th>Kaynak</th>
                  <th>Kullanıcı</th>
                  <th>İşlem</th>
                  <th>İş Emri</th>
                  <th>Durum</th>
                  <th>Cihaz Zamanı</th>
                  <th>Hata</th>
                </tr>
              </thead>
              <tbody>
                {filteredSyncLogs.map((log) => {
                  const source = log.clientContext?.source ?? "UNKNOWN";
                  return (
                    <tr key={log.id}>
                      <td>{formatDateTime(log.createdAt)}</td>
                      <td><span className={`sync-source-badge sync-source-${source.toLowerCase()}`}>{SOURCE_LABELS[source] ?? source}</span></td>
                      <td><strong>{log.user?.name ?? "-"}</strong><span className="table-subtext">{log.user?.email ?? "-"}</span></td>
                      <td><strong>{SYNC_TYPE_LABELS[log.type] ?? log.type}</strong><span className="table-subtext">{log.operationId}</span></td>
                      <td><strong>{log.workOrder?.orderNo ?? "-"}</strong><span className="table-subtext">{log.workOrder?.product?.code ?? "-"}</span></td>
                      <td><span className={`status-pill sync-status-${log.status.toLowerCase()}`}>{SYNC_STATUS_LABELS[log.status] ?? log.status}</span></td>
                      <td>{formatDateTime(log.clientContext?.clientCreatedAt)}</td>
                      <td className={log.errorMessage ? "sync-error-cell" : ""}>{formatSyncError(log.errorMessage)}</td>
                    </tr>
                  );
                })}
                {!isLoading && filteredSyncLogs.length === 0 ? <tr><td colSpan="8">Senkronizasyon kaydı bulunamadı.</td></tr> : null}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
