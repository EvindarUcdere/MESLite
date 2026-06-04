import { useEffect, useMemo, useState } from "react";
import { decideProductionAlertQualityAction, getProductionAlerts, updateProductionAlert } from "../api/productionAlerts.api.js";
import { useSocket } from "../hooks/useSocket.js";
import { useAuthStore } from "../store/authStore.js";
import { hasRole, ROLES } from "../utils/roles.js";

const ALERT_STATUS_LABELS = {
  OPEN: "Yeni",
  IN_REVIEW: "İnceleniyor",
  RESOLVED: "Çözüldü"
};

const ALERT_SEVERITY_LABELS = {
  INFO: "Bilgi",
  WARNING: "Uyarı",
  CRITICAL: "Kritik"
};

const ALERT_EVENT_LABELS = {
  CREATED: "Oluşturuldu",
  STATUS_CHANGED: "Durum değişti",
  ASSIGNED: "Atandı",
  RESOLVED: "Çözüldü",
  COMMENT: "Yorum"
};

const QUALITY_ACTION_LABELS = {
  REWORK_OPERATION: "Operasyona geri gönder",
  SCRAP: "Hurdaya ayır",
  CONDITIONAL_ACCEPT: "Şartlı kabul"
};

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");

function getAttachmentUrl(attachment) {
  if (!attachment?.fileUrl) {
    return "";
  }

  return `${API_ORIGIN}${attachment.fileUrl}`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("tr-TR", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function Alerts() {
  const user = useAuthStore((state) => state.user);
  const [alerts, setAlerts] = useState([]);
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [resolutionNotes, setResolutionNotes] = useState({});
  const [qualityActions, setQualityActions] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const filteredAlerts = useMemo(
    () => alerts.filter((alert) => severityFilter === "ALL" || alert.severity === severityFilter),
    [alerts, severityFilter]
  );

  async function loadAlerts({ showLoading = false } = {}) {
    if (showLoading) {
      setIsLoading(true);
    }

    try {
      const data =
        statusFilter === "ACTIVE"
          ? await getProductionAlerts()
          : await getProductionAlerts({
              status: statusFilter
            });

      setAlerts(statusFilter === "ACTIVE" ? data.filter((alert) => alert.status !== "RESOLVED") : data);
      setError("");
    } catch (_error) {
      setError("Uyarılar yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAlerts({ showLoading: true });
  }, [statusFilter]);

  useSocket({
    "productionAlert:created": () => loadAlerts(),
    "productionAlert:updated": () => loadAlerts()
  });

  function updateResolutionNote(alertId, value) {
    setResolutionNotes((current) => ({ ...current, [alertId]: value }));
  }

  function getQualityActionForm(alert) {
    const firstOperationId = alert.workOrder.operations?.[0]?.id ?? "";
    return qualityActions[alert.id] ?? { decision: "REWORK_OPERATION", reworkOperationId: firstOperationId, note: "" };
  }

  function updateQualityAction(alert, patch) {
    setQualityActions((current) => ({
      ...current,
      [alert.id]: {
        ...getQualityActionForm(alert),
        ...patch
      }
    }));
  }

  async function handleStatusChange(alertId, status) {
    const resolutionNote = resolutionNotes[alertId]?.trim();

    if (status === "RESOLVED" && !resolutionNote) {
      setError("Uyarıyı çözmek için çözüm notu girin.");
      return;
    }

    try {
      await updateProductionAlert(alertId, {
        status,
        ...(status === "RESOLVED" ? { resolutionNote } : {})
      });

      if (status === "RESOLVED") {
        setResolutionNotes((current) => ({ ...current, [alertId]: "" }));
      }

      await loadAlerts();
    } catch (_error) {
      setError("Uyarı durumu güncellenemedi.");
    }
  }

  async function handleQualityAction(alert) {
    const form = getQualityActionForm(alert);
    const note = form.note.trim();

    if (!note) {
      setError("Kalite aksiyonu için karar notu girin.");
      return;
    }

    if (form.decision === "REWORK_OPERATION" && !form.reworkOperationId) {
      setError("Geri işleme için hedef operasyon seçin.");
      return;
    }

    try {
      await decideProductionAlertQualityAction(alert.id, {
        decision: form.decision,
        note,
        ...(form.decision === "REWORK_OPERATION" ? { reworkOperationId: form.reworkOperationId } : {})
      });

      setQualityActions((current) => ({ ...current, [alert.id]: { ...form, note: "" } }));
      setError("");
      await loadAlerts();
    } catch (_error) {
      setError("Kalite aksiyonu uygulanamadı.");
    }
  }

  const counters = {
    open: alerts.filter((alert) => alert.status === "OPEN").length,
    review: alerts.filter((alert) => alert.status === "IN_REVIEW").length,
    critical: alerts.filter((alert) => alert.severity === "CRITICAL").length
  };
  const canManageAlerts = hasRole(user, [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER, ROLES.QUALITY_STAFF]);
  const canDecideQualityActions = hasRole(user, [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER]);

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Uyarılar</h1>
          <p>Operatör saha uyarılarını, aksiyon durumlarını ve çözüm geçmişini takip edin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="summary-grid">
        <article>
          <span>Yeni</span>
          <strong>{isLoading ? "..." : counters.open}</strong>
        </article>
        <article>
          <span>İnceleniyor</span>
          <strong>{isLoading ? "..." : counters.review}</strong>
        </article>
        <article>
          <span>Kritik</span>
          <strong>{isLoading ? "..." : counters.critical}</strong>
        </article>
      </section>

      <section className="panel">
        <div className="alert-filter-row">
          <label>
            Durum
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ACTIVE">Açık + İnceleniyor</option>
              <option value="OPEN">Yeni</option>
              <option value="IN_REVIEW">İnceleniyor</option>
              <option value="RESOLVED">Çözüldü</option>
            </select>
          </label>
          <label>
            Seviye
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value="ALL">Tümü</option>
              <option value="CRITICAL">Kritik</option>
              <option value="WARNING">Uyarı</option>
              <option value="INFO">Bilgi</option>
            </select>
          </label>
        </div>
      </section>

      <section className="alert-page-list">
        {filteredAlerts.map((alert) => (
          <article key={alert.id} className={`alert-card alert-${alert.severity.toLowerCase()}`}>
            <div className="operator-note-header">
              <strong>{alert.title}</strong>
              <span>{formatDateTime(alert.createdAt)}</span>
            </div>
            <p>{alert.message}</p>
            <div className="alert-context-grid">
              <div>
                <span>İş Emri</span>
                <strong>{alert.workOrder.orderNo}</strong>
              </div>
              <div>
                <span>Ürün</span>
                <strong>{alert.workOrder.product.name}</strong>
              </div>
              <div>
                <span>Makine</span>
                <strong>
                  {alert.productionLog.machine.code} - {alert.productionLog.machine.name}
                </strong>
              </div>
              <div>
                <span>Operatör</span>
                <strong>{alert.productionLog.operator.name}</strong>
              </div>
            </div>
            <div className="operator-note-meta">
              <span>{ALERT_SEVERITY_LABELS[alert.severity] ?? alert.severity}</span>
              <span>{ALERT_STATUS_LABELS[alert.status] ?? alert.status}</span>
              <span>{alert.createdBy.name}</span>
              {alert.qualityDecision ? <span>{QUALITY_ACTION_LABELS[alert.qualityDecision] ?? alert.qualityDecision}</span> : null}
            </div>
            {alert.qualityDecision ? (
              <div className="quality-action-summary">
                <strong>Kalite Kararı</strong>
                <span>{QUALITY_ACTION_LABELS[alert.qualityDecision] ?? alert.qualityDecision}</span>
                <p>{alert.qualityDecisionNote}</p>
                {alert.reworkOperation ? (
                  <small>
                    Hedef operasyon: {alert.reworkOperation.sequenceNo}. {alert.reworkOperation.operationName}
                  </small>
                ) : null}
              </div>
            ) : null}
            {alert.productionLog.attachments?.[0] ? (
              <img className="operator-note-image" src={getAttachmentUrl(alert.productionLog.attachments[0])} alt="Uyarı görseli" />
            ) : null}
            <div className="alert-history">
              <strong>Aksiyon Geçmişi</strong>
              {(alert.events ?? []).map((event) => (
                <div key={event.id} className="alert-history-row">
                  <span>{formatDateTime(event.createdAt)}</span>
                  <p>
                    {ALERT_EVENT_LABELS[event.type] ?? event.type} - {event.actor.name}
                    {event.note ? `: ${event.note}` : ""}
                  </p>
                </div>
              ))}
            </div>
            {canDecideQualityActions && alert.status !== "RESOLVED" && alert.title.toLocaleLowerCase("tr-TR").includes("kalite") ? (
              <div className="quality-action-panel">
                <div>
                  <strong>Kalite Aksiyon Kararı</strong>
                  <span>Uygunsuzluk üretim akışında nasıl ele alınacak?</span>
                </div>
                <div className="quality-action-grid">
                  <label>
                    Karar
                    <select value={getQualityActionForm(alert).decision} onChange={(event) => updateQualityAction(alert, { decision: event.target.value })}>
                      {Object.entries(QUALITY_ACTION_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {getQualityActionForm(alert).decision === "REWORK_OPERATION" ? (
                    <label>
                      Hedef operasyon
                      <select
                        value={getQualityActionForm(alert).reworkOperationId}
                        onChange={(event) => updateQualityAction(alert, { reworkOperationId: event.target.value })}
                      >
                        {(alert.workOrder.operations ?? []).map((operation) => (
                          <option key={operation.id} value={operation.id}>
                            {operation.sequenceNo}. {operation.operationName} - {operation.assignedOperator?.name ?? "Operatör yok"}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <label>
                    Karar notu
                    <input
                      value={getQualityActionForm(alert).note}
                      onChange={(event) => updateQualityAction(alert, { note: event.target.value })}
                      placeholder="Örn. Montaj adımı yeniden kontrol edilecek."
                    />
                  </label>
                </div>
                <button type="button" onClick={() => handleQualityAction(alert)}>
                  Kararı Uygula
                </button>
              </div>
            ) : null}
            {canManageAlerts && alert.status !== "RESOLVED" ? (
              <>
                <label className="alert-resolution-field">
                  Çözüm Notu
                  <input
                    value={resolutionNotes[alert.id] ?? ""}
                    onChange={(event) => updateResolutionNote(alert.id, event.target.value)}
                    placeholder="Örn. Makine bağlantıları sıkıldı, test üretimi uygun."
                  />
                </label>
                <div className="action-row">
                  <button type="button" onClick={() => handleStatusChange(alert.id, "IN_REVIEW")} disabled={alert.status === "IN_REVIEW"}>
                    İnceleniyor
                  </button>
                  <button type="button" onClick={() => handleStatusChange(alert.id, "RESOLVED")}>
                    Çözüldü
                  </button>
                </div>
              </>
            ) : null}
          </article>
        ))}
        {!isLoading && filteredAlerts.length === 0 ? <p className="empty-state">Filtreye uygun uyarı yok.</p> : null}
      </section>
    </div>
  );
}
