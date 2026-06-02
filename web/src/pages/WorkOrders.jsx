import { Play, Plus, Square, TimerReset } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { getMachines, getProducts, getUsers } from "../api/masterData.api.js";
import { createProductionLog } from "../api/productionLogs.api.js";
import { getProductRoutes } from "../api/productRoutes.api.js";
import { completeWorkOrderOperation, createOperationMessage, pauseWorkOrderOperation, startWorkOrderOperation } from "../api/workOrderOperations.api.js";
import { completeWorkOrder, createWorkOrder, getWorkOrders, pauseWorkOrder, startWorkOrder } from "../api/workOrders.api.js";
import { useSocket } from "../hooks/useSocket.js";
import { useAuthStore } from "../store/authStore.js";
import { ROLES } from "../utils/roles.js";

const STATUS_LABELS = {
  PLANNED: "Planlandı",
  IN_PROGRESS: "Üretimde",
  PAUSED: "Duraklatıldı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal"
};

const OPERATION_STATUS_LABELS = {
  WAITING: "Bekliyor",
  READY: "Hazır",
  IN_PROGRESS: "Üretimde",
  PAUSED: "Durakladı",
  COMPLETED: "Tamamlandı"
};

const OPERATION_STAGE_LABELS = {
  WAITING: "Sırada",
  READY: "Şu Anki Adım",
  IN_PROGRESS: "Şu Anki Adım",
  PAUSED: "Durakladı",
  COMPLETED: "Bitti"
};

const MESSAGE_SEVERITY_LABELS = {
  INFO: "Bilgi",
  WARNING: "Uyarı",
  QUALITY_ALERT: "Kalite",
  STOPPAGE: "Duruş"
};

const SCRAP_REASONS = [
  { value: "MATERIAL_DEFECT", label: "Malzeme Hatası" },
  { value: "MACHINE_SETUP", label: "Makine Ayarı" },
  { value: "OPERATOR_ERROR", label: "Operatör Hatası" },
  { value: "PROCESS_DEVIATION", label: "Proses Sapması" },
  { value: "QUALITY_REJECT", label: "Kalite Reddi" },
  { value: "OTHER", label: "Diğer" }
];

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message ?? fallback;
}

function getStartBlockReason(workOrder) {
  if (!["PLANNED", "PAUSED"].includes(workOrder.status)) {
    return "Sadece planlanan veya duraklatılan iş emirleri başlatılabilir.";
  }

  if (!workOrder.machineId) {
    return "Başlatmak için makine atanmalı.";
  }

  if (!workOrder.assignedOperatorId) {
    return "Başlatmak için operatör atanmalı.";
  }

  return "";
}

function canPause(workOrder) {
  return workOrder.status === "IN_PROGRESS";
}

function canComplete(workOrder) {
  return ["IN_PROGRESS", "PAUSED"].includes(workOrder.status) && workOrder.producedQuantity > 0;
}

function canStartOperation(operation, workOrder, user) {
  const isManagerOverride = [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER].includes(user?.role);
  return ["READY", "PAUSED"].includes(operation.status) || (isManagerOverride && isShortCompletedOperation(operation, workOrder));
}

function canPauseOperation(operation) {
  return operation.status === "IN_PROGRESS";
}

function hasOperationLog(operation) {
  return Boolean(operation._count?.productionLogs || operation.producedQuantity > 0 || operation.scrapQuantity > 0);
}

function canCompleteOperation(operation, workOrder, user) {
  const isManagerOverride = [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER].includes(user?.role);
  const hasPlannedQuantity = workOrder?.plannedQuantity > 0;
  const meetsPlannedQuantity = !hasPlannedQuantity || operation.producedQuantity >= workOrder.plannedQuantity;

  return ["IN_PROGRESS", "PAUSED"].includes(operation.status) && hasOperationLog(operation) && (isManagerOverride || meetsPlannedQuantity);
}

