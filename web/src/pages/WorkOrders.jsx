import { Play, Plus, Square, TimerReset } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getMachines, getProducts, getUsers } from "../api/masterData.api.js";
import { createProductionLog } from "../api/productionLogs.api.js";
import { getProductRoutes } from "../api/productRoutes.api.js";
import { getShifts } from "../api/shiftPlanning.api.js";
import { completeWorkOrderOperation, createOperationMessage, pauseWorkOrderOperation, startWorkOrderOperation } from "../api/workOrderOperations.api.js";
import { completeWorkOrder, createWorkOrder, getAvailableOperators, getWorkOrders, pauseWorkOrder, startWorkOrder } from "../api/workOrders.api.js";
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

const DOWNTIME_REASONS = [
  { value: "MACHINE_FAILURE", label: "Makine Arızası" },
  { value: "MATERIAL_WAITING", label: "Malzeme Bekleniyor" },
  { value: "QUALITY_WAITING", label: "Kalite Bekleniyor" },
  { value: "MAINTENANCE", label: "Bakım" },
  { value: "SETUP", label: "Ayar/Setup" },
  { value: "OPERATOR_BREAK", label: "Mola" },
  { value: "OTHER", label: "Diğer" }
];

const DOWNTIME_REASON_LABELS = Object.fromEntries(DOWNTIME_REASONS.map((reason) => [reason.value, reason.label]));

function minutesBetween(start, end) {
  if (!start || !end) {
    return 0;
  }

  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

function getOperationTimeMetrics(operation) {
  const plannedMinutes = operation.routeOperation?.estimatedMinutes ?? 0;
  const actualMinutes = minutesBetween(operation.startedAt, operation.completedAt ?? new Date());
  const downtimeMinutes = (operation.downtimes ?? []).reduce((sum, downtime) => sum + minutesBetween(downtime.startedAt, downtime.endedAt ?? operation.completedAt ?? new Date()), 0);
  const netMinutes = Math.max(actualMinutes - downtimeMinutes, 0);
  const delayMinutes = plannedMinutes > 0 ? Math.max(netMinutes - plannedMinutes, 0) : 0;

  return { plannedMinutes, actualMinutes, downtimeMinutes, netMinutes, delayMinutes };
}

const SCRAP_REASONS = [
  { value: "MATERIAL_DEFECT", label: "Malzeme Hatası" },
  { value: "MACHINE_SETUP", label: "Makine Ayarı" },
  { value: "OPERATOR_ERROR", label: "Operatör Hatası" },
  { value: "PROCESS_DEVIATION", label: "Proses Sapması" },
  { value: "QUALITY_REJECT", label: "Kalite Reddi" },
  { value: "OTHER", label: "Diğer" }
];

const SCRAP_DISPOSITIONS = [
  { value: "REPRODUCE", label: "Fire kadar yeniden üretilecek" },
  { value: "REWORK", label: "Yeniden işlenecek / onarılacak" },
  { value: "SCRAP", label: "Hurda ayrılacak" },
  { value: "CONDITIONAL_ACCEPT", label: "Şartlı kabul" },
  { value: "PENDING_REVIEW", label: "Kalite/yönetici inceleyecek" }
];

const MACHINE_FAMILY_RULES = [
  { family: "PRS", operationTokens: ["pres", "presleme"], machineTokens: ["prs", "pres"] },
  { family: "LZR", operationTokens: ["lazer", "kesim"], machineTokens: ["lzr", "lazer"] },
  { family: "BKM", operationTokens: ["büküm", "bukum", "abkant"], machineTokens: ["bkm", "büküm", "bukum", "abkant"] },
  { family: "CNC", operationTokens: ["cnc", "torna", "tornalama", "freze", "frezeleme"], machineTokens: ["cnc", "torna", "freze"] },
  { family: "DRL", operationTokens: ["delik", "delme", "delik delme"], machineTokens: ["drl", "delik"] },
  { family: "KYN", operationTokens: ["kaynak", "robot kaynak"], machineTokens: ["kyn", "kaynak"] },
  { family: "MNT", operationTokens: ["montaj"], machineTokens: ["mnt", "montaj"] },
  { family: "TST", operationTokens: ["fonksiyon test", "test"], machineTokens: ["tst", "test"] },
  { family: "KLT", operationTokens: ["kalite", "kontrol", "final kontrol", "ölçüm", "olcum"], machineTokens: ["klt", "kalite", "kontrol", "ölçüm", "olcum"] },
  { family: "BOY", operationTokens: ["boya", "toz boya"], machineTokens: ["boy", "boya"] },
  { family: "PKT", operationTokens: ["paket", "paketleme", "etiket"], machineTokens: ["pkt", "paket", "etiket"] }
];

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.message ?? fallback;
}

