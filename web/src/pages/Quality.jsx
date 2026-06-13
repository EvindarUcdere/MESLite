import { AlertTriangle, ClipboardCheck, Plus } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { createQualityCheck, getQualityChecks } from "../api/qualityChecks.api.js";
import { getWorkOrders } from "../api/workOrders.api.js";

const QUALITY_LABELS = {
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

const IMPACT_LABELS = {
  HIGH: "Yüksek risk",
  MEDIUM: "İzlenmeli",
  LOW: "Normal",
  NEUTRAL: "Kontrol sonrasi"
};

const RELATION_LABELS = {
  BEFORE_CHECK: "Kalite oncesi",
  CHECKED_OPERATION: "Kontrol noktası",
  AFTER_CHECK: "Kalite sonrasi",
  UNKNOWN: "Bilinmiyor"
};

const QUALITY_OPERATION_KEYWORDS = ["kalite", "quality", "kontrol"];

const API_ORIGIN = (import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").replace(/\/api\/?$/, "");

function getAttachmentUrl(attachment) {
  if (!attachment?.fileUrl) {
    return "";
  }

  return `${API_ORIGIN}${attachment.fileUrl}`;
}

function formatDate(value) {
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

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message ?? fallback;
}

function isQualityOperation(operation) {
  const name = operation.operationName?.toLocaleLowerCase("tr-TR") ?? "";
  return QUALITY_OPERATION_KEYWORDS.some((keyword) => name.includes(keyword));
}

function getQualityPendingItems(workOrders, qualityChecks) {
  const checkedOperationIds = new Set(qualityChecks.map((check) => check.workOrderOperationId).filter(Boolean));

  return workOrders
    .flatMap((workOrder) =>
      (workOrder.operations ?? [])
        .filter((operation) => operation.status === "COMPLETED" && operation.producedQuantity > 0 && isQualityOperation(operation) && !checkedOperationIds.has(operation.id))
        .map((operation) => ({
          workOrder,
          operation
        }))
    )
    .sort((a, b) => new Date(b.operation.completedAt ?? b.workOrder.updatedAt).getTime() - new Date(a.operation.completedAt ?? a.workOrder.updatedAt).getTime());
}

function getSelectedWorkOrderTrace(workOrder) {
  if (!workOrder) {
    return null;
  }

  const operations = workOrder.operations ?? [];
  const suspectOperations = operations
    .map((operation) => ({
      id: operation.id,
      sequenceNo: operation.sequenceNo,
      operationName: operation.operationName,
      impactLevel: operation.scrapQuantity > 0 || (operation.downtimes ?? []).length > 0 ? "MEDIUM" : "LOW",
      machine: operation.machine,
      assignedOperator: operation.assignedOperator,
      signals: [
        ...(operation.scrapQuantity > 0 ? [{ label: "Fire kaydı", detail: `${operation.scrapQuantity} fire` }] : []),
        ...((operation.downtimes ?? []).length > 0 ? [{ label: "Duruş kaydı", detail: `${operation.downtimes.length} durus` }] : []),
        ...((operation.messages ?? [])
          .filter((message) => ["QUALITY_ALERT", "STOPPAGE", "WARNING"].includes(message.severity))
          .slice(0, 1)
          .map((message) => ({
            label: message.severity,
            detail: message.message
          })))
      ]
    }))
    .filter((operation) => operation.signals.length > 0);

  return {
    totals: {
      operationCount: operations.length,
      suspectOperationCount: suspectOperations.length,
      totalDowntimeMinutes: operations.reduce((sum, operation) => sum + (operation.downtimes ?? []).length, 0),
      totalDelayMinutes: 0
    },
    suspectOperations,
    routeOperations: operations.map((operation) => ({
      id: operation.id,
      sequenceNo: operation.sequenceNo,
      operationName: operation.operationName,
      status: operation.status,
      relationToQuality: "UNKNOWN",
      machine: operation.machine,
      assignedOperator: operation.assignedOperator,
      producedQuantity: operation.producedQuantity,
      scrapQuantity: operation.scrapQuantity,
      metrics: {
        plannedMinutes: operation.routeOperation?.estimatedMinutes ?? 0,
        actualMinutes: 0,
        downtimeMinutes: 0,
        netMinutes: 0,
        delayMinutes: 0
      },
      signals: [],
      impactLevel: "LOW"
    }))
  };
}

function TraceabilityPanel({ traceability, compact = false }) {
  if (!traceability) {
    return null;
  }

  return (
    <div className={`traceability-panel ${compact ? "traceability-panel-compact" : ""}`}>
      <div className="traceability-summary">
        <div>
          <span>Operasyon</span>
          <strong>{traceability.totals.operationCount}</strong>
        </div>
        <div>
          <span>Riskli Adim</span>
          <strong>{traceability.totals.suspectOperationCount}</strong>
        </div>
        <div>
          <span>Toplam Duruş</span>
          <strong>{traceability.totals.totalDowntimeMinutes} dk</strong>
        </div>
        <div>
          <span>Gecikme</span>
          <strong>{traceability.totals.totalDelayMinutes} dk</strong>
        </div>
      </div>

      {traceability.suspectOperations.length ? (
        <div className="traceability-risk-box">
          <div className="traceability-risk-title">
            <AlertTriangle size={16} />
            <span>Incelenmesi gereken adimlar</span>
          </div>
          <div className="traceability-risk-list">
            {traceability.suspectOperations.map((operation) => (
              <div className={`traceability-risk-card impact-${operation.impactLevel.toLowerCase()}`} key={operation.id}>
                <strong>
                  {operation.sequenceNo}. {operation.operationName}
                </strong>
                <span>{IMPACT_LABELS[operation.impactLevel] ?? operation.impactLevel}</span>
                <small>
                  {operation.machine?.code ?? "Makine yok"} / {operation.assignedOperator?.name ?? "Operatör yok"}
                </small>
                {operation.signals.slice(0, 3).map((signal, index) => (
                  <em key={`${operation.id}-${signal.type ?? signal.label}-${index}`}>
                    {signal.label}: {signal.detail}
                  </em>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="muted-text">Bu kalite kaydı için belirgin risk sinyali yok.</p>
      )}

      {!compact ? (
        <div className="traceability-route">
          {traceability.routeOperations.map((operation) => (
            <div className={`traceability-step impact-${operation.impactLevel.toLowerCase()}`} key={operation.id}>
              <div className="traceability-step-header">
                <strong>
                  {operation.sequenceNo}. {operation.operationName}
                </strong>
                <span>{RELATION_LABELS[operation.relationToQuality] ?? operation.relationToQuality}</span>
              </div>
              <p>
                {operation.status} / Üretim {operation.producedQuantity} / Fire {operation.scrapQuantity}
              </p>
              <p>
                {operation.machine?.code ?? "Makine yok"} / {operation.assignedOperator?.name ?? "Operatör yok"}
              </p>
              <p>
                Hedef {operation.metrics.plannedMinutes} dk - Net {operation.metrics.netMinutes} dk - Gecikme {operation.metrics.delayMinutes} dk
              </p>
              {operation.signals.length ? (
                <div className="traceability-signal-row">
                  {operation.signals.slice(0, 4).map((signal, index) => (
                    <span key={`${operation.id}-${signal.type ?? signal.label}-${index}`}>{signal.label}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function Quality() {
  const [workOrders, setWorkOrders] = useState([]);
  const [qualityChecks, setQualityChecks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    workOrderId: "",
    workOrderOperationId: "",
    status: "PASSED",
    defectQuantity: 0,
    defectReason: "",
    note: ""
  });

  const checkCandidates = useMemo(
    () => workOrders.filter((workOrder) => workOrder.producedQuantity > 0 && workOrder.status !== "CANCELLED"),
    [workOrders]
  );
  const pendingQualityItems = useMemo(() => getQualityPendingItems(workOrders, qualityChecks), [workOrders, qualityChecks]);
  const selectedWorkOrder = checkCandidates.find((workOrder) => workOrder.id === form.workOrderId);
  const operationCandidates = useMemo(
    () => (selectedWorkOrder?.operations ?? []).filter((operation) => operation.producedQuantity > 0),
    [selectedWorkOrder]
  );
  const selectedOperation = operationCandidates.find((operation) => operation.id === form.workOrderOperationId);
  const selectedProductionLogs = selectedWorkOrder?.productionLogs ?? [];
  const selectedTraceability = getSelectedWorkOrderTrace(selectedWorkOrder);

  async function loadData() {
    setError("");
    const [workOrderData, qualityData] = await Promise.all([getWorkOrders(), getQualityChecks()]);
    setWorkOrders(workOrderData);
    setQualityChecks(qualityData);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [workOrderData, qualityData] = await Promise.all([getWorkOrders(), getQualityChecks()]);

        if (isMounted) {
          setWorkOrders(workOrderData);
          setQualityChecks(qualityData);
        }
      } catch (_error) {
        if (isMounted) {
          setError("Kalite verileri yüklenemedi.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, []);

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "workOrderId" ? { workOrderOperationId: "" } : {})
    }));
  }

  function selectPendingQualityItem(item) {
    setForm((current) => ({
      ...current,
      workOrderId: item.workOrder.id,
      workOrderOperationId: item.operation.id,
      status: "PASSED",
      defectQuantity: 0,
      defectReason: "",
      note: ""
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const defectQuantity = Number(form.defectQuantity);

      if (!selectedWorkOrder) {
        setError("Kalite kontrol için üretimi yapılmış bir iş emri seçin.");
        return;
      }

      if ((selectedWorkOrder.operations ?? []).length > 0 && !selectedOperation) {
        setError("Rotalı iş emirlerinde kalite kontrol için üretim yapılmış bir operasyon seçin.");
        return;
      }

      const qualityQuantityLimit = selectedOperation?.producedQuantity ?? selectedWorkOrder.producedQuantity;

      if (defectQuantity > qualityQuantityLimit) {
        setError(`Hatalı adet kalite kapsamındaki üretim miktarını aşamaz. Üretilen: ${qualityQuantityLimit} adet.`);
        return;
      }

      if (["FAILED", "PARTIAL"].includes(form.status) && !form.defectReason.trim()) {
        setError("Kaldı veya kısmi sonuç için hata nedeni girin.");
        return;
      }

      await createQualityCheck({
        workOrderId: form.workOrderId,
        ...(form.workOrderOperationId ? { workOrderOperationId: form.workOrderOperationId } : {}),
        status: form.status,
        defectQuantity,
        ...(form.defectReason ? { defectReason: form.defectReason } : {}),
        ...(form.note ? { note: form.note } : {})
      });

      setForm((current) => ({
        ...current,
        workOrderOperationId: "",
        defectQuantity: 0,
        defectReason: "",
        note: ""
      }));
      await loadData();
    } catch (error) {
      setError(getApiErrorMessage(error, "Kalite kontrol kaydı oluşturulamadı."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Kalite</h1>
          <p>Üretimi yapılan iş emirleri için kalite sonuçlarını kaydedin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="panel">
        <div className="section-title-row">
          <div>
            <h2>Kalite Sonucu Bekleyen Isler</h2>
            <p className="muted-text">Mobil kalite operasyonu tamamlanmis ama resmi kalite sonucu henuz girilmemis isler.</p>
          </div>
          <span className="status-pill status-planned">{pendingQualityItems.length} bekliyor</span>
        </div>
        <div className="pending-quality-list">
          {pendingQualityItems.map((item) => (
            <button className="pending-quality-card" key={item.operation.id} type="button" onClick={() => selectPendingQualityItem(item)}>
              <div>
                <strong>{item.workOrder.orderNo}</strong>
                <span>{item.workOrder.product.name}</span>
              </div>
              <div>
                <span>Operasyon</span>
                <strong>
                  {item.operation.sequenceNo}. {item.operation.operationName}
                </strong>
              </div>
              <div>
                <span>Üretim / Fire</span>
                <strong>
                  {item.operation.producedQuantity} / {item.operation.scrapQuantity}
                </strong>
              </div>
              <div>
                <span>Tamamlanma</span>
                <strong>{formatDate(item.operation.completedAt)}</strong>
              </div>
            </button>
          ))}
          {!isLoading && pendingQualityItems.length === 0 ? <p className="empty-state">Kalite sonucu bekleyen is yok.</p> : null}
        </div>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <div>
            <h2>Kalite Girişi</h2>
            <p className="muted-text">Üretimi yapılmış iş emirleri için kalite sonucunu, operasyon adımını ve hata nedenini kaydedin.</p>
          </div>
        </div>
        <form className="work-order-form quality-check-form" onSubmit={handleSubmit}>
          <label>
            İş Emri
            <select value={form.workOrderId} onChange={(event) => updateForm("workOrderId", event.target.value)} required>
              <option value="">Üretimi yapılmış iş emri seçin</option>
              {checkCandidates.map((workOrder) => (
                <option key={workOrder.id} value={workOrder.id}>
                  {workOrder.orderNo} - {workOrder.product.name} ({workOrder.producedQuantity} adet)
                </option>
              ))}
            </select>
          </label>
          {selectedWorkOrder?.operations?.length ? (
            <label>
              Operasyon
              <select value={form.workOrderOperationId} onChange={(event) => updateForm("workOrderOperationId", event.target.value)} required>
                <option value="">Kalite kontrol adımı seçin</option>
                {operationCandidates.map((operation) => (
                  <option key={operation.id} value={operation.id}>
                    {operation.sequenceNo}. {operation.operationName} - {operation.producedQuantity} adet
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="field-span-all">
            <span className="form-field-title">Hızlı İş Emri Seçimi</span>
            <div className="choice-list">
              {checkCandidates.map((workOrder) => (
                <button
                  key={workOrder.id}
                  className={`choice-button ${form.workOrderId === workOrder.id ? "choice-button-active" : ""}`}
                  type="button"
                  onClick={() => updateForm("workOrderId", workOrder.id)}
                >
                  <strong>{workOrder.orderNo}</strong>
                  <span>{workOrder.product.name}</span>
                  <small>
                    Üretim {workOrder.producedQuantity} / Fire {workOrder.scrapQuantity}
                  </small>
                </button>
              ))}
            </div>
          </div>
          <label>
            Sonuç
            <select value={form.status} onChange={(event) => updateForm("status", event.target.value)} required>
              <option value="PASSED">Geçti</option>
              <option value="PARTIAL">Kısmi</option>
              <option value="FAILED">Kaldı</option>
            </select>
          </label>
          <label>
            Hatalı Adet
            <input value={form.defectQuantity} onChange={(event) => updateForm("defectQuantity", event.target.value)} type="number" min="0" required />
          </label>
          <label>
            Hata Nedeni
            <input value={form.defectReason} onChange={(event) => updateForm("defectReason", event.target.value)} placeholder="Çizik, ölçü hatası, malzeme..." />
          </label>
          <label>
            Not
            <input value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="İsteğe bağlı not" />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting || checkCandidates.length === 0}>
            <Plus size={18} />
            Kaydet
          </button>
        </form>
        {selectedWorkOrder ? (
          <>
            <div className="quality-context">
              <div>
                <span>İş Emri</span>
                <strong>{selectedWorkOrder.orderNo}</strong>
              </div>
              <div>
                <span>Üretim</span>
                <strong>{selectedWorkOrder.producedQuantity}</strong>
              </div>
              <div>
                <span>Fire</span>
                <strong>{selectedWorkOrder.scrapQuantity}</strong>
              </div>
              <div>
                <span>Ürün</span>
                <strong>{selectedWorkOrder.product.code}</strong>
              </div>
              <div>
                <span>Kalite Operasyonu</span>
                <strong>{selectedOperation ? `${selectedOperation.sequenceNo}. ${selectedOperation.operationName}` : "Operasyon seçilmedi"}</strong>
              </div>
            </div>
            <div className="quality-history">
              <div className="section-title-row">
                <div>
                  <h3>Üretim Geçmişi</h3>
                  <p className="muted-text">Kalite kararı için son saha kayıtları, operasyon adımları, fire nedenleri, notlar ve görseller.</p>
                </div>
              </div>
              <TraceabilityPanel traceability={selectedTraceability} />
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Zaman</th>
                      <th>Operasyon</th>
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
                    {selectedProductionLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{formatDate(log.createdAt)}</td>
                        <td>{log.workOrderOperation ? `${log.workOrderOperation.sequenceNo}. ${log.workOrderOperation.operationName}` : "-"}</td>
                        <td>{log.machine?.code ?? "-"}</td>
                        <td>{log.operator?.name ?? "-"}</td>
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
                    {selectedProductionLogs.length === 0 ? (
                      <tr>
                        <td colSpan="9">Bu iş emri için üretim kaydı bulunamadı.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
        {!isLoading && checkCandidates.length === 0 ? <p className="empty-state">Kalite girişi için önce üretim kaydı girin.</p> : null}
      </section>

      <section className="panel">
        <h2>Son Kalite Kontrolleri</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>İş Emri</th>
                <th>Ürün</th>
                <th>Operasyon</th>
                <th>Sonuç</th>
                <th>Hatalı</th>
                <th>Neden</th>
                <th>Not</th>
                <th>Kontrol Eden</th>
                <th>Kontrol Zamanı</th>
              </tr>
            </thead>
            <tbody>
              {qualityChecks.map((check) => (
                <Fragment key={check.id}>
                  <tr>
                    <td>{check.workOrder.orderNo}</td>
                    <td>{check.workOrder.product.name}</td>
                    <td>{check.workOrderOperation ? `${check.workOrderOperation.sequenceNo}. ${check.workOrderOperation.operationName}` : "-"}</td>
                    <td>
                      <span className={`status-pill quality-${check.status.toLowerCase()}`}>{QUALITY_LABELS[check.status] ?? check.status}</span>
                    </td>
                    <td>{check.defectQuantity}</td>
                    <td>{check.defectReason ?? "-"}</td>
                    <td>{check.note ? <span className="note-chip">{check.note}</span> : "-"}</td>
                    <td>{check.checkedBy.name}</td>
                    <td>{formatDate(check.checkedAt)}</td>
                  </tr>
                  {check.traceability ? (
                    <tr className="traceability-table-row">
                      <td colSpan="9">
                        <TraceabilityPanel traceability={check.traceability} compact />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {!isLoading && qualityChecks.length === 0 ? (
                <tr>
                  <td colSpan="9">Henüz kalite kontrol kaydı yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}