function isShortCompletedOperation(operation, workOrder) {
  return Boolean(operation.status === "COMPLETED" && workOrder.plannedQuantity > 0 && operation.producedQuantity < workOrder.plannedQuantity);
}

function getOperationStageLabel(operation, workOrder) {
  if (isShortCompletedOperation(operation, workOrder)) {
    return "Eksik Kapandı";
  }

  return OPERATION_STAGE_LABELS[operation.status] ?? operation.status;
}

function getOperationStatusLabel(operation, workOrder) {
  if (isShortCompletedOperation(operation, workOrder)) {
    return `Eksik kapandı (${operation.producedQuantity}/${workOrder.plannedQuantity})`;
  }

  return OPERATION_STATUS_LABELS[operation.status] ?? operation.status;
}

function getOperationProgress(operations = []) {
  const completed = operations.filter((operation) => operation.status === "COMPLETED").length;
  const activeOperation =
    operations.find((operation) => ["IN_PROGRESS", "READY", "PAUSED"].includes(operation.status)) ??
    operations.find((operation) => operation.status === "WAITING");
  const remaining = Math.max(operations.length - completed, 0);

  return {
    completed,
    activeOperation,
    remaining,
    total: operations.length
  };
}

function getFlowRiskLevel(workOrder) {
  if (workOrder.operations?.some((operation) => isShortCompletedOperation(operation, workOrder))) {
    return "critical";
  }

  if (workOrder.operations?.some((operation) => operation.status === "PAUSED")) {
    return "warning";
  }

  if (workOrder.operations?.some((operation) => (operation.messages ?? []).length > 0)) {
    return "info";
  }

  return "normal";
}

function getFlowRiskText(workOrder) {
  const riskLevel = getFlowRiskLevel(workOrder);

  if (riskLevel === "critical") {
    return "Eksik kapanan operasyon var";
  }

  if (riskLevel === "warning") {
    return "Duruş/ara verme var";
  }

  if (riskLevel === "info") {
    return "Operasyon mesajı var";
  }

  return "Akış normal";
}

function getLatestOperationMessage(workOrder) {
  return (workOrder.operations ?? [])
    .flatMap((operation) =>
      (operation.messages ?? []).map((message) => ({
        ...message,
        operationName: operation.operationName
      }))
    )
    .sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt))[0];
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