function getStartableOperation(workOrder) {
  return (workOrder.operations ?? []).find((operation) => operation.status === "PAUSED") ?? (workOrder.operations ?? []).find((operation) => operation.status === "READY");
}

function isBeforePlannedStart(workOrder) {
  return Boolean(workOrder.plannedStartDate && new Date() < new Date(workOrder.plannedStartDate));
}

function getStartBlockReason(workOrder) {
  if (!["PLANNED", "PAUSED"].includes(workOrder.status)) {
    return "Sadece planlanan veya duraklatılan iş emirleri başlatılabilir.";
  }

  if (isBeforePlannedStart(workOrder)) {
    return "Plan başlangıç tarihi gelmeden iş emri başlatılamaz.";
  }

  if (workOrder.operations?.length) {
    const startableOperation = getStartableOperation(workOrder);

    if (!startableOperation) {
      return "Başlatılabilecek hazır veya duraklatılmış operasyon yok.";
    }

    if (!startableOperation.machineId) {
      return "Başlatmak için sıradaki operasyona makine atanmalı.";
    }

    if (!startableOperation.assignedOperatorId) {
      return "Başlatmak için sıradaki operasyona operatör atanmalı.";
    }

    return "";
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
  if (isBeforePlannedStart(workOrder)) {
    return false;
  }

  return ["READY", "PAUSED"].includes(operation.status) || (isManagerOverride && isShortCompletedOperation(operation, workOrder));
}

function canPauseOperation(operation) {
  return operation.status === "IN_PROGRESS";
}

function hasOperationLog(operation) {
  return Boolean(operation._count?.productionLogs || operation.producedQuantity > 0 || operation.scrapQuantity > 0);
}

function getOperationTransferQuantity(operation, workOrder) {
  if (!operation || !workOrder) {
    return 0;
  }

  const previousOperation = (workOrder.operations ?? [])
    .filter((item) => item.sequenceNo < operation.sequenceNo)
    .sort((first, second) => second.sequenceNo - first.sequenceNo)[0];

  if (!previousOperation) {
    return workOrder.plannedQuantity;
  }

  return Math.max(previousOperation.producedQuantity, 0);
}

function canCompleteOperation(operation, workOrder, user) {
  const isManagerOverride = [ROLES.ADMIN, ROLES.PRODUCTION_MANAGER].includes(user?.role);
  const transferQuantity = getOperationTransferQuantity(operation, workOrder);
  const hasTransferQuantity = transferQuantity > 0;
  const processedQuantity = operation.producedQuantity + operation.scrapQuantity;
  const meetsTransferQuantity = !hasTransferQuantity || processedQuantity >= transferQuantity;

  return ["IN_PROGRESS", "PAUSED"].includes(operation.status) && hasOperationLog(operation) && (isManagerOverride || meetsTransferQuantity);
}

function isShortCompletedOperation(operation, workOrder) {
  const transferQuantity = getOperationTransferQuantity(operation, workOrder);
  return Boolean(operation.status === "COMPLETED" && transferQuantity > 0 && operation.producedQuantity + operation.scrapQuantity < transferQuantity);
}

function getOperationStageLabel(operation, workOrder) {
  if (isShortCompletedOperation(operation, workOrder)) {
    return "Eksik Kapandı";
  }

  return OPERATION_STAGE_LABELS[operation.status] ?? operation.status;
}

function getOperationStatusLabel(operation, workOrder) {
  if (isShortCompletedOperation(operation, workOrder)) {
    return `Eksik kapandı (${operation.producedQuantity + operation.scrapQuantity}/${getOperationTransferQuantity(operation, workOrder)})`;
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

function getWorkOrderDisplayQuantities(workOrder) {
  const operations = [...(workOrder.operations ?? [])].sort((first, second) => first.sequenceNo - second.sequenceNo);
  const latestProcessedOperation = [...operations]
    .reverse()
    .find((operation) => operation.producedQuantity > 0 || operation.scrapQuantity > 0);
  const source = latestProcessedOperation ?? null;
  const producedQuantity = source ? source.producedQuantity : workOrder.producedQuantity;
  const scrapQuantity = source ? source.scrapQuantity : workOrder.scrapQuantity;
  const processedQuantity = producedQuantity + scrapQuantity;
  const remainingQuantity = Math.max(workOrder.plannedQuantity - processedQuantity, 0);
  const progressPercent = workOrder.plannedQuantity > 0 ? Math.min(Math.round((processedQuantity / workOrder.plannedQuantity) * 100), 100) : 0;

  return {
    producedQuantity,
    scrapQuantity,
    processedQuantity,
    remainingQuantity,
    progressPercent,
    sourceOperation: source
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

function normalize(value) {
  return value?.toLocaleLowerCase("tr-TR") ?? "";
}

function compactMachineText(machine) {
  return normalize([machine?.code, machine?.name, machine?.productionLine?.name].filter(Boolean).join(" "));
}

function getMachineFamilies(machine) {
  const text = compactMachineText(machine);
  return MACHINE_FAMILY_RULES.filter((rule) => rule.machineTokens.some((token) => text.includes(token))).map((rule) => rule.family);
}

function getOperationFamilies(operationName) {
  const text = normalize(operationName);
  return MACHINE_FAMILY_RULES.filter((rule) => rule.operationTokens.some((token) => text.includes(token))).map((rule) => rule.family);
}

function isMachineCompatibleWithOperation(operation, machine) {
  if (!operation || !machine) {
    return false;
  }

  if (operation.defaultMachineId && machine.id === operation.defaultMachineId) {
    return true;
  }

  const allowedFamilies = new Set([
    ...getOperationFamilies(operation.operationName),
    ...getMachineFamilies(operation.defaultMachine)
  ]);

  if (!allowedFamilies.size) {
    return true;
  }

  const machineFamilies = getMachineFamilies(machine);
  return machineFamilies.some((family) => allowedFamilies.has(family));
}

export default function WorkOrders() {
  const [searchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const [workOrders, setWorkOrders] = useState([]);
  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [machines, setMachines] = useState([]);
  const [operators, setOperators] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [availableOperatorsByOperation, setAvailableOperatorsByOperation] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [operationMessages, setOperationMessages] = useState({});
  const [operationDowntimes, setOperationDowntimes] = useState({});
  const [focusedWorkOrderId, setFocusedWorkOrderId] = useState("");
  const [focusedOperationId, setFocusedOperationId] = useState("");
  const workOrderRowRefs = useRef(new Map());
  const [form, setForm] = useState({
    orderNo: "",
    productId: "",
    routeId: "",
    machineId: "",
    assignedOperatorId: "",
    workDate: new Date().toISOString().slice(0, 10),
    shiftId: "",
    plannedQuantity: 100
  });
  const [operationAssignments, setOperationAssignments] = useState([]);
  const [productionForm, setProductionForm] = useState({
    workOrderId: "",
    producedQuantity: 10,
    scrapQuantity: 0,
    scrapReason: "",
    scrapDisposition: "REPRODUCE",
    scrapResolutionQuantity: 0,
    scrapDispositionNote: "",
    note: ""
  });

  const activeMachines = useMemo(() => machines.filter((machine) => machine.isActive), [machines]);
  const selectedProduct = useMemo(() => products.find((product) => product.id === form.productId), [form.productId, products]);
  const availableRoutes = useMemo(() => routes.filter((route) => route.productId === form.productId && route.isActive), [form.productId, routes]);
  const selectedRoute = useMemo(() => routes.find((route) => route.id === form.routeId), [form.routeId, routes]);
  const hasRouteSelected = Boolean(selectedRoute);
  const hasMissingOperationAssignment = hasRouteSelected && operationAssignments.some((assignment) => !assignment.machineId || !assignment.assignedOperatorId);
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
  const filteredWorkOrders = useMemo(() => {
    const searchText = normalize(search.trim());

    if (!searchText) {
      return workOrders;
    }

    return workOrders.filter((workOrder) => {
      const operationNames = (workOrder.operations ?? []).map((operation) => operation.operationName).join(" ");
      const operatorNames = [
        workOrder.assignedOperator?.name,
        ...(workOrder.operations ?? []).map((operation) => operation.assignedOperator?.name)
      ].join(" ");
      const machineTexts = [
        workOrder.machine?.code,
        workOrder.machine?.name,
        ...(workOrder.operations ?? []).flatMap((operation) => [operation.machine?.code, operation.machine?.name])
      ].join(" ");
      const statusText = [STATUS_LABELS[workOrder.status], workOrder.status, getFlowRiskText(workOrder)].join(" ");
      const searchableText = [
        workOrder.orderNo,
        workOrder.product?.code,
        workOrder.product?.name,
        workOrder.route?.name,
        statusText,
        machineTexts,
        operatorNames,
        operationNames
      ].join(" ");

      return normalize(searchableText).includes(searchText);
    });
  }, [search, workOrders]);
  const canCreateManualProductionLog = user?.role === ROLES.ADMIN;

  async function loadData() {
    setError("");
    const [workOrderData, productData, routeData, machineData, userData, shiftData] = await Promise.all([getWorkOrders(), getProducts(), getProductRoutes(), getMachines(), getUsers(), getShifts()]);
    setWorkOrders(workOrderData);
    setProducts(productData);
    setRoutes(routeData);
    setMachines(machineData);
    setOperators(userData.filter((user) => user.role === "OPERATOR" && user.isActive));
    setShifts(shiftData.filter((shift) => shift.isActive));
    setForm((current) => ({
      ...current,
      shiftId: current.shiftId || shiftData.find((shift) => shift.isActive)?.id || ""
    }));
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [workOrderData, productData, routeData, machineData, userData, shiftData] = await Promise.all([getWorkOrders(), getProducts(), getProductRoutes(), getMachines(), getUsers(), getShifts()]);

        if (isMounted) {
          setWorkOrders(workOrderData);
          setProducts(productData);
          setRoutes(routeData);
          setMachines(machineData);
          setOperators(userData.filter((user) => user.role === "OPERATOR" && user.isActive));
          setShifts(shiftData.filter((shift) => shift.isActive));
          setForm((current) => ({
            ...current,
            shiftId: current.shiftId || shiftData.find((shift) => shift.isActive)?.id || ""
          }));
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

  useEffect(() => {
    const workOrderId = searchParams.get("workOrderId");
    const operationId = searchParams.get("operationId");

    if (!workOrders.length || !workOrderId) {
      return;
    }

    focusWorkOrder(workOrderId);
    setFocusedOperationId(operationId ?? "");
  }, [searchParams, workOrders]);

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
      ...(field === "productId" ? { routeId: "", machineId: "", assignedOperatorId: "" } : {}),
      ...(field === "routeId" ? { machineId: "", assignedOperatorId: "" } : {})
    }));
  }

  function updateOperationAssignment(routeOperationId, field, value) {
    setOperationAssignments((current) =>
      current.map((assignment) => (assignment.routeOperationId === routeOperationId ? { ...assignment, [field]: value } : assignment))
    );
  }

  useEffect(() => {
    if (!selectedRoute) {
      setOperationAssignments([]);
      setAvailableOperatorsByOperation({});
      return;
    }

    setOperationAssignments(
      selectedRoute.operations.map((operation) => ({
        routeOperationId: operation.id,
        sequenceNo: operation.sequenceNo,
        operationName: operation.operationName,
        machineId: operation.defaultMachineId || "",
        assignedOperatorId: ""
      }))
    );
  }, [selectedRoute?.id]);

  useEffect(() => {
    let isMounted = true;

    async function loadAvailableOperators() {
      if (!form.workDate || !operationAssignments.length) {
        setAvailableOperatorsByOperation({});
        return;
      }

      const entries = await Promise.all(
        operationAssignments.map(async (assignment) => {
          if (!assignment.machineId) {
            return [assignment.routeOperationId, []];
          }

          const available = await getAvailableOperators({
            workDate: form.workDate,
            ...(form.shiftId ? { shiftId: form.shiftId } : {}),
            machineId: assignment.machineId
          });

          return [assignment.routeOperationId, available];
        })
      );

      if (isMounted) {
        const nextAvailableOperators = Object.fromEntries(entries);
        setAvailableOperatorsByOperation(nextAvailableOperators);
        setOperationAssignments((current) =>
          current.map((assignment) => {
            if (!assignment.assignedOperatorId) {
              return assignment;
            }

            const isStillAvailable = (nextAvailableOperators[assignment.routeOperationId] ?? []).some(
              (operator) => operator.id === assignment.assignedOperatorId && operator.isAvailable
            );

            return isStillAvailable ? assignment : { ...assignment, assignedOperatorId: "" };
          })
        );
      }
    }

    loadAvailableOperators().catch(() => setAvailableOperatorsByOperation({}));

    return () => {
      isMounted = false;
    };
  }, [form.workDate, form.shiftId, operationAssignments.map((assignment) => `${assignment.routeOperationId}:${assignment.machineId}`).join("|")]);

  function updateProductionForm(field, value) {
    setProductionForm((current) => ({ ...current, [field]: value }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      if (!form.routeId) {
        setError("İş emri oluşturmak için ürüne bağlı bir rota seçin. Rota yoksa önce Rotalar ekranından tanımlayın.");
        return;
      }

      if (hasMissingOperationAssignment) {
        setError("İş emri oluşturmadan önce her operasyon için makine ve operatör seçin.");
        return;
      }

      const payload = {
        orderNo: form.orderNo,
        productId: form.productId,
        plannedQuantity: Number(form.plannedQuantity),
        plannedStartDate: form.workDate ? `${form.workDate}T00:00:00.000Z` : undefined,
        ...(form.shiftId ? { shiftId: form.shiftId } : {}),
        ...(form.routeId ? { routeId: form.routeId } : {}),
        ...(operationAssignments.length
          ? {
              operationAssignments: operationAssignments.map((assignment) => ({
                routeOperationId: assignment.routeOperationId,
                ...(assignment.machineId ? { machineId: assignment.machineId } : {}),
                ...(assignment.assignedOperatorId ? { assignedOperatorId: assignment.assignedOperatorId } : {})
              }))
            }
          : {})
      };

      await createWorkOrder(payload);
      setForm((current) => ({
        ...current,
        orderNo: "",
        routeId: "",
        plannedQuantity: 100
      }));
      setOperationAssignments([]);
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

  function updateOperationDowntime(operationId, field, value) {
    setOperationDowntimes((current) => ({
      ...current,
      [operationId]: {
        reason: "MACHINE_FAILURE",
        note: "",
        ...(current[operationId] ?? {}),
        [field]: value
      }
    }));
  }

  function pauseOperationWithReason(operationId) {
    const draft = operationDowntimes[operationId] ?? { reason: "MACHINE_FAILURE", note: "" };

    return pauseWorkOrderOperation(operationId, {
      reason: draft.reason,
      note: draft.note?.trim() || undefined
    });
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

      if (Number(productionForm.scrapQuantity) > 0 && !productionForm.scrapDisposition) {
        setError("Fire girildiğinde fire kararı seçilmelidir.");
        return;
      }

      if (
        Number(productionForm.scrapQuantity) > 0 &&
        productionForm.scrapDisposition === "REPRODUCE" &&
        Number(productionForm.scrapResolutionQuantity) <= 0
      ) {
        setError("Yeniden üretim kararı için yeniden üretilecek adet girilmelidir.");
        return;
      }

      await createProductionLog({
        workOrderId: selectedWorkOrder.id,
        machineId: selectedWorkOrder.machineId,
        producedQuantity: Number(productionForm.producedQuantity),
        scrapQuantity: Number(productionForm.scrapQuantity),
        ...(Number(productionForm.scrapQuantity) > 0
          ? {
              scrapReason: productionForm.scrapReason,
              scrapDisposition: productionForm.scrapDisposition,
              scrapResolutionQuantity: Number(productionForm.scrapResolutionQuantity),
              ...(productionForm.scrapDispositionNote ? { scrapDispositionNote: productionForm.scrapDispositionNote } : {})
            }
          : {}),
        ...(productionForm.note ? { note: productionForm.note } : {})
      });

      setProductionForm((current) => ({
        ...current,
        producedQuantity: 10,
        scrapQuantity: 0,
        scrapReason: "",
        scrapDisposition: "REPRODUCE",
        scrapResolutionQuantity: 0,
        scrapDispositionNote: "",
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
            <select value={form.routeId} onChange={(event) => updateForm("routeId", event.target.value)} disabled={!form.productId || !availableRoutes.length} required>
              <option value="">{form.productId && !availableRoutes.length ? "Bu ürün için rota yok" : "Rota seçin"}</option>
              {availableRoutes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name} ({route.operations.length} adım)
                </option>
              ))}
            </select>
          </label>
          <label>
            Planlanan Adet
            <input value={form.plannedQuantity} onChange={(event) => updateForm("plannedQuantity", event.target.value)} type="number" min="1" required />
          </label>
          <label>
            Plan Başlangıç Tarihi
            <input value={form.workDate} onChange={(event) => updateForm("workDate", event.target.value)} type="date" required />
          </label>
          <label>
            Vardiya
            <select value={form.shiftId} onChange={(event) => updateForm("shiftId", event.target.value)}>
              <option value="">Tüm vardiyalar</option>
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.name} ({shift.startTime}-{shift.endTime})
                </option>
              ))}
            </select>
          </label>
          {form.productId ? (
            <div className={`route-readiness-card ${availableRoutes.length ? "is-ready" : "is-blocked"}`}>
              <div>
                <strong>{selectedProduct?.name ?? "Seçili ürün"}</strong>
                <span>
                  {availableRoutes.length
                    ? `${availableRoutes.length} aktif rota bulundu. İş emri operasyon adımları üzerinden planlanacak.`
                    : "Bu ürüne bağlı aktif rota yok. İş emri oluşturmadan önce rota tanımlayın."}
                </span>
              </div>
              {!availableRoutes.length ? (
                <Link className="text-link" to="/routes">
                  Rota tanımla
                </Link>
              ) : null}
            </div>
          ) : null}
          {selectedRoute ? (
            <div className="operation-assignment-panel">
              <div>
                <strong>Operasyon Atamaları</strong>
                <p className="muted-text">Her üretim adımı için makine ve operatör seçin. İş emri bu operasyon akışıyla sahaya iner.</p>
              </div>
              <div className={`assignment-summary ${hasMissingOperationAssignment ? "is-warning" : "is-ready"}`}>
                {hasMissingOperationAssignment ? "Eksik atama var: tüm adımlar tamamlanmadan iş emri oluşturulamaz." : "Tüm operasyon atamaları hazır."}
              </div>
              {operationAssignments.map((assignment) => {
                const availableOperators = availableOperatorsByOperation[assignment.routeOperationId] ?? [];
                const selectableOperators = availableOperators.filter((operator) => operator.isAvailable);
                const routeOperation = selectedRoute.operations.find((operation) => operation.id === assignment.routeOperationId);
                const compatibleMachines = activeMachines.filter((machine) => isMachineCompatibleWithOperation(routeOperation, machine));
                const machineOptions = compatibleMachines.length ? compatibleMachines : activeMachines.filter((machine) => machine.id === routeOperation?.defaultMachineId);

                return (
                  <div className="operation-assignment-row" key={assignment.routeOperationId}>
                    <div>
                      <strong>
                        {assignment.sequenceNo}. {assignment.operationName}
                      </strong>
                    </div>
                    <label>
                      Makine
                      <select value={assignment.machineId} onChange={(event) => updateOperationAssignment(assignment.routeOperationId, "machineId", event.target.value)}>
                        <option value="">Makine seçin</option>
                        {machineOptions.map((machine) => (
                          <option key={machine.id} value={machine.id}>
                            {machine.code} - {machine.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Uygun Operatör
                      <select
                        value={assignment.assignedOperatorId}
                        onChange={(event) => updateOperationAssignment(assignment.routeOperationId, "assignedOperatorId", event.target.value)}
                        disabled={!assignment.machineId || !selectableOperators.length}
                      >
                        <option value="">{selectableOperators.length ? "Operatör seçin" : "Uygun operatör yok"}</option>
                        {selectableOperators.map((operator) => (
                          <option key={operator.id} value={operator.id}>
                            {operator.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {assignment.machineId && availableOperators.length && !selectableOperators.length ? (
                      <p className="form-error">Bu tarih/vardiya/makine için atanabilir operatör yok. Önce Vardiya Planı ekranından çalışma günü ve makine yetkinliği tanımlayın.</p>
                    ) : null}
                    {assignment.machineId && !availableOperators.length ? (
                      <p className="form-error">Bu makine için aktif operatör bulunamadı. Kullanıcı ve vardiya planı ekranından operatör/yetkinlik ekleyin.</p>
                    ) : null}
                    {!machineOptions.length ? (
                      <p className="form-error">Bu operasyon tipi için uygun aktif makine bulunamadı. Rota üzerindeki varsayılan makineyi veya makine tanımlarını kontrol edin.</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
          <button className="primary-button" type="submit" disabled={isSubmitting || !form.routeId || hasMissingOperationAssignment}>
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
        <div className="work-order-list-toolbar">
          <label className="work-order-search">
            Arama
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="İş emri, ürün, makine, operatör veya durum ara"
            />
          </label>
          <span>{isLoading ? "Liste yükleniyor..." : `${filteredWorkOrders.length}/${workOrders.length} iş emri gösteriliyor`}</span>
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
              {filteredWorkOrders.map((workOrder) => {
                const displayQuantities = getWorkOrderDisplayQuantities(workOrder);
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
                        {displayQuantities.producedQuantity}/{workOrder.plannedQuantity} ({displayQuantities.progressPercent}%)
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
                              const timeMetrics = getOperationTimeMetrics(operation);

                              return (
                                <div
                                  key={operation.id}
                                  className={`work-order-operation-chip operation-${operation.status.toLowerCase().replace("_", "-")} ${
                                    isShortCompletedOperation(operation, workOrder) ? "operation-short-completed" : ""
                                  } ${focusedOperationId === operation.id ? "focused-operation-chip" : ""}`}
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
                                    {operation.startedAt ? (
                                      <small>
                                        Hedef: {timeMetrics.plannedMinutes || "-"} dk • Gerçek: {timeMetrics.actualMinutes} dk • Duruş: {timeMetrics.downtimeMinutes} dk • Gecikme:{" "}
                                        {timeMetrics.delayMinutes > 0 ? `+${timeMetrics.delayMinutes} dk` : "Yok"}
                                      </small>
                                    ) : null}
                                    <small>Operatör: {operation.assignedOperator?.name ?? "-"}</small>
                                    <small>
                                      Önceki: {previousOperation?.assignedOperator?.name ?? "-"} / Sonraki: {nextOperation?.assignedOperator?.name ?? "-"}
                                    </small>
                                    {(operation.downtimes ?? []).length ? (
                                      <div className="operation-message-row message-stoppage">
                                        <span>Son Duruş</span>
                                        <p>
                                          {DOWNTIME_REASON_LABELS[operation.downtimes[0].reason] ?? operation.downtimes[0].reason}
                                          {operation.downtimes[0].note ? ` - ${operation.downtimes[0].note}` : ""}
                                        </p>
                                      </div>
                                    ) : null}
                                    {canPauseOperation(operation) ? (
                                      <div className="operation-message-form">
                                        <select
                                          value={operationDowntimes[operation.id]?.reason ?? "MACHINE_FAILURE"}
                                          onChange={(event) => updateOperationDowntime(operation.id, "reason", event.target.value)}
                                        >
                                          {DOWNTIME_REASONS.map((reason) => (
                                            <option key={reason.value} value={reason.value}>
                                              {reason.label}
                                            </option>
                                          ))}
                                        </select>
                                        <input
                                          value={operationDowntimes[operation.id]?.note ?? ""}
                                          onChange={(event) => updateOperationDowntime(operation.id, "note", event.target.value)}
                                          placeholder="Duruş notu"
                                        />
                                      </div>
                                    ) : null}
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
                                        onClick={() => runAction(() => pauseOperationWithReason(operation.id), "Operasyon duraklatılamadı.")}
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
                                            : "Operatör için devredilen adet işlenmeli; eksik işlemi yalnızca yönetici kapatabilir."
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
              {!isLoading && workOrders.length > 0 && filteredWorkOrders.length === 0 ? (
                <tr>
                  <td colSpan="9">Arama kriterine uyan iş emri bulunamadı.</td>
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
              <input
                value={productionForm.scrapQuantity}
                onChange={(event) => {
                  updateProductionForm("scrapQuantity", event.target.value);
                  if (productionForm.scrapDisposition === "REPRODUCE") {
                    updateProductionForm("scrapResolutionQuantity", event.target.value);
                  }
                }}
                type="number"
                min="0"
                required
              />
            </label>
            {Number(productionForm.scrapQuantity) > 0 ? (
              <>
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
                <label>
                  Fire Kararı
                  <select
                    value={productionForm.scrapDisposition}
                    onChange={(event) => {
                      updateProductionForm("scrapDisposition", event.target.value);
                      if (event.target.value === "REPRODUCE") {
                        updateProductionForm("scrapResolutionQuantity", productionForm.scrapQuantity);
                      }
                    }}
                    required
                  >
                    {SCRAP_DISPOSITIONS.map((disposition) => (
                      <option key={disposition.value} value={disposition.value}>
                        {disposition.label}
                      </option>
                    ))}
                  </select>
                </label>
                {productionForm.scrapDisposition === "REPRODUCE" ? (
                  <label>
                    Yeniden Üretilecek Adet
                    <input
                      value={productionForm.scrapResolutionQuantity}
                      onChange={(event) => updateProductionForm("scrapResolutionQuantity", event.target.value)}
                      type="number"
                      min="1"
                      max={productionForm.scrapQuantity}
                      required
                    />
                  </label>
                ) : null}
                <label>
                  Fire Karar Notu
                  <input
                    value={productionForm.scrapDispositionNote}
                    onChange={(event) => updateProductionForm("scrapDispositionNote", event.target.value)}
                    placeholder="Örn: eksik adet yeniden üretime alınacak"
                  />
                </label>
              </>
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

