import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Vibration } from "react-native";
import { getStoredSession, login, logout } from "./src/api/auth.api";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "./src/api/notifications.api";
import { createProductionLog, uploadProductionLogImage } from "./src/api/productionLogs.api";
import { registerPushToken } from "./src/api/pushTokens.api";
import { createMobileSocket } from "./src/api/socket";
import { completeWorkOrderOperation, createOperationMessage, pauseWorkOrderOperation, startWorkOrderOperation } from "./src/api/workOrderOperations.api";
import { getWorkOrders } from "./src/api/workOrders.api";

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

let nativeNotificationsModulePromise = null;

const MOBILE_VIEW_ORDER = ["WORKS", "DETAIL", "PRODUCTION"];

async function getNativeNotificationsModule() {
  if (Platform.OS === "web") {
    return null;
  }

  if (!nativeNotificationsModulePromise) {
    nativeNotificationsModulePromise = import("expo-notifications").then((module) => {
      module.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false
        })
      });

      if (Platform.OS === "android") {
        module.setNotificationChannelAsync("default", {
          name: "MES Lite Bildirimleri",
          importance: module.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 120, 250],
          lightColor: "#2d7d76",
          sound: "default"
        }).catch(() => {});
      }

      return module;
    });
  }

  return nativeNotificationsModulePromise;
}

const OPERATION_STAGE_LABELS = {
  WAITING: "Sırada",
  READY: "Şu Anki Adım",
  IN_PROGRESS: "Şu Anki Adım",
  PAUSED: "Durakladı",
  COMPLETED: "Bitti"
};

const MESSAGE_SEVERITIES = [
  { value: "INFO", label: "Bilgi" },
  { value: "WARNING", label: "Uyarı" },
  { value: "QUALITY_ALERT", label: "Kalite" },
  { value: "STOPPAGE", label: "Duruş" }
];

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

const QUICK_QUANTITIES = [1, 5, 10, 25];
const SCRAP_REASONS = [
  { value: "MATERIAL_DEFECT", label: "Malzeme Hatası" },
  { value: "MACHINE_SETUP", label: "Makine Ayarı" },
  { value: "OPERATOR_ERROR", label: "Operatör Hatası" },
  { value: "PROCESS_DEVIATION", label: "Proses Sapması" },
  { value: "QUALITY_REJECT", label: "Kalite Reddi" },
  { value: "OTHER", label: "Diğer" }
];
const fullScreenHeight = Platform.OS === "web" ? "100vh" : "100%";

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message ?? fallback;
}

function isUnauthorizedError(error) {
  return error?.response?.status === 401;
}

function getConnectionMessage(error) {
  if (error?.message === "Network Error" || error?.code === "ERR_NETWORK") {
    return "Backend bağlantısı kurulamadı. API server açık mı kontrol edin.";
  }

  return getErrorMessage(error, "İş emirleri yüklenemedi.");
}

function getRemainingQuantity(workOrder) {
  return Math.max(workOrder.plannedQuantity - workOrder.producedQuantity, 0);
}

function getOperationRemainingQuantity(operation, workOrder) {
  if (!operation || !workOrder) {
    return 0;
  }

  return Math.max(getOperationTransferQuantity(operation, workOrder) - operation.producedQuantity - operation.scrapQuantity, 0);
}

function getOperationTransferQuantity(operation, workOrder) {
  if (!operation || !workOrder) {
    return 0;
  }

  const operations = workOrder.operations ?? [];
  const previousOperation = operations
    .filter((item) => item.sequenceNo < operation.sequenceNo)
    .sort((first, second) => second.sequenceNo - first.sequenceNo)[0];

  if (!previousOperation) {
    return workOrder.plannedQuantity;
  }

  return Math.max(previousOperation.producedQuantity - previousOperation.scrapQuantity, 0);
}

function getProgressPercent(workOrder) {
  if (!workOrder.plannedQuantity) {
    return 0;
  }

  return Math.min(Math.round((workOrder.producedQuantity / workOrder.plannedQuantity) * 100), 100);
}

function getMachineName(workOrder) {
  return workOrder.machine?.name ?? "Makine atanmamış";
}

function operatorHasOperation(workOrder, userId) {
  return Boolean(userId && workOrder.operations?.some((operation) => operation.assignedOperatorId === userId));
}

function isClosedWorkOrder(workOrder) {
  return ["COMPLETED", "CANCELLED"].includes(workOrder?.status);
}

function isShortClosedWorkOrder(workOrder) {
  return Boolean(workOrder?.status === "COMPLETED" && workOrder.producedQuantity < workOrder.plannedQuantity);
}

function getWorkOrderStatusLabel(workOrder) {
  if (isShortClosedWorkOrder(workOrder)) {
    return "Eksik Kapandı";
  }

  return STATUS_LABELS[workOrder.status] ?? workOrder.status;
}

function isShortCompletedOperation(operation, workOrder) {
  return Boolean(
    operation?.status === "COMPLETED" &&
      getOperationTransferQuantity(operation, workOrder) > 0 &&
      operation.producedQuantity + operation.scrapQuantity < getOperationTransferQuantity(operation, workOrder)
  );
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

  return {
    activeOperation,
    completed,
    remaining: Math.max(operations.length - completed, 0),
    total: operations.length
  };
}

function getWorkOrderFlowText(workOrder) {
  if (!workOrder.operations?.length) {
    return "Operasyon yok";
  }

  if (isShortClosedWorkOrder(workOrder)) {
    return `Eksik kapandı (${workOrder.producedQuantity}/${workOrder.plannedQuantity})`;
  }

  if (workOrder.status === "COMPLETED") {
    return "Akış tamamlandı";
  }

  if (workOrder.status === "CANCELLED") {
    return "İptal edildi";
  }

  return getOperationProgress(workOrder.operations).activeOperation?.operationName ?? "Operasyon bekliyor";
}

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

function canStartOperation(operation, workOrder) {
  return !isClosedWorkOrder(workOrder) && ["READY", "PAUSED"].includes(operation.status);
}

function canPauseOperation(operation, workOrder) {
  return !isClosedWorkOrder(workOrder) && operation.status === "IN_PROGRESS";
}

function hasOperationLog(operation) {
  return Boolean(operation._count?.productionLogs || operation.producedQuantity > 0 || operation.scrapQuantity > 0);
}

function canCompleteOperation(operation, workOrder, user) {
  const isManagerOverride = ["ADMIN", "PRODUCTION_MANAGER"].includes(user?.role);
  const transferQuantity = getOperationTransferQuantity(operation, workOrder);
  const hasTransferQuantity = transferQuantity > 0;
  const meetsTransferQuantity = !hasTransferQuantity || operation.producedQuantity + operation.scrapQuantity >= transferQuantity;

  return !isClosedWorkOrder(workOrder) && ["IN_PROGRESS", "PAUSED"].includes(operation.status) && hasOperationLog(operation) && (isManagerOverride || meetsTransferQuantity);
}

function canLogProductionForOperation(operation, userId, workOrder) {
  return Boolean(!isClosedWorkOrder(workOrder) && operation?.assignedOperatorId === userId && ["READY", "IN_PROGRESS", "PAUSED"].includes(operation.status) && operation.machineId);
}

function hasActionableOperationForUser(workOrder, userId) {
  return Boolean(
    userId &&
      !isClosedWorkOrder(workOrder) &&
      workOrder.operations?.some((operation) => operation.assignedOperatorId === userId && ["READY", "IN_PROGRESS", "PAUSED"].includes(operation.status))
  );
}

function hasCompletedOperationForUser(workOrder, userId) {
  return Boolean(userId && workOrder.operations?.some((operation) => operation.assignedOperatorId === userId && operation.status === "COMPLETED"));
}

