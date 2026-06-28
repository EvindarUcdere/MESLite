import { AlertTriangle, ClipboardCheck, Plus } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { createScrapAction } from "../api/productionLogs.api.js";
import { createQualityCheck, getQualityChecks } from "../api/qualityChecks.api.js";
import { getWorkOrders } from "../api/workOrders.api.js";
import { useAuthStore } from "../store/authStore.js";

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

const SCRAP_DISPOSITIONS = [
  { value: "REPRODUCE", label: "Fire kadar yeniden üretilecek" },
  { value: "REWORK", label: "Yeniden işlenecek / onarılacak" },
  { value: "SCRAP", label: "Hurda ayrılacak ve telafi üretilecek" },
  { value: "CONDITIONAL_ACCEPT", label: "Şartlı kabul" }
];

const SCRAP_DISPOSITION_LABELS = Object.fromEntries(SCRAP_DISPOSITIONS.map((disposition) => [disposition.value, disposition.label]));

const QUALITY_DECISION_OPTIONS = [
  {
    value: "PASSED",
    status: "PASSED",
    label: "Geçti",
    description: "Ürün kalite standartlarına uygundur.",
    tone: "pass"
  },
  {
    value: "CONDITIONAL",
    status: "PARTIAL",
    label: "Şartlı Geçti",
    description: "Belirli şartlarla kabul edilmiştir.",
    tone: "partial",
    scrapDisposition: "CONDITIONAL_ACCEPT"
  },
  {
    value: "REWORK",
    status: "PARTIAL",
    label: "Yeniden İşlem",
    description: "Düzeltme / yeniden işlem gereklidir.",
    tone: "rework",
    scrapDisposition: "REWORK"
  },
  {
    value: "FAILED",
    status: "FAILED",
    label: "Kalite Reddi",
    description: "Ürün kalite standartlarına uygun değildir.",
    tone: "fail",
    scrapDisposition: "SCRAP"
  }
];

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
  return operation.routeOperation?.requiresQualityCheck || QUALITY_OPERATION_KEYWORDS.some((keyword) => name.includes(keyword));
}

function isPastDue(value) {
  return value ? new Date(value).getTime() < Date.now() : false;
}

function getOperationLogs(workOrder, operation) {
  return (workOrder.productionLogs ?? []).filter((log) => log.workOrderOperationId === operation.id || log.workOrderOperation?.id === operation.id);
}

function getLatestOperatorNote(logs) {
  return logs.find((log) => log.note?.trim())?.note?.trim() ?? "";
}

function getLatestScrapReason(logs) {
  const scrapLog = logs.find((log) => Number(log.scrapQuantity ?? 0) > 0);
  if (!scrapLog) {
    return "";
  }

  return SCRAP_REASON_LABELS[scrapLog.scrapReason ?? "UNKNOWN"] ?? scrapLog.scrapReason ?? "";
}

function getFirstAttachment(logs) {
  return logs.flatMap((log) => log.attachments ?? [])[0] ?? null;
}

function getOpenScrapLog(logs) {
  return logs.find((log) => Number(log.scrapQuantity ?? 0) > 0 && !log.scrapActionWorkOrderId && log.scrapActionStatus !== "NOT_REQUIRED") ?? null;
}