export default function WorkOrders() {
  const user = useAuthStore((state) => state.user);
  const [workOrders, setWorkOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [machines, setMachines] = useState([]);
  const [operators, setOperators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [operationMessages, setOperationMessages] = useState({});
  const [focusedWorkOrderId, setFocusedWorkOrderId] = useState("");
  const workOrderRowRefs = useRef(new Map());
  const [form, setForm] = useState({
    orderNo: "",
    productId: "",
    routeId: "",
    machineId: "",
    assignedOperatorId: "",
    plannedQuantity: 100
  });
  const [productionForm, setProductionForm] = useState({
    workOrderId: "",
    producedQuantity: 10,
    scrapQuantity: 0,
    scrapReason: "",
    note: ""
  });

  const activeMachines = useMemo(() => machines.filter((machine) => machine.isActive), [machines]);
  const availableRoutes = useMemo(() => routes.filter((route) => route.productId === form.productId && route.isActive), [form.productId, routes]);
  const productionCandidates = useMemo(
    () => workOrders.filter((workOrder) => workOrder.status === "IN_PROGRESS" && workOrder.machineId && workOrder.assignedOperatorId),
    [workOrders]
  );
  const activeWorkOrders = useMemo(() => workOrders.filter((workOrder) => ["IN_PROGRESS", "PAUSED", "PLANNED"].includes(workOrder.status)), [workOrders]);
  const flowRiskItems = useMemo(
    () =>
      workOrders
        .filter((workOrder) => workOrder.operations?.length && getFlowRiskLevel(workOrder) !== "normal")
        .map((workOrder) => ({
          workOrder,
          riskLevel: getFlowRiskLevel(workOrder),
          riskText: getFlowRiskText(workOrder),
          progress: getOperationProgress(workOrder.operations),
          latestMessage: getLatestOperationMessage(workOrder)
        })),
    [workOrders]
  );
  const shortCompletedOperationCount = useMemo(
    () => workOrders.reduce((total, workOrder) => total + (workOrder.operations ?? []).filter((operation) => isShortCompletedOperation(operation, workOrder)).length, 0),
    [workOrders]
  );
  const pausedOperationCount = useMemo(
    () => workOrders.reduce((total, workOrder) => total + (workOrder.operations ?? []).filter((operation) => operation.status === "PAUSED").length, 0),
    [workOrders]
  );
  const operationMessageCount = useMemo(
    () => workOrders.reduce((total, workOrder) => total + (workOrder.operations ?? []).reduce((sum, operation) => sum + (operation.messages?.length ?? 0), 0), 0),
    [workOrders]
  );
  const canCreateManualProductionLog = user?.role === ROLES.ADMIN;

  async function loadData() {
    setError("");
    const [workOrderData, productData, routeData, machineData, userData] = await Promise.all([getWorkOrders(), getProducts(), getProductRoutes(), getMachines(), getUsers()]);
    setWorkOrders(workOrderData);
    setProducts(productData);
    setRoutes(routeData);
    setMachines(machineData);
    setOperators(userData.filter((user) => user.role === "OPERATOR" && user.isActive));
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [workOrderData, productData, routeData, machineData, userData] = await Promise.all([getWorkOrders(), getProducts(), getProductRoutes(), getMachines(), getUsers()]);

        if (isMounted) {
          setWorkOrders(workOrderData);
          setProducts(productData);
          setRoutes(routeData);
          setMachines(machineData);
          setOperators(userData.filter((user) => user.role === "OPERATOR" && user.isActive));
        }
      } catch (_error) {
        if (isMounted) {
          setError("İş emri verileri yüklenemedi.");
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

  useSocket({
    "workOrder:updated": () => loadData(),
    "workOrderOperation:updated": () => loadData(),
    "operationMessage:created": () => loadData(),
    "production:logged": () => loadData()
  });

  function updateForm(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "productId" ? { routeId: "" } : {})
    }));
  }

  function updateProductionForm(field, value) {
    setProductionForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const payload = {
        orderNo: form.orderNo,
        productId: form.productId,
        plannedQuantity: Number(form.plannedQuantity),
        ...(form.routeId ? { routeId: form.routeId } : {}),
        ...(form.machineId ? { machineId: form.machineId } : {}),
        ...(form.assignedOperatorId ? { assignedOperatorId: form.assignedOperatorId } : {})
      };

      await createWorkOrder(payload);
      setForm((current) => ({
        ...current,
        orderNo: "",
        routeId: "",
        plannedQuantity: 100
      }));
      await loadData();
    } catch (error) {
      setError(getApiErrorMessage(error, "İş emri oluşturulamadı."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function runAction(action, fallbackMessage = "İşlem tamamlanamadı.") {
    setError("");

    try {
      await action();
      await loadData();
    } catch (error) {
      setError(getApiErrorMessage(error, fallbackMessage));
    }
  }

  function updateOperationMessage(operationId, field, value) {
    setOperationMessages((current) => ({
      ...current,
      [operationId]: {
        message: "",
        severity: "INFO",
        ...(current[operationId] ?? {}),
        [field]: value
      }
    }));
  }

  function focusWorkOrder(workOrderId) {
    setFocusedWorkOrderId(workOrderId);

    window.requestAnimationFrame(() => {
      workOrderRowRefs.current.get(workOrderId)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  }

  async function handleOperationMessage(operationId) {
    const draft = operationMessages[operationId] ?? { message: "", severity: "INFO" };
    const message = draft.message.trim();

    if (!message) {
      setError("Operasyon mesajı boş olamaz.");
      return;
    }

    await runAction(
      () =>
        createOperationMessage(operationId, {
          message,
          severity: draft.severity
        }),
      "Operasyon mesajı gönderilemedi."
    );

    setOperationMessages((current) => ({
      ...current,
      [operationId]: {
        ...draft,
        message: ""
      }
    }));
  }

  async function handleProductionEntry(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const selectedWorkOrder = workOrders.find((workOrder) => workOrder.id === productionForm.workOrderId);

      if (!selectedWorkOrder?.machineId) {
        setError("Makine atanmış ve başlatılmış bir iş emri seçin.");
        return;
      }

      if (Number(productionForm.producedQuantity) === 0 && Number(productionForm.scrapQuantity) === 0) {
        setError("Üretim veya fire adedinden en az biri sıfırdan büyük olmalı.");
        return;
      }

      if (Number(productionForm.scrapQuantity) > 0 && !productionForm.scrapReason) {
        setError("Fire girildiğinde fire nedeni seçilmelidir.");
        return;
      }

      await createProductionLog({
        workOrderId: selectedWorkOrder.id,
        machineId: selectedWorkOrder.machineId,
        producedQuantity: Number(productionForm.producedQuantity),
        scrapQuantity: Number(productionForm.scrapQuantity),
        ...(Number(productionForm.scrapQuantity) > 0 ? { scrapReason: productionForm.scrapReason } : {}),
        ...(productionForm.note ? { note: productionForm.note } : {})
      });

      setProductionForm((current) => ({
        ...current,
        producedQuantity: 10,
        scrapQuantity: 0,
        scrapReason: "",
        note: ""
      }));
      await loadData();
    } catch (error) {
      setError(getApiErrorMessage(error, "Üretim girişi kaydedilemedi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>İş Emirleri</h1>
          <p>İş emirlerini planlayın, makine ve operatör atayın; saha üretim kayıtlarını mobil operatör uygulamasından takip edin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="panel flow-control-panel">
        <div className="section-title-row">
          <div>
            <h2>Dikkat Gerektiren İş Emirleri</h2>
            <p className="muted-text">Duruş, eksik kapanma veya yeni operasyon mesajı olan işleri gösterir. Satıra tıklayınca ilgili timeline'a gidilir.</p>
          </div>
        </div>
        <div className="flow-control-summary">
          <article>
            <span>Aktif iş emri</span>
            <strong>{activeWorkOrders.length}</strong>
          </article>
          <article className={shortCompletedOperationCount ? "flow-critical" : ""}>
            <span>Eksik kapanan operasyon</span>
            <strong>{shortCompletedOperationCount}</strong>
          </article>
          <article className={pausedOperationCount ? "flow-warning" : ""}>
            <span>Duraklayan operasyon</span>
            <strong>{pausedOperationCount}</strong>
          </article>
          <article>
            <span>Operasyon mesajı</span>
            <strong>{operationMessageCount}</strong>
          </article>
        </div>
        <div className="flow-risk-list">
          {flowRiskItems.slice(0, 6).map(({ workOrder, riskLevel, riskText, progress, latestMessage }) => (
            <button key={workOrder.id} type="button" className={`flow-risk-row flow-${riskLevel}`} onClick={() => focusWorkOrder(workOrder.id)} title="İlgili iş emri timeline'ına git">
              <div>
                <strong>{workOrder.orderNo}</strong>
                <span>
                  {workOrder.product.name} • {progress.activeOperation?.operationName ?? "Operasyon yok"}
                </span>
                {latestMessage ? (
                  <span>
                    Son mesaj: {latestMessage.operationName} - {latestMessage.message}
                  </span>
                ) : null}
              </div>
              <small>
                {workOrder.producedQuantity}/{workOrder.plannedQuantity} adet
              </small>
              <em>{riskText}</em>
            </button>
          ))}
          {!isLoading && flowRiskItems.length === 0 ? <p className="empty-state">Dikkat gerektiren iş emri yok. Duruş, eksik kapanma veya operasyon mesajı olduğunda burada görünür.</p> : null}
        </div>
      </section>

      <section className="panel">
        <h2>İş Emri Oluştur</h2>
        <form className="work-order-form" onSubmit={handleCreate}>
          <label>
            İş Emri No
            <input value={form.orderNo} onChange={(event) => updateForm("orderNo", event.target.value)} placeholder="WO-001" required />
          </label>
          <label>
            Ürün
            <select value={form.productId} onChange={(event) => updateForm("productId", event.target.value)} required>
              <option value="">Ürün seçin</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.code} - {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Rota
            <select value={form.routeId} onChange={(event) => updateForm("routeId", event.target.value)} disabled={!form.productId}>
              <option value="">Rota olmadan oluştur</option>
              {availableRoutes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name} ({route.operations.length} adım)
                </option>
              ))}
            </select>
          </label>
          <label>
            Makine
            <select value={form.machineId} onChange={(event) => updateForm("machineId", event.target.value)}>
              <option value="">Sonra ata</option>
              {activeMachines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.code} - {machine.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Operatör
            <select value={form.assignedOperatorId} onChange={(event) => updateForm("assignedOperatorId", event.target.value)}>
              <option value="">Sonra ata</option>
              {operators.map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Planlanan Adet
            <input value={form.plannedQuantity} onChange={(event) => updateForm("plannedQuantity", event.target.value)} type="number" min="1" required />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            <Plus size={18} />
            {isSubmitting ? "Oluşturuluyor..." : "Oluştur"}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="section-title-row">
          <div>
            <h2>İş Emri Listesi</h2>
            <p className="muted-text">Başlatma, duraklatma ve tamamlama butonları yönetici müdahalesi içindir; normal üretim akışı mobil operatör ekranından ilerler.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>İş Emri</th>
                <th>Ürün</th>
                <th>Rota</th>
                <th>Durum</th>
                <th>İlerleme</th>
                <th>Makine</th>
                <th>Operatör</th>
                <th>Güncelleme</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {workOrders.map((workOrder) => {
                const progress = workOrder.plannedQuantity > 0 ? Math.round((workOrder.producedQuantity / workOrder.plannedQuantity) * 100) : 0;
                const startBlockReason = getStartBlockReason(workOrder);
                const startDisabled = Boolean(startBlockReason);
                const pauseDisabled = !canPause(workOrder);
                const completeDisabled = !canComplete(workOrder);
                const operationProgress = getOperationProgress(workOrder.operations);

                return (
                  <Fragment key={workOrder.id}>
                    <tr
                      ref={(node) => {
                        if (node) {
                          workOrderRowRefs.current.set(workOrder.id, node);
                        } else {
                          workOrderRowRefs.current.delete(workOrder.id);
                        }
                      }}
                      className={focusedWorkOrderId === workOrder.id ? "selected-row focused-work-order-row" : undefined}
                    >
                      <td>{workOrder.orderNo}</td>
                      <td>{workOrder.product.name}</td>
                      <td>{workOrder.route?.name ?? "-"}</td>
                      <td>
                        <span className={`status-pill status-${workOrder.status.toLowerCase().replace("_", "-")}`}>{STATUS_LABELS[workOrder.status] ?? workOrder.status}</span>
                      </td>
                      <td>
                        {workOrder.producedQuantity}/{workOrder.plannedQuantity} ({progress}%)
                      </td>
                      <td>{workOrder.machine?.code ?? "-"}</td>
                      <td>{workOrder.assignedOperator?.name ?? "-"}</td>
                      <td>{formatDate(workOrder.updatedAt)}</td>
                      <td>
                        <div className="action-row">
                          <button
                            type="button"
                            onClick={() => runAction(() => startWorkOrder(workOrder.id), "İş emri başlatılamadı.")}
                            disabled={startDisabled}
                            title={startBlockReason || "Başlat"}
                          >
                            <Play size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => runAction(() => pauseWorkOrder(workOrder.id), "İş emri duraklatılamadı.")}
                            disabled={pauseDisabled}
                            title={pauseDisabled ? "Sadece üretimdeki iş emirleri duraklatılabilir." : "Duraklat"}
                          >
                            <TimerReset size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => runAction(() => completeWorkOrder(workOrder.id), "İş emri tamamlanamadı.")}
                            disabled={completeDisabled}
                            title={completeDisabled ? "Tamamlamak için iş emri başlamış ve üretim girişi yapılmış olmalı." : "Tamamla"}
                          >
                            <Square size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {workOrder.operations?.length ? (
                      <tr className={`operation-timeline-row ${focusedWorkOrderId === workOrder.id ? "focused-operation-timeline-row" : ""}`}>
                        <td colSpan="9">
                          <div className="operation-flow-summary">
                            <div>
                              <span>Ürün şu anda</span>
                              <strong>{operationProgress.activeOperation?.operationName ?? "Operasyon yok"}</strong>
                            </div>
                            <div>
                              <span>Biten</span>
                              <strong>
                                {operationProgress.completed}/{operationProgress.total}
                              </strong>
                            </div>
                            <div>
                              <span>Kalan</span>
                              <strong>{operationProgress.remaining}</strong>
                            </div>
                          </div>
                          <div className="work-order-operation-timeline">
                            {workOrder.operations.map((operation, index) => {
                              const previousOperation = workOrder.operations[index - 1];
                              const nextOperation = workOrder.operations[index + 1];

                              return (
                                <div
                                  key={operation.id}
                                  className={`work-order-operation-chip operation-${operation.status.toLowerCase().replace("_", "-")} ${
                                    isShortCompletedOperation(operation, workOrder) ? "operation-short-completed" : ""
                                  }`}
                                >
                                  <span>{operation.sequenceNo}</span>
                                  <div>
                                    <div className="operation-chip-heading">
                                      <strong>{operation.operationName}</strong>
                                      <em>{getOperationStageLabel(operation, workOrder)}</em>
                                    </div>
                                    <small>
                                      {getOperationStatusLabel(operation, workOrder)}
                                      {operation.machine ? ` • ${operation.machine.code}` : ""}
                                    </small>
                                    <small>
                                      Üretim / Fire: {operation.producedQuantity} / {operation.scrapQuantity}
                                    </small>
                                    <small>Operatör: {operation.assignedOperator?.name ?? "-"}</small>
                                    <small>
                                      Önceki: {previousOperation?.assignedOperator?.name ?? "-"} / Sonraki: {nextOperation?.assignedOperator?.name ?? "-"}
                                    </small>
                                    <div className="operation-action-row">
                                      <button
                                        type="button"
                                        onClick={() => runAction(() => startWorkOrderOperation(operation.id), "Operasyon başlatılamadı.")}
                                        disabled={!canStartOperation(operation, workOrder, user)}
                                        title={isShortCompletedOperation(operation, workOrder) ? "Eksik kapanan operasyonu yeniden üretime al" : "Operasyonu başlat"}
                                      >
                                        <Play size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => runAction(() => pauseWorkOrderOperation(operation.id), "Operasyon duraklatılamadı.")}
                                        disabled={!canPauseOperation(operation)}
                                        title="Operasyonu duraklat"
                                      >
                                        <TimerReset size={14} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => runAction(() => completeWorkOrderOperation(operation.id), "Operasyon tamamlanamadı.")}
                                        disabled={!canCompleteOperation(operation, workOrder, user)}
                                        title={
                                          canCompleteOperation(operation, workOrder, user)
                                            ? "Operasyonu tamamla"
                                            : "Operatör için planlanan adet tamamlanmalı; eksik üretimi yalnızca yönetici kapatabilir."
                                        }
                                      >
                                        <Square size={14} />
                                      </button>
                                    </div>
                                    <div className="operation-message-box">
                                      <strong>Operasyon Mesajları</strong>
                                      {(operation.messages ?? []).slice(0, 3).map((message) => (
                                        <div key={message.id} className={`operation-message-row message-${message.severity.toLowerCase().replace("_", "-")}`}>
                                          <span>{MESSAGE_SEVERITY_LABELS[message.severity] ?? message.severity}</span>
                                          <p>
                                            {message.message} - {message.sender.name}
                                          </p>
                                        </div>
                                      ))}
                                      {(operation.messages ?? []).length === 0 ? <p className="operation-message-empty">Henüz mesaj yok.</p> : null}
                                      <div className="operation-message-form">
                                        <select
                                          value={operationMessages[operation.id]?.severity ?? "INFO"}
                                          onChange={(event) => updateOperationMessage(operation.id, "severity", event.target.value)}
                                        >
                                          <option value="INFO">Bilgi</option>
                                          <option value="WARNING">Uyarı</option>
                                          <option value="QUALITY_ALERT">Kalite</option>
                                          <option value="STOPPAGE">Duruş</option>
                                        </select>
                                        <input
                                          value={operationMessages[operation.id]?.message ?? ""}
                                          onChange={(event) => updateOperationMessage(operation.id, "message", event.target.value)}
                                          placeholder="Bu adım için mesaj bırak"
                                        />
                                        <button type="button" onClick={() => handleOperationMessage(operation.id)}>
                                          Gönder
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {!isLoading && workOrders.length === 0 ? (
                <tr>
                  <td colSpan="9">Henüz iş emri yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {canCreateManualProductionLog ? (
        <section className="panel">
          <div className="section-title-row">
            <div>
              <h2>Manuel Üretim Girişi</h2>
              <p className="muted-text">Sadece admin düzeltmesi için kullanılır. Normal üretim kayıtları mobil operatör ekranından girilmelidir.</p>
            </div>
          </div>
          <form className="work-order-form" onSubmit={handleProductionEntry}>
            <label>
              İş Emri
              <select value={productionForm.workOrderId} onChange={(event) => updateProductionForm("workOrderId", event.target.value)} required>
                <option value="">Başlatılmış iş emri seçin</option>
                {productionCandidates.map((workOrder) => (
                  <option key={workOrder.id} value={workOrder.id}>
                    {workOrder.orderNo} - {workOrder.product.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Üretilen Adet
              <input
                value={productionForm.producedQuantity}
                onChange={(event) => updateProductionForm("producedQuantity", event.target.value)}
                type="number"
                min="0"
                required
              />
            </label>
            <label>
              Fire Adedi
              <input value={productionForm.scrapQuantity} onChange={(event) => updateProductionForm("scrapQuantity", event.target.value)} type="number" min="0" required />
            </label>
            {Number(productionForm.scrapQuantity) > 0 ? (
              <label>
                Fire Nedeni
                <select value={productionForm.scrapReason} onChange={(event) => updateProductionForm("scrapReason", event.target.value)} required>
                  <option value="">Neden seçin</option>
                  {SCRAP_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label>
              Not
              <input value={productionForm.note} onChange={(event) => updateProductionForm("note", event.target.value)} placeholder="İsteğe bağlı not" />
            </label>
            <button className="primary-button" type="submit" disabled={isSubmitting || productionCandidates.length === 0}>
              <Plus size={18} />
              Kaydet
            </button>
          </form>
          {!isLoading && productionCandidates.length === 0 ? <p className="empty-state">Üretim girişi için önce operatör ve makine atanmış bir iş emrini başlatın.</p> : null}
        </section>
      ) : (
        <section className="panel info-panel">
          <h2>Saha Üretim Akışı</h2>
          <p className="muted-text">
            Üretim ve fire adetleri operatör tarafından mobil uygulamada girilir. Bu ekran planlama, atama, durum takibi ve gerektiğinde yönetici müdahalesi için kullanılır.
          </p>
        </section>
      )}
    </div>
  );
}