function getMyCurrentOperationText(workOrder, userId) {
  const actionableOperation = workOrder.operations?.find((operation) => operation.assignedOperatorId === userId && ["READY", "IN_PROGRESS", "PAUSED"].includes(operation.status));

  if (actionableOperation) {
    return `${actionableOperation.operationName} sizde`;
  }

  const completedOperation = [...(workOrder.operations ?? [])]
    .reverse()
    .find((operation) => operation.assignedOperatorId === userId && operation.status === "COMPLETED");

  if (completedOperation && !isClosedWorkOrder(workOrder)) {
    return `${completedOperation.operationName} bitti, akış devam ediyor`;
  }

  return "Size atanmış adım yok";
}

function playNotificationSound() {
  if (Platform.OS === "web") {
    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext;

    if (AudioContextClass) {
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.24);
    }
  } else {
    Vibration.vibrate(250);
  }
}

async function ensureSystemNotificationPermission() {
  if (Platform.OS === "web") {
    if (!("Notification" in globalThis)) {
      return false;
    }

    if (globalThis.Notification.permission === "granted") {
      return true;
    }

    if (globalThis.Notification.permission === "denied") {
      return false;
    }

    const permission = await globalThis.Notification.requestPermission();
    return permission === "granted";
  }

  const Notifications = await getNativeNotificationsModule();
  if (!Notifications) {
    return false;
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function showSystemNotification({ title, body }) {
  const hasPermission = await ensureSystemNotificationPermission();

  if (!hasPermission) {
    return;
  }

  if (Platform.OS === "web") {
    new globalThis.Notification(title, { body });
    return;
  }

  const Notifications = await getNativeNotificationsModule();
  if (!Notifications) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: "default"
    },
    trigger: null
  });
}

async function getExpoPushTokenForDevice() {
  if (Platform.OS === "web") {
    return null;
  }

  const Notifications = await getNativeNotificationsModule();
  if (!Notifications) {
    return null;
  }

  const hasPermission = await ensureSystemNotificationPermission();
  if (!hasPermission) {
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const tokenResult = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return tokenResult.data;
  } catch (_error) {
    return null;
  }
}

function getOperationMessageWorkOrderId(message) {
  return message?.workOrderOperation?.workOrder?.id ?? message?.workOrderOperation?.workOrderId ?? null;
}