function getQualityPendingItems(workOrders, qualityChecks) {
  const checkedOperationIds = new Set(qualityChecks.map((check) => check.workOrderOperationId).filter(Boolean));

  return workOrders
    .flatMap((workOrder) =>
      (workOrder.operations ?? [])
        .filter((operation) => operation.status === "COMPLETED" && operation.producedQuantity > 0 && isQualityOperation(operation) && !checkedOperationIds.has(operation.id))
        .map((operation) => {
          const operationLogs = getOperationLogs(workOrder, operation);

          return {
            workOrder,
            operation,
            operationLogs,
            latestNote: getLatestOperatorNote(operationLogs),
            latestScrapReason: getLatestScrapReason(operationLogs),
            firstAttachment: getFirstAttachment(operationLogs),
            isDeliveryOverdue: isPastDue(workOrder.plannedEndDate)
          };
        })
    )
    .sort((a, b) => Number(b.isDeliveryOverdue) - Number(a.isDeliveryOverdue) || new Date(b.operation.completedAt ?? b.workOrder.updatedAt).getTime() - new Date(a.operation.completedAt ?? a.workOrder.updatedAt).getTime());
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
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const canRecordQualityDecision = user?.role === "QUALITY_STAFF";
  const [workOrders, setWorkOrders] = useState([]);
  const [qualityChecks, setQualityChecks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    workOrderId: "",
    workOrderOperationId: "",
    decisionType: "PASSED",
    status: "PASSED",
    defectQuantity: 0,
    defectReason: "",
    note: "",
    scrapDisposition: "REPRODUCE",
    scrapResolutionQuantity: 0,
    scrapDispositionNote: ""
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
  const selectedPendingItem = pendingQualityItems.find((item) => item.operation.id === form.workOrderOperationId);
  const selectedProductionLogs = selectedWorkOrder && selectedOperation ? getOperationLogs(selectedWorkOrder, selectedOperation) : selectedWorkOrder?.productionLogs ?? [];
  const selectedOpenScrapLog = getOpenScrapLog(selectedProductionLogs);
  const selectedTraceability = getSelectedWorkOrderTrace(selectedWorkOrder);
  const selectedProducedQuantity = Number(selectedOperation?.producedQuantity ?? selectedWorkOrder?.producedQuantity ?? 0);
  const selectedScrapQuantity = Number(selectedOperation?.scrapQuantity ?? selectedWorkOrder?.scrapQuantity ?? 0);
  const selectedTotalQuantity = selectedProducedQuantity + selectedScrapQuantity;
  const selectedGoodPercent = selectedTotalQuantity > 0 ? Math.round((selectedProducedQuantity / selectedTotalQuantity) * 100) : 100;
  const targetWorkOrderId = searchParams.get("workOrderId");
  const targetOperationId = searchParams.get("operationId");

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
      ...(field === "workOrderId" ? { workOrderOperationId: "" } : {}),
      ...(field === "scrapDisposition" && value === "CONDITIONAL_ACCEPT" ? { scrapResolutionQuantity: 0 } : {}),
      ...(field === "scrapDisposition" && value !== "CONDITIONAL_ACCEPT" && selectedOpenScrapLog ? { scrapResolutionQuantity: selectedOpenScrapLog.scrapQuantity } : {})
    }));
  }

  function selectQualityTarget(workOrder, operation, operationLogs) {
    const openScrapLog = getOpenScrapLog(operationLogs);

    setForm((current) => ({
      ...current,
      workOrderId: workOrder.id,
      workOrderOperationId: operation.id,
      decisionType: "PASSED",
      status: "PASSED",
      defectQuantity: 0,
      defectReason: "",
      note: "",
      scrapDisposition: "REPRODUCE",
      scrapResolutionQuantity: openScrapLog?.scrapQuantity ?? 0,
      scrapDispositionNote: openScrapLog ? "Kalite kontrol sonrası fire kararı verildi." : ""
    }));

    window.setTimeout(() => {
      document.getElementById("quality-entry-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function selectPendingQualityItem(item) {
    selectQualityTarget(item.workOrder, item.operation, item.operationLogs);
  }

  useEffect(() => {
    if (!targetWorkOrderId || isLoading || workOrders.length === 0) {
      return;
    }

    const targetWorkOrder = checkCandidates.find((workOrder) => workOrder.id === targetWorkOrderId);

    if (!targetWorkOrder) {
      return;
    }

    const targetOperation =
      (targetWorkOrder.operations ?? []).find((operation) => operation.id === targetOperationId && operation.producedQuantity > 0) ??
      (targetWorkOrder.operations ?? []).find((operation) => operation.producedQuantity > 0 && isQualityOperation(operation)) ??
      (targetWorkOrder.operations ?? []).find((operation) => operation.producedQuantity > 0);

    if (!targetOperation || form.workOrderOperationId === targetOperation.id) {
      return;
    }

    selectQualityTarget(targetWorkOrder, targetOperation, getOperationLogs(targetWorkOrder, targetOperation));
  }, [targetWorkOrderId, targetOperationId, isLoading, workOrders, checkCandidates, form.workOrderOperationId]);

  function selectQualityDecision(option) {
    setForm((current) => ({
      ...current,
      decisionType: option.value,
      status: option.status,
      ...(selectedOpenScrapLog && option.scrapDisposition
        ? {
            scrapDisposition: option.scrapDisposition,
            scrapResolutionQuantity: option.scrapDisposition === "CONDITIONAL_ACCEPT" ? 0 : selectedOpenScrapLog.scrapQuantity
          }
        : {})
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canRecordQualityDecision) {
      setError("Kalite kararını yalnızca Kalite Personeli kaydedebilir.");
      return;
    }

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

      if (selectedOpenScrapLog) {
        const scrapResolutionQuantity = Number(form.scrapResolutionQuantity);

        if (form.scrapDisposition !== "CONDITIONAL_ACCEPT" && scrapResolutionQuantity <= 0) {
          setError("Fire telafisi için aksiyon adedi girin.");
          return;
        }

        if (scrapResolutionQuantity > selectedOpenScrapLog.scrapQuantity) {
          setError(`Fire aksiyon adedi fire miktarını aşamaz. Fire: ${selectedOpenScrapLog.scrapQuantity} adet.`);
          return;
        }
      }

      await createQualityCheck({
        workOrderId: form.workOrderId,
        ...(form.workOrderOperationId ? { workOrderOperationId: form.workOrderOperationId } : {}),
        status: form.status,
        defectQuantity,
        ...(form.defectReason ? { defectReason: form.defectReason } : {}),
        ...(form.note ? { note: form.note } : {})
      });

      if (selectedOpenScrapLog) {
        await createScrapAction(selectedOpenScrapLog.id, {
          scrapDisposition: form.scrapDisposition,
          ...(form.scrapDisposition !== "CONDITIONAL_ACCEPT" ? { scrapResolutionQuantity: Number(form.scrapResolutionQuantity) || selectedOpenScrapLog.scrapQuantity } : {}),
          scrapDispositionNote: form.scrapDispositionNote || `${SCRAP_DISPOSITION_LABELS[form.scrapDisposition]} kararı kalite ekranından verildi.`
        });
      }

      setForm((current) => ({
        ...current,
        workOrderId: "",
        workOrderOperationId: "",
        decisionType: "PASSED",
        status: "PASSED",
        defectQuantity: 0,
        defectReason: "",
        note: "",
        scrapDisposition: "REPRODUCE",
        scrapResolutionQuantity: 0,
        scrapDispositionNote: ""
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
            <h2>Kalite Sonucu Bekleyen İşler</h2>
            <p className="muted-text">Kalite kontrol gerektiren operasyonu tamamlanmış ama resmi kalite sonucu henüz girilmemiş işler.</p>
          </div>
          <span className="status-pill status-planned">{pendingQualityItems.length} bekliyor</span>
        </div>
        <div className="pending-quality-list">
          {pendingQualityItems.map((item) => (
            <button className="pending-quality-card" key={item.operation.id} type="button" onClick={() => selectPendingQualityItem(item)}>
              <div>
                <strong>{item.workOrder.orderNo}</strong>
                <span>{item.workOrder.product.name}</span>
                {item.isDeliveryOverdue ? <em className="quality-overdue-label">Teslim tarihi geçmiş</em> : null}
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
              <div className="pending-quality-evidence">
                <div>
                  <span>Operatör Notu</span>
                  <strong>{item.latestNote || "Not yok"}</strong>
                  {item.latestScrapReason ? <em>{item.latestScrapReason}</em> : null}
                </div>
                {item.firstAttachment ? (
                  <img className="pending-quality-thumb" src={getAttachmentUrl(item.firstAttachment)} alt={item.firstAttachment.fileName || "Kalite görsel kanıtı"} />
                ) : (
                  <span className="pending-quality-no-image">Görsel yok</span>
                )}
              </div>
            </button>
          ))}
          {!isLoading && pendingQualityItems.length === 0 ? <p className="empty-state">Kalite sonucu bekleyen iş yok.</p> : null}
        </div>
      </section>

      <section className="panel" id="quality-entry-panel">
        <div className="section-title-row">
          <div>
            <h2>Kalite Girişi</h2>
            <p className="muted-text">Üstteki listeden bir işi seçin, operatör notunu ve görsel kanıtı kontrol edip kalite sonucunu kaydedin.</p>
          </div>
        </div>
        {!selectedWorkOrder || !selectedOperation ? (
          <div className="quality-empty-selection">
            <ClipboardCheck size={34} />
            <strong>Kalite sonucu girmek için listeden bir iş seçin.</strong>
            <span>Seçtiğiniz işin operatör notu, görsel kanıtı ve karar formu burada açılacak.</span>
          </div>
        ) : (
          <>
            <form className="quality-result-form" onSubmit={handleSubmit}>
              <div className="quality-command-card">
                <div className="quality-command-main">
                  <span>İş Emri</span>
                  <strong>{selectedWorkOrder.orderNo}</strong>
                  <small>{selectedWorkOrder.product.name}</small>
                  {isPastDue(selectedWorkOrder.dueDate) ? <em>Teslim tarihi geçmiş</em> : null}
                </div>
                <div className="quality-command-meta">
                  <div>
                    <span>Operasyon</span>
                    <strong>
                      {selectedOperation.sequenceNo}. {selectedOperation.operationName}
                    </strong>
                    <small>{selectedOperation.machine?.code ?? "Makine yok"}</small>
                  </div>
                  <div>
                    <span>Operatör</span>
                    <strong>{selectedOperation.assignedOperator?.name ?? "Operatör yok"}</strong>
                  </div>
                  <div>
                    <span>Tarih / Saat</span>
                    <strong>{formatDate(selectedOperation.completedAt)}</strong>
                  </div>
                </div>
                <div className="quality-command-metrics">
                  <div className="quality-command-metric metric-production">
                    <span>Üretim</span>
                    <strong>{selectedOperation.producedQuantity}</strong>
                    <small>adet</small>
                  </div>
                  <div className="quality-command-metric metric-scrap">
                    <span>Fire</span>
                    <strong>{selectedOperation.scrapQuantity}</strong>
                    <small>adet</small>
                  </div>
                </div>
              </div>

              <div className="quality-result-grid">
                <section className="quality-form-card quality-review-card">
                  <div className="quality-card-title">
                    <span>1</span>
                    <h3>İnceleme Bilgileri</h3>
                  </div>
                  <div className="quality-review-columns">
                    <div className="operator-note-box">
                      <span>Operatör Notu</span>
                      <p>{selectedPendingItem?.latestNote || "Operatör notu yok."}</p>
                      {selectedPendingItem?.latestScrapReason ? <em>{selectedPendingItem.latestScrapReason}</em> : null}
                    </div>
                    <div className="quality-production-summary">
                      <span>Üretim Özeti</span>
                      <div className="quality-ring" style={{ "--quality-good": `${selectedGoodPercent}%` }}>
                        <strong>{selectedTotalQuantity}</strong>
                        <small>Toplam</small>
                      </div>
                      <div className="quality-ring-legend">
                        <span><i className="legend-good" /> Sağlam <strong>{selectedProducedQuantity}</strong></span>
                        <span><i className="legend-scrap" /> Fire <strong>{selectedScrapQuantity}</strong></span>
                      </div>
                    </div>
                  </div>
                  <div className="quality-photo-strip">
                    <span>Fotoğraf Kanıtları</span>
                    {selectedPendingItem?.firstAttachment ? (
                      <a className="quality-photo-tile" href={getAttachmentUrl(selectedPendingItem.firstAttachment)} target="_blank" rel="noreferrer">
                        <img src={getAttachmentUrl(selectedPendingItem.firstAttachment)} alt={selectedPendingItem.firstAttachment.fileName || "Kalite görsel kanıtı"} />
                      </a>
                    ) : null}
                    <div className="quality-photo-empty">Görsel kanıt yok</div>
                  </div>
                </section>

                <section className="quality-form-card quality-decision-card">
                  <div className="quality-card-title">
                    <span>2</span>
                    <h3>Kalite Kararı</h3>
                  </div>
                  <p className="muted-text">Kararınızı seçin; fire varsa alttaki fire aksiyonu bu karara göre güncellenir.</p>
                  <div className="quality-choice-list">
                    {QUALITY_DECISION_OPTIONS.map((option) => (
                      <button
                        className={`quality-choice-card quality-choice-${option.tone} ${form.decisionType === option.value ? "quality-choice-card-active" : ""}`}
                        key={option.value}
                        onClick={() => selectQualityDecision(option)}
                        type="button"
                      >
                        <span className="quality-radio-dot" />
                        <strong>{option.label}</strong>
                        <small>{option.description}</small>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="quality-form-card quality-defect-card">
                  <div className="quality-card-title">
                    <span>3</span>
                    <h3>Hata Bilgileri</h3>
                  </div>
                  <div className="quality-form-row">
                    <label>
                      Hatalı Adet
                      <input value={form.defectQuantity} onChange={(event) => updateForm("defectQuantity", event.target.value)} type="number" min="0" required />
                    </label>
                    <label>
                      Hata Türü
                      <input value={form.defectReason} onChange={(event) => updateForm("defectReason", event.target.value)} placeholder="Çizik, ölçü hatası..." />
                    </label>
                  </div>
                  <label>
                    Hata Açıklaması / Not
                    <textarea value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="Karar açıklaması veya aksiyon notu" rows="5" />
                  </label>
                </section>

                <section className="quality-form-card quality-scrap-card">
                  <div className="quality-card-title quality-card-title-spread">
                    <div>
                      <span>4</span>
                      <h3>Fire Dağıtımı ve Kararları</h3>
                    </div>
                    {selectedOpenScrapLog ? <b>Toplam fire {selectedOpenScrapLog.scrapQuantity} adet</b> : <b>Fire yok</b>}
                  </div>
                  {selectedOpenScrapLog ? (
                    <>
                      <div className="quality-scrap-alert">
                        <strong>{SCRAP_REASON_LABELS[selectedOpenScrapLog.scrapReason ?? "UNKNOWN"] ?? selectedOpenScrapLog.scrapReason}</strong>
                        <span>Bu fire kaydı için kalite/üretim aksiyonu seçilecek.</span>
                      </div>
                      <label>
                        Aksiyon
                        <select value={form.scrapDisposition} onChange={(event) => updateForm("scrapDisposition", event.target.value)} required>
                          {SCRAP_DISPOSITIONS.map((disposition) => (
                            <option key={disposition.value} value={disposition.value}>
                              {disposition.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      {form.scrapDisposition !== "CONDITIONAL_ACCEPT" ? (
                        <label>
                          Aksiyon Adedi
                          <input
                            value={form.scrapResolutionQuantity}
                            onChange={(event) => updateForm("scrapResolutionQuantity", event.target.value)}
                            type="number"
                            min="1"
                            max={selectedOpenScrapLog.scrapQuantity}
                            required
                          />
                        </label>
                      ) : null}
                      <label>
                        Fire Karar Notu
                        <input
                          value={form.scrapDispositionNote}
                          onChange={(event) => updateForm("scrapDispositionNote", event.target.value)}
                          placeholder="Örn: görsele göre yeniden üretim açıldı"
                        />
                      </label>
                    </>
                  ) : (
                    <div className="quality-info-box">Bu operasyon için açık fire kararı bulunmuyor. Sadece kalite sonucu kaydedilecek.</div>
                  )}
                </section>

                <section className="quality-form-card quality-note-card">
                  <div className="quality-card-title">
                    <span>5</span>
                    <h3>Kaydı Tamamla</h3>
                  </div>
                  <div className="quality-info-box">
                    Kaydettiğiniz kalite sonucu ilgili üretim kaydına işlenecek ve raporlarda kullanılacaktır.
                  </div>
                  <button className="primary-button quality-save-button" type="submit" disabled={isSubmitting || !canRecordQualityDecision}>
                    <Plus size={18} />
                    {canRecordQualityDecision ? "Kalite Sonucunu Kaydet" : "Yalnızca Kalite Personeli Kaydedebilir"}
                  </button>
                </section>
              </div>
            </form>
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
        )}
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