function getOperationWorkOrderId(operation) {
  return operation?.workOrder?.id ?? operation?.workOrderId ?? null;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("operator@meslite.local");
  const [password, setPassword] = useState("Admin123!");
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [selectedOperationId, setSelectedOperationId] = useState("");
  const [activeMobileView, setActiveMobileView] = useState("WORKS");
  const [producedQuantity, setProducedQuantity] = useState("10");
  const [scrapQuantity, setScrapQuantity] = useState("0");
  const [scrapReason, setScrapReason] = useState("");
  const [note, setNote] = useState("");
  const [isCriticalAlert, setIsCriticalAlert] = useState(false);
  const [alertSeverity, setAlertSeverity] = useState("WARNING");
  const [selectedImage, setSelectedImage] = useState(null);
  const [operationMessageDrafts, setOperationMessageDrafts] = useState({});
  const [operationDowntimeDrafts, setOperationDowntimeDrafts] = useState({});
  const [notificationCounts, setNotificationCounts] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const selectedWorkOrderIdRef = useRef("");
  const appStateRef = useRef(AppState.currentState);

  const assignedWorkOrders = useMemo(
    () => workOrders.filter((workOrder) => operatorHasOperation(workOrder, user?.id)),
    [user, workOrders]
  );
  const activeAssignedWorkOrders = useMemo(() => assignedWorkOrders.filter((workOrder) => hasActionableOperationForUser(workOrder, user?.id)), [assignedWorkOrders, user?.id]);
  const handoffAssignedWorkOrders = useMemo(
    () => assignedWorkOrders.filter((workOrder) => !isClosedWorkOrder(workOrder) && !hasActionableOperationForUser(workOrder, user?.id) && hasCompletedOperationForUser(workOrder, user?.id)),
    [assignedWorkOrders, user?.id]
  );
  const closedAssignedWorkOrders = useMemo(() => assignedWorkOrders.filter((workOrder) => isClosedWorkOrder(workOrder)), [assignedWorkOrders]);
  const selectedWorkOrder = assignedWorkOrders.find((workOrder) => workOrder.id === selectedWorkOrderId);
  const selectedOperationProgress = selectedWorkOrder ? getOperationProgress(selectedWorkOrder.operations) : null;
  const mySelectedOperations = selectedWorkOrder?.operations?.filter((operation) => operation.assignedOperatorId === user?.id) ?? [];
  const productionCandidates = assignedWorkOrders.flatMap((workOrder) =>
    (workOrder.operations ?? [])
      .filter((operation) => canLogProductionForOperation(operation, user?.id, workOrder))
      .map((operation) => ({ ...operation, workOrder }))
  );
  const selectedProductionCandidate = productionCandidates.find((operation) => operation.id === selectedOperationId);
  const selectedProductionWorkOrder = selectedProductionCandidate?.workOrder ?? null;
  const rawSelectedProductionOperation = selectedProductionCandidate ?? null;
  const selectedProductionOperation =
    rawSelectedProductionOperation && canLogProductionForOperation(rawSelectedProductionOperation, user?.id, selectedProductionWorkOrder)
      ? { ...rawSelectedProductionOperation, workOrder: selectedProductionWorkOrder ?? rawSelectedProductionOperation.workOrder }
      : null;
  const displayedProductionCandidates =
    selectedWorkOrder && !isClosedWorkOrder(selectedWorkOrder)
      ? productionCandidates.filter((operation) => operation.workOrder.id === selectedWorkOrder.id)
      : productionCandidates;
  const selectedProgressPercent = selectedWorkOrder ? getProgressPercent(selectedWorkOrder) : 0;
  const selectedProductionRemaining = selectedProductionOperation ? getOperationRemainingQuantity(selectedProductionOperation, selectedProductionWorkOrder) : 0;
  const selectedProductionTransferQuantity = selectedProductionOperation ? getOperationTransferQuantity(selectedProductionOperation, selectedProductionWorkOrder) : 0;
  const runningWorkOrderCount = activeAssignedWorkOrders.filter((workOrder) => workOrder.status === "IN_PROGRESS").length;
  const totalRemainingQuantity = assignedWorkOrders.reduce((total, workOrder) => total + getRemainingQuantity(workOrder), 0);
  const productionBlockReason = rawSelectedProductionOperation
    ? !rawSelectedProductionOperation.machineId
      ? "Bu operasyon için makine atanmadığı için üretim kaydı girilemez."
      : !["READY", "IN_PROGRESS", "PAUSED"].includes(rawSelectedProductionOperation.status)
        ? "Bu operasyon üretim girişi durumunda değil."
        : rawSelectedProductionOperation.assignedOperatorId !== user?.id
          ? "Bu operasyon size atanmadığı için üretim kaydı girilemez."
          : ""
    : "Üretim girişi için bir operasyon seçin.";

  useEffect(() => {
    selectedWorkOrderIdRef.current = selectedWorkOrderId;
  }, [selectedWorkOrderId]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;

      if (nextState === "active" && user) {
        loadNotifications();
        loadWorkOrders({ preserveMessage: true });
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user?.id]);

  useEffect(() => {
    if (user) {
      ensureSystemNotificationPermission().catch(() => {});
    }
  }, [user?.id]);

  async function clearExpiredSession() {
    await logout();
    setUser(null);
    setWorkOrders([]);
    setNotifications([]);
    setUnreadNotificationCount(0);
    setSelectedWorkOrderId("");
    setSelectedOperationId("");
    setSuccessMessage("");
    setError("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
  }

  async function loadWorkOrders({ preserveMessage = false } = {}) {
    setError("");
    if (!preserveMessage) {
      setSuccessMessage("");
    }

    try {
      const data = await getWorkOrders();
      setWorkOrders(data);
    } catch (loadError) {
      if (isUnauthorizedError(loadError)) {
        await clearExpiredSession();
        return;
      }

      setError(getConnectionMessage(loadError));
    }
  }

  async function loadNotifications() {
    try {
      const response = await getNotifications({ limit: 50 });
      setNotifications(response.data);
      setUnreadNotificationCount(response.meta.unreadCount);
    } catch (notificationError) {
      if (isUnauthorizedError(notificationError)) {
        await clearExpiredSession();
      }
    }
  }

  async function registerDevicePushToken() {
    try {
      const token = await getExpoPushTokenForDevice();

      if (!token) {
        return;
      }

      await registerPushToken({
        token,
        platform: Platform.OS,
        deviceName: Platform.OS === "web" ? "Web" : "Mobile"
      });
    } catch (_error) {
      // Push token registration should never block production work.
    }
  }

  async function handleMarkNotificationRead(notificationId) {
    try {
      const response = await markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((notification) => (notification.id === notificationId ? { ...notification, readAt: notification.readAt ?? new Date().toISOString() } : notification))
      );
      setUnreadNotificationCount(response.meta.unreadCount);
    } catch (_error) {
      setError("Bildirim okundu olarak işaretlenemedi.");
    }
  }

  async function handleMarkAllNotificationsRead() {
    try {
      const response = await markAllNotificationsRead();
      const now = new Date().toISOString();
      setNotifications((current) => current.map((notification) => ({ ...notification, readAt: notification.readAt ?? now })));
      setUnreadNotificationCount(response.meta.unreadCount);
    } catch (_error) {
      setError("Bildirimler okundu olarak işaretlenemedi.");
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const session = await getStoredSession();

        if (session.token && session.user && isMounted) {
          setUser(session.user);
          await loadWorkOrders();
          await loadNotifications();
          await registerDevicePushToken();
        }
      } catch (_error) {
        if (isMounted) {
          setError("Kayıtlı oturum okunamadı. Lütfen tekrar giriş yapın.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const socket = createMobileSocket();
    const refreshWorkOrders = (options) => {
      loadWorkOrders(options);
    };
    const handleOperationMessageCreated = (message) => {
      const workOrderId = getOperationMessageWorkOrderId(message);
      const operation = { operationName: "Operasyon", status: "INFO", ...(message?.workOrderOperation ?? {}) };

      if (workOrderId && message?.senderId !== user.id) {
        playNotificationSound();

        setSuccessMessage(
          operation.status === "READY"
            ? `Yeni operasyon size devredildi: ${operation.operationName}. Üretime başlayabilirsiniz.`
            : `${operation.operationName} operasyonu ${OPERATION_STATUS_LABELS[operation.status] ?? operation.status.toLowerCase()} durumuna alındı.`
        );

        setSuccessMessage("Yeni operasyon mesajı alındı.");

        if (selectedWorkOrderIdRef.current !== workOrderId) {
          setNotificationCounts((current) => ({
            ...current,
            [workOrderId]: (current[workOrderId] ?? 0) + 1
          }));
        }
      }

      refreshWorkOrders({ preserveMessage: true });
    };
    const handleWorkOrderOperationUpdated = (operation) => {
      const workOrderId = getOperationWorkOrderId(operation);
      const isAssignedToCurrentUser = operation?.assignedOperatorId === user.id;
      const isActionableStatus = ["READY", "IN_PROGRESS", "PAUSED"].includes(operation?.status);

      if (workOrderId && isAssignedToCurrentUser && isActionableStatus) {
        playNotificationSound();
        setSuccessMessage(
          operation.status === "READY"
            ? `Yeni operasyon size devredildi: ${operation.operationName}. Üretime başlayabilirsiniz.`
            : `${operation.operationName} operasyonu ${OPERATION_STATUS_LABELS[operation.status] ?? operation.status.toLowerCase()} durumuna alındı.`
        );

        if (selectedWorkOrderIdRef.current !== workOrderId) {
          setNotificationCounts((current) => ({
            ...current,
            [workOrderId]: (current[workOrderId] ?? 0) + 1
          }));
        }
      }

      refreshWorkOrders({ preserveMessage: true });
    };
    const handleNotificationCreated = (notification) => {
      if (notification.recipientId !== user.id) {
        return;
      }

      playNotificationSound();
      setSuccessMessage(notification.title);
      setNotifications((current) => [notification, ...current.filter((item) => item.id !== notification.id)]);
      setUnreadNotificationCount((current) => current + 1);

      const workOrderId = notification.metadata?.workOrderId ?? (notification.entityType === "WorkOrder" ? notification.entityId : null);
      if (workOrderId && selectedWorkOrderIdRef.current !== workOrderId) {
        setNotificationCounts((current) => ({
          ...current,
          [workOrderId]: (current[workOrderId] ?? 0) + 1
        }));
      }

      showSystemNotification({
        title: notification.title,
        body: notification.message
      }).catch(() => {});
    };

    socket.on("connect", () => {
      socket.emit("join:dashboard");
    });
    socket.on("operationMessage:created", handleOperationMessageCreated);
    socket.on("workOrderOperation:updated", handleWorkOrderOperationUpdated);
    socket.on("notification:created", handleNotificationCreated);
    socket.on("workOrder:updated", refreshWorkOrders);
    socket.on("production:logged", refreshWorkOrders);
    socket.on("connect_error", () => {
      loadNotifications();
      refreshWorkOrders({ preserveMessage: true });
    });

    const syncInterval = setInterval(() => {
      if (appStateRef.current === "active") {
        loadNotifications();
        refreshWorkOrders({ preserveMessage: true });
      }
    }, 15000);

    return () => {
      clearInterval(syncInterval);
      socket.emit("leave:dashboard");
      socket.disconnect();
    };
  }, [user?.id]);

  async function handleLogin() {
    setError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const session = await login({ email, password });
      setUser(session.user);
      await loadWorkOrders();
      await loadNotifications();
      await registerDevicePushToken();
    } catch (loginError) {
      setError(getErrorMessage(loginError, "Giriş yapılamadı."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    await logout();
    setUser(null);
    setWorkOrders([]);
    setNotifications([]);
    setUnreadNotificationCount(0);
    setSelectedWorkOrderId("");
    setSelectedOperationId("");
  }

  async function runAction(action, fallbackMessage) {
    setError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      await action();
      await loadWorkOrders();
      return true;
    } catch (actionError) {
      if (isUnauthorizedError(actionError)) {
        await clearExpiredSession();
        return false;
      }

      setError(getErrorMessage(actionError, fallbackMessage));
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateOperationMessageDraft(operationId, field, value) {
    setOperationMessageDrafts((current) => ({
      ...current,
      [operationId]: {
        message: "",
        severity: "INFO",
        ...(current[operationId] ?? {}),
        [field]: value
      }
    }));
  }

  function updateOperationDowntimeDraft(operationId, field, value) {
    setOperationDowntimeDrafts((current) => ({
      ...current,
      [operationId]: {
        reason: "MACHINE_FAILURE",
        note: "",
        ...(current[operationId] ?? {}),
        [field]: value
      }
    }));
  }

  async function handleOperationAction(action, successText, fallbackMessage) {
    const isSuccess = await runAction(action, fallbackMessage);
    if (isSuccess) {
      setSuccessMessage(successText);
    }
  }

  async function handlePauseOperation(operationId) {
    const draft = operationDowntimeDrafts[operationId] ?? { reason: "MACHINE_FAILURE", note: "" };

    await handleOperationAction(
      () =>
        pauseWorkOrderOperation(operationId, {
          reason: draft.reason,
          note: draft.note?.trim() || undefined
        }),
      "Operasyon duraklatıldı. Duruş nedeni kaydedildi.",
      "Operasyon duraklatılamadı."
    );
  }

  async function handleOperationMessage(operationId) {
    const draft = operationMessageDrafts[operationId] ?? { message: "", severity: "INFO" };
    const message = draft.message.trim();

    if (!message) {
      setError("Operasyon mesajı boş olamaz.");
      return;
    }

    const isSuccess = await runAction(
      () =>
        createOperationMessage(operationId, {
          message,
          severity: draft.severity
        }),
      "Operasyon mesajı gönderilemedi."
    );

    if (isSuccess) {
      setOperationMessageDrafts((current) => ({
        ...current,
        [operationId]: {
          ...draft,
          message: ""
        }
      }));
      setSuccessMessage("Operasyon mesajı gönderildi.");
    }
  }

  async function handleProductionEntry() {
    const produced = Number(producedQuantity);
    const scrap = Number(scrapQuantity);

    setError("");
    setSuccessMessage("");

    if (!selectedProductionOperation?.machineId || !selectedProductionWorkOrder) {
      setError(productionBlockReason || "Üretim girişi için size atanmış hazır, üretimde veya duraklatılmış operasyon seçin.");
      return;
    }

    if (!Number.isFinite(produced) || !Number.isFinite(scrap) || produced < 0 || scrap < 0) {
      setError("Üretim ve fire adedi sıfır veya pozitif sayı olmalı.");
      return;
    }

    if (produced === 0 && scrap === 0 && !note.trim()) {
      setError("Üretim ve fire 0 ise mutlaka açıklama notu girin. Örn: Makine hatası nedeniyle üretim başlamadı.");
      return;
    }

    if (scrap > 0 && !scrapReason) {
      setError("Fire girildiğinde fire nedeni seçilmelidir.");
      return;
    }

    if (isCriticalAlert && !note.trim()) {
      setError("Kritik uyarı için not girilmelidir.");
      return;
    }

    if (produced > selectedProductionRemaining) {
      setError(`Üretilen adet kalan miktarı aşamaz. Kalan: ${selectedProductionRemaining} adet.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const productionLog = await createProductionLog({
        workOrderId: selectedProductionWorkOrder.id,
        workOrderOperationId: selectedProductionOperation.id,
        machineId: selectedProductionOperation.machineId,
        producedQuantity: produced,
        scrapQuantity: scrap,
        ...(scrap > 0 ? { scrapReason } : {}),
        ...(isCriticalAlert ? { isCriticalAlert, alertSeverity } : {}),
        ...(note ? { note } : {})
      });

      if (selectedImage) {
        await uploadProductionLogImage(productionLog.id, selectedImage);
      }

      await loadWorkOrders();
      setSuccessMessage(`${produced} üretim ve ${scrap} fire kaydı alındı${selectedImage ? ", görsel eklendi." : "."}`);
      setProducedQuantity("10");
      setScrapQuantity("0");
      setScrapReason("");
      setNote("");
      setIsCriticalAlert(false);
      setAlertSeverity("WARNING");
      setSelectedImage(null);
    } catch (productionError) {
      if (isUnauthorizedError(productionError)) {
        await clearExpiredSession();
        return;
      }

      setError(getErrorMessage(productionError, "Üretim girişi kaydedilemedi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function fillQuickQuantity(quantity) {
    if (!selectedProductionOperation) {
      return;
    }

    setProducedQuantity(String(Math.min(quantity, selectedProductionRemaining)));
  }

  function setPickedImage(result) {
    if (!result.canceled && result.assets?.[0]) {
      setSelectedImage(result.assets[0]);
    }
  }

  function selectWorkOrder(workOrder) {
    setSelectedWorkOrderId(workOrder.id);
    setActiveMobileView("DETAIL");
    setNotificationCounts((current) => {
      const next = { ...current };
      delete next[workOrder.id];
      return next;
    });

    const nextProductionOperation = (workOrder.operations ?? []).find((operation) => canLogProductionForOperation(operation, user?.id, workOrder));
    setSelectedOperationId(nextProductionOperation?.id ?? "");
  }

  function moveMobileView(direction) {
    setActiveMobileView((currentView) => {
      const currentIndex = MOBILE_VIEW_ORDER.indexOf(currentView);
      const nextIndex = Math.min(Math.max(currentIndex + direction, 0), MOBILE_VIEW_ORDER.length - 1);
      const nextView = MOBILE_VIEW_ORDER[nextIndex];

      if (nextView === "DETAIL" && !selectedWorkOrder) {
        return currentView;
      }

      if (nextView === "PRODUCTION" && !selectedProductionOperation) {
        return currentView;
      }

      return nextView;
    });
  }

  const mobileViewPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => Math.abs(gestureState.dx) > 28 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.4,
        onPanResponderRelease: (_event, gestureState) => {
          if (gestureState.dx < -70) {
            moveMobileView(1);
          }

          if (gestureState.dx > 70) {
            moveMobileView(-1);
          }
        }
      }),
    [selectedWorkOrder?.id, selectedProductionOperation?.id]
  );

  async function pickImageFromGallery() {
    setError("");

    if (!selectedProductionOperation) {
      setError(productionBlockReason);
      return;
    }

    try {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setError("Görsel seçmek için galeri izni gerekli.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false
    });

    setPickedImage(result);
    } catch (_error) {
      setError("Galeri açılamadı. Web tarayıcıdaysanız dosya seçme iznini kontrol edin veya Expo Go ile deneyin.");
    }
  }

  async function takePhoto() {
    setError("");

    if (!selectedProductionOperation) {
      setError(productionBlockReason);
      return;
    }

    try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      setError("Fotoğraf çekmek için kamera izni gerekli.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      allowsEditing: false
    });

    setPickedImage(result);
    } catch (_error) {
      setError("Kamera açılamadı. Web tarayıcıdaysanız kamera iznini kontrol edin veya Expo Go ile deneyin.");
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#256f6c" />
        <Text style={styles.muted}>Yükleniyor...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.authPage}>
        <Text style={styles.authTitle}>MES Lite</Text>
        <Text style={styles.authSubtitle}>Operatör üretim girişi</Text>
        <View style={styles.card}>
          <Text style={styles.label}>E-posta</Text>
          <TextInput style={styles.input} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <Text style={styles.label}>Şifre</Text>
          <TextInput style={styles.input} secureTextEntry value={password} onChangeText={setPassword} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.primaryButton} onPress={handleLogin} disabled={isSubmitting}>
            <Text style={styles.primaryButtonText}>{isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.hero}>
        <View>
          <Text style={styles.eyebrow}>MES Lite Operatör</Text>
          <Text style={styles.title}>İş Emirlerim</Text>
          <Text style={styles.subtitle}>{user.name}</Text>
        </View>
        <Pressable style={styles.secondaryButton} onPress={handleLogout}>
          <Text style={styles.secondaryButtonText}>Çıkış</Text>
        </Pressable>
      </View>

      <View style={styles.mobileSummary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{activeAssignedWorkOrders.length}</Text>
          <Text style={styles.detailLabel}>Aktif İş</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{runningWorkOrderCount}</Text>
          <Text style={styles.detailLabel}>Üretimde</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{totalRemainingQuantity}</Text>
          <Text style={styles.detailLabel}>Kalan</Text>
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
      {user && error ? (
        <Pressable style={styles.inlineButton} onPress={loadWorkOrders} disabled={isSubmitting}>
          <Text style={styles.inlineButtonText}>Tekrar Dene</Text>
        </Pressable>
      ) : null}

      <View style={styles.card}>
        <View style={styles.notificationPanelHeader}>
          <View>
            <Text style={styles.sectionTitle}>Bildirimler</Text>
            <Text style={styles.muted}>{unreadNotificationCount} okunmamış bildirim</Text>
          </View>
          <Pressable style={styles.inlineButton} onPress={handleMarkAllNotificationsRead} disabled={!unreadNotificationCount || isSubmitting}>
            <Text style={styles.inlineButtonText}>Tümünü Okundu Yap</Text>
          </Pressable>
        </View>
        {notifications.slice(0, 4).map((notification) => (
          <View key={notification.id} style={[styles.mobileNotificationCard, !notification.readAt ? styles.mobileNotificationUnread : null]}>
            <View style={styles.mobileNotificationText}>
              <Text style={styles.detailValue}>{notification.title}</Text>
              <Text style={styles.muted}>{notification.message}</Text>
              <Text style={styles.detailLabel}>{formatDateTime(notification.createdAt)}</Text>
            </View>
            {!notification.readAt ? (
              <Pressable style={styles.inlineButton} onPress={() => handleMarkNotificationRead(notification.id)} disabled={isSubmitting}>
                <Text style={styles.inlineButtonText}>Okundu</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        {!notifications.length ? <Text style={styles.muted}>Henüz bildirim yok.</Text> : null}
      </View>

      <View style={[styles.card, styles.tabCard]}>
        <View style={styles.mobileTabBar}>
          {[
            { value: "WORKS", label: "İşler" },
            { value: "DETAIL", label: "Detay" },
            { value: "PRODUCTION", label: "Üretim" }
          ].map((tab) => (
            <Pressable
              key={tab.value}
              style={[styles.mobileTabButton, activeMobileView === tab.value ? styles.mobileTabButtonActive : null]}
              onPress={() => setActiveMobileView(tab.value)}
            >
              <Text style={[styles.mobileTabText, activeMobileView === tab.value ? styles.mobileTabTextActive : null]}>{tab.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View {...mobileViewPanResponder.panHandlers}>
      {activeMobileView === "WORKS" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Aktif İşlerim</Text>
          <Text style={styles.muted}>Sadece devam eden ve işlem yapabileceğiniz operasyonlar burada görünür.</Text>
          {activeAssignedWorkOrders.map((workOrder) => (
            <Pressable
              key={workOrder.id}
              style={[styles.orderCard, selectedWorkOrderId === workOrder.id ? styles.selectedOrderRow : null]}
              onPress={() => selectWorkOrder(workOrder)}
            >
              <View style={styles.orderCardHeader}>
                <View>
                  <Text style={styles.orderNo}>{workOrder.orderNo}</Text>
                  <Text style={styles.muted}>
                    {workOrder.product.code} - {workOrder.product.name}
                  </Text>
                </View>
                <View style={styles.cardBadgeStack}>
                  {notificationCounts[workOrder.id] ? <Text style={styles.notificationBadge}>{notificationCounts[workOrder.id]}</Text> : null}
                  <Text style={[styles.statusBadge, isShortClosedWorkOrder(workOrder) ? styles.shortClosedBadge : null]}>{getWorkOrderStatusLabel(workOrder)}</Text>
                </View>
              </View>
              <View style={styles.orderCardFooter}>
                <Text style={styles.detailValue}>{getMyCurrentOperationText(workOrder, user.id)}</Text>
                <Text style={styles.muted}>{getWorkOrderFlowText(workOrder)}</Text>
              </View>
            </Pressable>
          ))}
          {!activeAssignedWorkOrders.length ? <Text style={styles.muted}>Şu anda işlem yapabileceğiniz aktif operasyon yok.</Text> : null}
        </View>
      ) : null}

      {activeMobileView === "WORKS" && handoffAssignedWorkOrders.length ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Devam Eden Takiplerim</Text>
          <Text style={styles.muted}>Sizin adımınız tamamlandı; ürün sonraki operatörde üretime devam ediyor.</Text>
          {handoffAssignedWorkOrders.map((workOrder) => (
            <Pressable
              key={workOrder.id}
              style={[styles.orderCard, styles.followUpOrderCard, selectedWorkOrderId === workOrder.id ? styles.selectedOrderRow : null]}
              onPress={() => selectWorkOrder(workOrder)}
            >
              <View style={styles.orderCardHeader}>
                <View>
                  <Text style={styles.orderNo}>{workOrder.orderNo}</Text>
                  <Text style={styles.muted}>
                    {workOrder.product.code} - {workOrder.product.name}
                  </Text>
                </View>
                <View style={styles.cardBadgeStack}>
                  {notificationCounts[workOrder.id] ? <Text style={styles.notificationBadge}>{notificationCounts[workOrder.id]}</Text> : null}
                  <Text style={styles.statusBadge}>{getWorkOrderStatusLabel(workOrder)}</Text>
                </View>
              </View>
              <View style={styles.orderCardFooter}>
                <Text style={styles.detailValue}>{getMyCurrentOperationText(workOrder, user.id)}</Text>
                <Text style={styles.muted}>Şu an: {getWorkOrderFlowText(workOrder)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {activeMobileView === "WORKS" && closedAssignedWorkOrders.length ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Geçmiş / Kapalı İşler</Text>
          <Text style={styles.muted}>Tamamlanmış veya eksik kapatılmış işler burada sadece bilgi amaçlı görünür.</Text>
          {closedAssignedWorkOrders.map((workOrder) => (
            <Pressable
              key={workOrder.id}
              style={[styles.orderCard, selectedWorkOrderId === workOrder.id ? styles.selectedOrderRow : null]}
              onPress={() => selectWorkOrder(workOrder)}
            >
              <View style={styles.orderCardHeader}>
                <View>
                  <Text style={styles.orderNo}>{workOrder.orderNo}</Text>
                  <Text style={styles.muted}>
                    {workOrder.product.code} - {workOrder.product.name}
                  </Text>
                </View>
                <View style={styles.cardBadgeStack}>
                  {notificationCounts[workOrder.id] ? <Text style={styles.notificationBadge}>{notificationCounts[workOrder.id]}</Text> : null}
                  <Text style={[styles.statusBadge, isShortClosedWorkOrder(workOrder) ? styles.shortClosedBadge : null]}>{getWorkOrderStatusLabel(workOrder)}</Text>
                </View>
              </View>
              <View style={styles.orderCardFooter}>
                <Text style={styles.detailValue}>
                  Üretim: {workOrder.producedQuantity}/{workOrder.plannedQuantity}
                </Text>
                <Text style={styles.muted}>{getWorkOrderFlowText(workOrder)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {activeMobileView === "DETAIL" && selectedWorkOrder ? (
        <View style={styles.card}>
          <View style={styles.detailHeader}>
            <View>
              <Text style={styles.sectionTitle}>İş Emri Detayı</Text>
              <Text style={styles.muted}>{selectedWorkOrder.orderNo}</Text>
            </View>
            <Text style={[styles.statusBadge, isShortClosedWorkOrder(selectedWorkOrder) ? styles.shortClosedBadge : null]}>{getWorkOrderStatusLabel(selectedWorkOrder)}</Text>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Ürün Kodu</Text>
              <Text style={styles.detailValue}>{selectedWorkOrder.product.code}</Text>
            </View>
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Ürün</Text>
              <Text style={styles.detailValue}>{selectedWorkOrder.product.name}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Makine</Text>
              <Text style={styles.detailValue}>{getMachineName(selectedWorkOrder)}</Text>
            </View>
            <View style={styles.detailBox}>
              <Text style={styles.detailLabel}>Kalan</Text>
              <Text style={styles.detailValue}>{getRemainingQuantity(selectedWorkOrder)} adet</Text>
            </View>
          </View>

          <View style={styles.kpiRow}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiValue}>{selectedWorkOrder.plannedQuantity}</Text>
              <Text style={styles.detailLabel}>Plan</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiValue}>{selectedWorkOrder.producedQuantity}</Text>
              <Text style={styles.detailLabel}>Üretim</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiValue}>{selectedWorkOrder.scrapQuantity}</Text>
              <Text style={styles.detailLabel}>Fire</Text>
            </View>
          </View>

          <View>
            <View style={styles.progressHeader}>
              <Text style={styles.detailLabel}>İlerleme</Text>
              <Text style={styles.detailValue}>{selectedProgressPercent}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${selectedProgressPercent}%` }]} />
            </View>
          </View>

          {selectedWorkOrder.operations?.length ? (
            <View style={styles.operationSection}>
              <Text style={styles.sectionTitle}>Operasyon Akışı</Text>
              <View style={styles.operationSummary}>
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>Ürün Şu Anda</Text>
                  <Text style={styles.detailValue}>{getWorkOrderFlowText(selectedWorkOrder)}</Text>
                </View>
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>Biten</Text>
                  <Text style={styles.detailValue}>
                    {selectedOperationProgress?.completed}/{selectedOperationProgress?.total}
                  </Text>
                </View>
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>Bendeki Adım</Text>
                  <Text style={styles.detailValue}>{mySelectedOperations.length}</Text>
                </View>
              </View>
              {selectedWorkOrder.operations.map((operation, index) => {
                const isMine = operation.assignedOperatorId === user.id;
                const previousOperation = selectedWorkOrder.operations[index - 1];
                const nextOperation = selectedWorkOrder.operations[index + 1];
                const operationTransferQuantity = getOperationTransferQuantity(operation, selectedWorkOrder);

                return (
                  <View
                    key={operation.id}
                    style={[
                      styles.operationCard,
                      styles[`operation${operation.status}`],
                      isShortCompletedOperation(operation, selectedWorkOrder) ? styles.shortCompletedOperationCard : null,
                      isMine ? styles.myOperationCard : null
                    ]}
                  >
                    <View style={styles.operationHeader}>
                      <Text style={styles.operationSequence}>{operation.sequenceNo}</Text>
                      <View style={styles.operationHeaderText}>
                        <Text style={styles.operationName}>{operation.operationName}</Text>
                        <Text style={styles.muted}>{operation.machine?.code ?? "Makine yok"}</Text>
                      </View>
                      <Text style={[styles.operationStage, isShortCompletedOperation(operation, selectedWorkOrder) ? styles.shortClosedBadge : null]}>
                        {getOperationStageLabel(operation, selectedWorkOrder)}
                      </Text>
                    </View>
                    <Text style={styles.detailValue}>{getOperationStatusLabel(operation, selectedWorkOrder)}</Text>
                    <Text style={styles.muted}>
                      Bu adım üretimi: {operation.producedQuantity}/{operationTransferQuantity} adet
                    </Text>
                    <Text style={styles.muted}>Operatör: {operation.assignedOperator?.name ?? "-"}</Text>
                    <Text style={styles.muted}>
                      Önceki: {previousOperation?.assignedOperator?.name ?? "-"} / Sonraki: {nextOperation?.assignedOperator?.name ?? "-"}
                    </Text>
                    {(operation.downtimes ?? []).length ? (
                      <View style={styles.operationMessage}>
                        <Text style={styles.detailLabel}>Son Duruş</Text>
                        <Text style={styles.muted}>
                          {DOWNTIME_REASON_LABELS[operation.downtimes[0].reason] ?? operation.downtimes[0].reason}
                          {operation.downtimes[0].note ? ` - ${operation.downtimes[0].note}` : ""}
                        </Text>
                      </View>
                    ) : null}
                    {isMine ? <Text style={styles.myOperationText}>Bu adım size atanmış.</Text> : null}
                    {isMine && isClosedWorkOrder(selectedWorkOrder) ? (
                      <Text style={styles.muted}>Bu iş emri kapalı. Operasyon aksiyonu yapılamaz.</Text>
                    ) : null}
                    {isShortCompletedOperation(operation, selectedWorkOrder) ? (
                      <Text style={styles.error}>Bu operasyon planlanan adetten düşük kapatılmış. Üretim yöneticisi kontrolü gerekir.</Text>
                    ) : null}
                    {isMine && !isClosedWorkOrder(selectedWorkOrder) ? (
                      <>
                      {canPauseOperation(operation, selectedWorkOrder) ? (
                        <View style={styles.operationMessageForm}>
                          <Text style={styles.detailLabel}>Duruş Nedeni</Text>
                          <View style={styles.choiceList}>
                            {DOWNTIME_REASONS.map((reason) => (
                              <Pressable
                                key={reason.value}
                                style={[
                                  styles.choiceButton,
                                  (operationDowntimeDrafts[operation.id]?.reason ?? "MACHINE_FAILURE") === reason.value ? styles.choiceButtonActive : null
                                ]}
                                onPress={() => updateOperationDowntimeDraft(operation.id, "reason", reason.value)}
                                disabled={isSubmitting}
                              >
                                <Text style={styles.choiceText}>{reason.label}</Text>
                              </Pressable>
                            ))}
                          </View>
                          <TextInput
                            style={styles.input}
                            value={operationDowntimeDrafts[operation.id]?.note ?? ""}
                            onChangeText={(value) => updateOperationDowntimeDraft(operation.id, "note", value)}
                            placeholder="Duruş notu yaz"
                          />
                        </View>
                      ) : null}
                      <View style={styles.operationActionRow}>
                        <Pressable
                          style={[styles.operationActionButton, !canStartOperation(operation, selectedWorkOrder) ? styles.disabledButton : null]}
                          onPress={() =>
                            handleOperationAction(
                              () => startWorkOrderOperation(operation.id),
                              "Operasyon başlatıldı.",
                              "Operasyon başlatılamadı."
                            )
                          }
                          disabled={!canStartOperation(operation, selectedWorkOrder) || isSubmitting}
                        >
                          <Text style={styles.operationActionText}>{operation.status === "PAUSED" ? "Devam Et" : "Operasyonu Başlat"}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.operationActionButton, !canPauseOperation(operation, selectedWorkOrder) ? styles.disabledButton : null]}
                          onPress={() =>
                            handlePauseOperation(operation.id)
                          }
                          disabled={!canPauseOperation(operation, selectedWorkOrder) || isSubmitting}
                        >
                          <Text style={styles.operationActionText}>Operasyonu Duraklat</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.operationActionButton, !canCompleteOperation(operation, selectedWorkOrder, user) ? styles.disabledButton : null]}
                          onPress={() =>
                            handleOperationAction(
                              () => completeWorkOrderOperation(operation.id),
                              nextOperation ? `Operasyon tamamlandı. Sıradaki adım ${nextOperation.assignedOperator?.name ?? "sonraki operatör"} için hazırlandı.` : "Operasyon tamamlandı. İş akışı tamamlandı.",
                              "Operasyon tamamlanamadı."
                            )
                          }
                          disabled={!canCompleteOperation(operation, selectedWorkOrder, user) || isSubmitting}
                        >
                          <Text style={styles.operationActionText}>Operasyonu Tamamla</Text>
                        </Pressable>
                      </View>
                      </>
                    ) : null}
                    {isMine && ["IN_PROGRESS", "PAUSED"].includes(operation.status) && hasOperationLog(operation) && operation.producedQuantity + operation.scrapQuantity < operationTransferQuantity ? (
                      <Text style={styles.error}>
                        Devredilen adet işlenmeden operatör operasyonu kapatamaz. İşlenen: {operation.producedQuantity + operation.scrapQuantity}/{operationTransferQuantity}
                      </Text>
                    ) : null}
                    {(operation.messages ?? []).slice(0, 2).map((message) => (
                      <View key={message.id} style={styles.operationMessage}>
                        <Text style={styles.detailLabel}>{message.severity}</Text>
                        <Text style={styles.muted}>
                          {message.message} - {message.sender.name}
                        </Text>
                      </View>
                    ))}
                    {isMine ? (
                      <View style={styles.operationMessageForm}>
                        <View style={styles.choiceList}>
                          {MESSAGE_SEVERITIES.map((severity) => (
                            <Pressable
                              key={severity.value}
                              style={[
                                styles.choiceButton,
                                (operationMessageDrafts[operation.id]?.severity ?? "INFO") === severity.value ? styles.choiceButtonActive : null
                              ]}
                              onPress={() => updateOperationMessageDraft(operation.id, "severity", severity.value)}
                              disabled={isSubmitting}
                            >
                              <Text style={styles.choiceText}>{severity.label}</Text>
                            </Pressable>
                          ))}
                        </View>
                        <TextInput
                          style={styles.input}
                          value={operationMessageDrafts[operation.id]?.message ?? ""}
                          onChangeText={(value) => updateOperationMessageDraft(operation.id, "message", value)}
                          placeholder="Bu operasyon için mesaj yaz"
                        />
                        <Pressable style={styles.secondaryButton} onPress={() => handleOperationMessage(operation.id)} disabled={isSubmitting}>
                          <Text style={styles.secondaryButtonText}>Mesaj Gönder</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.muted}>Bu iş emri için operasyon akışı tanımlı değil.</Text>
          )}
        </View>
      ) : null}

      {activeMobileView === "DETAIL" && !selectedWorkOrder ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>İş Emri Detayı</Text>
          <Text style={styles.muted}>Detay görmek için İşler sekmesinden bir iş emri seçin.</Text>
        </View>
      ) : null}

      {activeMobileView === "PRODUCTION" ? (
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Üretim Girişi</Text>
        <Text style={styles.label}>İş Emri</Text>
        <View style={styles.choiceList}>
          {displayedProductionCandidates.map((operation) => (
            <Pressable
              key={operation.id}
              style={[styles.operationChoiceButton, selectedOperationId === operation.id ? styles.choiceButtonActive : null]}
              onPress={() => {
                setSelectedOperationId(operation.id);
                setSelectedWorkOrderId(operation.workOrder.id);
                setActiveMobileView("PRODUCTION");
              }}
            >
              <Text style={styles.choiceText}>{operation.workOrder.orderNo}</Text>
              <Text style={styles.muted}>
                {operation.sequenceNo}. {operation.operationName} - {OPERATION_STATUS_LABELS[operation.status] ?? operation.status}
              </Text>
            </Pressable>
          ))}
        </View>
        {!displayedProductionCandidates.length ? (
          <Text style={styles.muted}>
            {selectedWorkOrder
              ? "Seçili iş emri için üretim girişi yapılabilecek operasyon yok."
              : "Üretim girişi için size atanmış hazır, üretimde veya duraklatılmış operasyon yok."}
          </Text>
        ) : null}
        {selectedProductionOperation && selectedProductionWorkOrder ? (
          <View style={styles.productionNotice}>
            <Text style={styles.detailLabel}>Seçili operasyon</Text>
            <Text style={styles.detailValue}>
              {selectedProductionWorkOrder.orderNo} - {selectedProductionOperation.operationName}
            </Text>
            <Text style={styles.muted}>
              Önceki adımdan gelen: {selectedProductionTransferQuantity} adet, kalan: {selectedProductionRemaining} adet
            </Text>
            <Text style={styles.muted}>
              Makine: {selectedProductionOperation.machine?.name ?? selectedProductionOperation.machine?.code}
            </Text>
            <Text style={styles.muted}>
              Operasyon üretim/fire: {selectedProductionOperation.producedQuantity}/{selectedProductionOperation.scrapQuantity}
            </Text>
          </View>
        ) : null}
        {productionBlockReason && !selectedProductionOperation ? <Text style={styles.error}>{productionBlockReason}</Text> : null}
        <Text style={styles.label}>Üretilen Adet</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={producedQuantity} onChangeText={setProducedQuantity} />
        <View style={styles.quickRow}>
          {QUICK_QUANTITIES.map((quantity) => (
            <Pressable
              key={quantity}
              style={[styles.quickButton, !selectedProductionOperation ? styles.disabledButton : null]}
              onPress={() => fillQuickQuantity(quantity)}
              disabled={!selectedProductionOperation}
            >
              <Text style={styles.quickButtonText}>{quantity}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Fire Adedi</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={scrapQuantity} onChangeText={setScrapQuantity} />
        {Number(scrapQuantity) > 0 ? (
          <>
            <Text style={styles.label}>Fire Nedeni</Text>
            <View style={styles.choiceList}>
              {SCRAP_REASONS.map((reason) => (
                <Pressable
                  key={reason.value}
                  style={[styles.choiceButton, scrapReason === reason.value ? styles.choiceButtonActive : null]}
                  onPress={() => setScrapReason(reason.value)}
                >
                  <Text style={styles.choiceText}>{reason.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
        <Text style={styles.label}>Not</Text>
        <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="İsteğe bağlı not" />
        <Pressable
          style={[styles.alertToggle, isCriticalAlert ? styles.alertToggleActive : null]}
          onPress={() => setIsCriticalAlert((current) => !current)}
          disabled={!selectedProductionOperation || isSubmitting}
        >
          <Text style={styles.alertToggleText}>{isCriticalAlert ? "Kritik uyarı olarak işaretlendi" : "Kritik uyarı olarak işaretle"}</Text>
        </Pressable>
        {isCriticalAlert ? (
          <View style={styles.choiceList}>
            {[
              { value: "WARNING", label: "Uyarı" },
              { value: "CRITICAL", label: "Kritik" }
            ].map((severity) => (
              <Pressable
                key={severity.value}
                style={[styles.choiceButton, alertSeverity === severity.value ? styles.choiceButtonActive : null]}
                onPress={() => setAlertSeverity(severity.value)}
              >
                <Text style={styles.choiceText}>{severity.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Text style={styles.label}>Görsel Kanıt</Text>
        <View style={styles.imagePickerRow}>
          <Pressable style={styles.secondaryButton} onPress={takePhoto} disabled={!selectedProductionOperation || isSubmitting}>
            <Text style={styles.secondaryButtonText}>Kamera</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={pickImageFromGallery} disabled={!selectedProductionOperation || isSubmitting}>
            <Text style={styles.secondaryButtonText}>{selectedImage ? "Galeriden Değiştir" : "Galeriden Seç"}</Text>
          </Pressable>
          {selectedImage ? (
            <Pressable style={styles.inlineButton} onPress={() => setSelectedImage(null)} disabled={isSubmitting}>
              <Text style={styles.inlineButtonText}>Kaldır</Text>
            </Pressable>
          ) : null}
        </View>
        {selectedImage ? <Text style={styles.muted}>{selectedImage.fileName ?? "Görsel seçildi"}</Text> : null}
        {selectedImage?.uri ? <Image source={{ uri: selectedImage.uri }} style={styles.imagePreview} resizeMode="cover" /> : null}
        <Pressable
          style={[styles.primaryButton, !selectedProductionOperation || isSubmitting ? styles.disabledButton : null]}
          onPress={handleProductionEntry}
          disabled={!selectedProductionOperation || isSubmitting}
        >
          <Text style={styles.primaryButtonText}>{isSubmitting ? "Kaydediliyor..." : "Kaydet"}</Text>
        </Pressable>
      </View>
      ) : null}

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#eef3f6"
  },
  pageContent: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: 12,
    minHeight: fullScreenHeight,
    padding: 14,
    paddingTop: 28,
    paddingBottom: 36
  },
  authPage: {
    flex: 1,
    justifyContent: "center",
    gap: 12,
    minHeight: fullScreenHeight,
    padding: 20,
    backgroundColor: "#f4f7f9"
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: fullScreenHeight,
    backgroundColor: "#f4f7f9"
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 16,
    backgroundColor: "#17313a",
    borderRadius: 10
  },
  eyebrow: {
    marginBottom: 4,
    color: "#9ee2d0",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
    color: "#ffffff"
  },
  authTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#17202a"
  },
  subtitle: {
    marginTop: 4,
    color: "#dbe3ea"
  },
  authSubtitle: {
    marginTop: 4,
    color: "#60707d"
  },
  mobileSummary: {
    flexDirection: "row",
    gap: 8
  },
  summaryItem: {
    flex: 1,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1
  },
  summaryValue: {
    color: "#17202a",
    fontSize: 21,
    fontWeight: "900"
  },
  card: {
    gap: 10,
    padding: 14,
    backgroundColor: "#ffffff",
    borderColor: "#d6e0e8",
    borderRadius: 8,
    borderWidth: 1
  },
  tabCard: {
    padding: 8
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
    color: "#17202a"
  },
  detailHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    color: "#256f6c",
    backgroundColor: "#d9f2e8",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "800"
  },
  shortClosedBadge: {
    color: "#9a3412",
    backgroundColor: "#ffedd5"
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  detailBox: {
    flex: 1,
    gap: 4,
    minWidth: 140,
    minHeight: 66,
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#f8fbfc",
    borderColor: "#e6edf2",
    borderRadius: 6,
    borderWidth: 1
  },
  detailLabel: {
    color: "#60707d",
    fontSize: 12,
    fontWeight: "700"
  },
  detailValue: {
    color: "#17202a",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800"
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8
  },
  kpiBox: {
    flex: 1,
    gap: 2,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#f8fbfc",
    borderColor: "#e6edf2",
    borderRadius: 6,
    borderWidth: 1
  },
  kpiValue: {
    color: "#17202a",
    fontSize: 20,
    fontWeight: "900"
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  progressTrack: {
    height: 10,
    overflow: "hidden",
    backgroundColor: "#edf1f5",
    borderRadius: 999
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#256f6c",
    borderRadius: 999
  },
  label: {
    color: "#33424d",
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    color: "#17202a",
    backgroundColor: "#ffffff",
    borderColor: "#c8d3dd",
    borderRadius: 6,
    borderWidth: 1
  },
  primaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#256f6c",
    borderRadius: 6
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
    borderColor: "#c8d3dd",
    borderRadius: 6,
    borderWidth: 1
  },
  secondaryButtonText: {
    color: "#17202a",
    fontWeight: "800"
  },
  disabledButton: {
    opacity: 0.45
  },
  error: {
    color: "#b42318",
    fontWeight: "700"
  },
  success: {
    color: "#157347",
    fontWeight: "800"
  },
  inlineButton: {
    alignSelf: "flex-start",
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#ffffff",
    borderColor: "#c8d3dd",
    borderRadius: 6,
    borderWidth: 1
  },
  inlineButtonText: {
    color: "#17202a",
    fontWeight: "800"
  },
  muted: {
    color: "#60707d"
  },
  productionNotice: {
    gap: 5,
    padding: 12,
    backgroundColor: "#f0fdfa",
    borderColor: "#b9eadb",
    borderRadius: 6,
    borderWidth: 1
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  quickButton: {
    minWidth: 58,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#edf1f5",
    borderColor: "#dbe3ea",
    borderRadius: 6,
    borderWidth: 1
  },
  quickButtonText: {
    color: "#17202a",
    fontWeight: "800"
  },
  imagePickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  alertToggle: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 6,
    borderWidth: 1
  },
  alertToggleActive: {
    backgroundColor: "#fee2e2",
    borderColor: "#dc2626"
  },
  alertToggleText: {
    color: "#9a3412",
    fontWeight: "800"
  },
  imagePreview: {
    width: "100%",
    height: 180,
    backgroundColor: "#edf1f5",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1
  },
  orderCard: {
    gap: 10,
    padding: 12,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1
  },
  orderCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  cardBadgeStack: {
    alignItems: "flex-end",
    gap: 6
  },
  notificationBadge: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    color: "#ffffff",
    backgroundColor: "#dc2626",
    borderColor: "#ffffff",
    borderRadius: 999,
    borderWidth: 2,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 24,
    overflow: "hidden",
    textAlign: "center"
  },
  orderCardFooter: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 10,
    borderTopColor: "#edf1f5",
    borderTopWidth: 1
  },
  selectedOrderRow: {
    backgroundColor: "#eefaf7",
    borderColor: "#256f6c"
  },
  followUpOrderCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#c8d3dd"
  },
  notificationPanelHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  mobileNotificationCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1
  },
  mobileNotificationUnread: {
    backgroundColor: "#f0fdfa",
    borderColor: "#256f6c"
  },
  mobileNotificationText: {
    flex: 1,
    gap: 3
  },
  mobileTabBar: {
    flexDirection: "row",
    gap: 6,
    padding: 4,
    backgroundColor: "#eef3f6",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1
  },
  mobileTabButton: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    borderRadius: 6
  },
  mobileTabButtonActive: {
    backgroundColor: "#256f6c"
  },
  mobileTabText: {
    color: "#60707d",
    fontWeight: "900"
  },
  mobileTabTextActive: {
    color: "#ffffff"
  },
  orderNo: {
    color: "#17202a",
    fontWeight: "800"
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  choiceList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  choiceButton: {
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#edf1f5",
    borderColor: "#edf1f5",
    borderRadius: 999,
    borderWidth: 1
  },
  operationChoiceButton: {
    minWidth: 150,
    flexGrow: 1,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#edf1f5",
    borderColor: "#edf1f5",
    borderRadius: 8,
    borderWidth: 1
  },
  choiceButtonActive: {
    backgroundColor: "#d9f2e8",
    borderColor: "#256f6c"
  },
  choiceText: {
    color: "#17202a",
    fontWeight: "700"
  },
  operationSection: {
    gap: 10
  },
  operationSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  operationCard: {
    gap: 8,
    padding: 12,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 2
  },
  myOperationCard: {
    borderColor: "#256f6c"
  },
  operationWAITING: {
    opacity: 0.72,
    backgroundColor: "#f8fafc"
  },
  operationREADY: {
    backgroundColor: "#ecfdf8",
    borderColor: "#256f6c"
  },
  operationIN_PROGRESS: {
    backgroundColor: "#eff6ff",
    borderColor: "#2563eb"
  },
  operationPAUSED: {
    backgroundColor: "#fffbeb",
    borderColor: "#d97706"
  },
  operationCOMPLETED: {
    backgroundColor: "#f0fdf4",
    borderColor: "#16a34a"
  },
  shortCompletedOperationCard: {
    backgroundColor: "#fff7ed",
    borderColor: "#f97316"
  },
  operationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10
  },
  operationSequence: {
    minWidth: 28,
    height: 28,
    textAlign: "center",
    textAlignVertical: "center",
    color: "#ffffff",
    backgroundColor: "#256f6c",
    borderRadius: 999,
    fontWeight: "900",
    lineHeight: 28
  },
  operationHeaderText: {
    flex: 1,
    gap: 2
  },
  operationName: {
    color: "#17202a",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900"
  },
  operationStage: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: "#ffffff",
    backgroundColor: "#256f6c",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden"
  },
  myOperationText: {
    color: "#256f6c",
    fontWeight: "900"
  },
  operationActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  operationActionButton: {
    minHeight: 40,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    backgroundColor: "#ffffff",
    borderColor: "#c8d3dd",
    borderRadius: 6,
    borderWidth: 1
  },
  operationActionText: {
    color: "#17202a",
    fontSize: 12,
    fontWeight: "900"
  },
  operationMessage: {
    gap: 2,
    padding: 8,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 6,
    borderWidth: 1
  },
  operationMessageForm: {
    gap: 8,
    paddingTop: 8,
    borderTopColor: "#dbe3ea",
    borderTopWidth: 1
  }
});
