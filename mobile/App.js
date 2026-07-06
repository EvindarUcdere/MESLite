import * as ImagePicker from "expo-image-picker";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, Vibration } from "react-native";
import { getStoredSession, login, logout } from "./src/api/auth.api";
import { getApiBaseUrl } from "./src/api/client";
import { createMobileDebugLog } from "./src/api/mobileDebugLogs.api";
import { clearNotifications, getNotifications, markAllNotificationsRead, markNotificationRead } from "./src/api/notifications.api";
import { createProductionLog, uploadProductionLogImage } from "./src/api/productionLogs.api";
import { getMyPushTokens, registerPushToken } from "./src/api/pushTokens.api";
import { getShiftAssignments } from "./src/api/shiftPlanning.api";
import { createMobileSocket } from "./src/api/socket";
import { completeWorkOrderOperation, createOperationMessage, pauseWorkOrderOperation, startWorkOrderOperation } from "./src/api/workOrderOperations.api";
import { getWorkOrders } from "./src/api/workOrders.api";
import { createOperationId, isOfflineQueuedResult } from "./src/offline/offlineApi";
import { getOfflineQueueSummary, initOfflineQueue } from "./src/offline/offlineQueue";
import { syncOfflineQueue } from "./src/offline/syncService";
import MobileQualityView from "./src/components/MobileQualityView";
import OfflineQueuePanel from "./src/components/OfflineQueuePanel";

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
let pushDebugLogListener = null;

const MOBILE_VIEW_ORDER = ["WORKS", "DETAIL", "PRODUCTION", "CALENDAR"];
const NOTIFICATION_CHANNEL_ID = "default";

function logPushDebug(step, details = {}) {
  const payload = {
    platform: Platform.OS,
    appOwnership: Constants.appOwnership ?? "unknown",
    executionEnvironment: Constants.executionEnvironment ?? "unknown",
    ...details
  };

  console.log(
    "[push-debug]",
    step,
    JSON.stringify(payload)
  );

  if (pushDebugLogListener) {
    pushDebugLogListener({
      id: `${Date.now()}-${Math.random()}`,
      time: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      step,
      payload
    });
  }
}

async function getNativeNotificationsModule() {
  if (Platform.OS === "web") {
    logPushDebug("native-module-skip-web");
    return null;
  }

  if (!nativeNotificationsModulePromise) {
    logPushDebug("native-module-import-start");
    nativeNotificationsModulePromise = import("expo-notifications").then((module) => {
      logPushDebug("native-module-import-success");
      module.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true
        })
      });

      if (Platform.OS === "android") {
        logPushDebug("android-channel-create-start", { channelId: NOTIFICATION_CHANNEL_ID });
        module.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
          name: "MES Lite Bildirimleri",
          importance: module.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 120, 250],
          lightColor: "#2d7d76",
          sound: "default"
        })
          .then(() => logPushDebug("android-channel-create-success", { channelId: NOTIFICATION_CHANNEL_ID }))
          .catch((channelError) =>
            logPushDebug("android-channel-create-error", {
              message: channelError?.message ?? "unknown"
            })
          );
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

const SHIFT_STATUS_LABELS = {
  PLANNED: "Vardiya",
  CONFIRMED: "Onaylı",
  ABSENT: "Gelmedi",
  LEAVE: "İzin"
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

const QUICK_QUANTITIES = [1, 5, 10, 25];
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

const SCRAP_DISPOSITION_LABELS = Object.fromEntries(SCRAP_DISPOSITIONS.map((disposition) => [disposition.value, disposition.label]));
const fullScreenHeight = Platform.OS === "web" ? "100vh" : "100%";

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message ?? fallback;
}

function isUnauthorizedError(error) {
  return error?.response?.status === 401;
}

function getConnectionMessage(error) {
  if (error?.message === "Network Error" || error?.code === "ERR_NETWORK") {
    return "Çevrimdışısınız. Kayıtlarınız bağlantı yeniden kurulduğunda otomatik olarak aktarılacak.";
  }

  return getErrorMessage(error, "İş emirleri yüklenemedi.");
}

function getRemainingQuantity(workOrder) {
  return getWorkOrderDisplayQuantities(workOrder).remainingQuantity;
}

function getWorkOrderDisplayQuantities(workOrder) {
  const operations = [...(workOrder?.operations ?? [])].sort((first, second) => first.sequenceNo - second.sequenceNo);
  const latestProcessedOperation = [...operations]
    .reverse()
    .find((operation) => operation.producedQuantity > 0 || operation.scrapQuantity > 0);
  const source = latestProcessedOperation ?? null;
  const plannedQuantity = workOrder?.plannedQuantity ?? 0;
  const producedQuantity = source ? source.producedQuantity : workOrder?.producedQuantity ?? 0;
  const scrapQuantity = source ? source.scrapQuantity : workOrder?.scrapQuantity ?? 0;
  const processedQuantity = producedQuantity + scrapQuantity;
  const remainingQuantity = Math.max(plannedQuantity - processedQuantity, 0);
  const progressPercent = plannedQuantity > 0 ? Math.min(Math.round((processedQuantity / plannedQuantity) * 100), 100) : 0;

  return {
    producedQuantity,
    scrapQuantity,
    processedQuantity,
    remainingQuantity,
    progressPercent,
    sourceOperation: source
  };
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

  return Math.max(previousOperation.producedQuantity, 0);
}

function getProgressPercent(workOrder) {
  return getWorkOrderDisplayQuantities(workOrder).progressPercent;
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

function getSpecialWorkOrderInfo(workOrder) {
  const orderNo = workOrder?.orderNo ?? "";

  if (orderNo.includes("-TELAFI-")) {
    return {
      label: "Telafi üretimi",
      text: "Bu iş, önceki fire/eksik üretimi kapatmak için oluşturuldu."
    };
  }

  if (orderNo.includes("-RWK-")) {
    return {
      label: "Yeniden işlem",
      text: "Bu iş, fireli parçanın onarım veya yeniden işlem süreci için oluşturuldu."
    };
  }

  return null;
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

function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function getNextMonth(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString().slice(0, 7);
}

function getPreviousMonth(month) {
  const [year, monthIndex] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthIndex - 2, 1)).toISOString().slice(0, 7);
}

function formatMonthLabel(month) {
  return new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));
}

function formatShiftDay(value) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    weekday: "short"
  }).format(new Date(`${value}T00:00:00`));
}

function getMonthCalendarDays(month, assignments = []) {
  const [year, monthIndex] = month.split("-").map(Number);
  const firstDay = new Date(year, monthIndex - 1, 1);
  const dayCount = new Date(year, monthIndex, 0).getDate();
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const assignmentsByDate = Object.fromEntries(assignments.map((assignment) => [assignment.workDate?.slice(0, 10), assignment]));
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push({ key: `empty-start-${index}`, isEmpty: true });
  }

  for (let day = 1; day <= dayCount; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    cells.push({
      key: date,
      date,
      day,
      assignment: assignmentsByDate[date]
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ key: `empty-end-${cells.length}`, isEmpty: true });
  }

  return cells;
}

function getShiftShortCode(shift) {
  return shift?.name?.trim()?.slice(0, 1)?.toLocaleUpperCase("tr-TR") ?? "-";
}

function isBeforePlannedStart(workOrder) {
  return Boolean(workOrder?.plannedStartDate && new Date() < new Date(workOrder.plannedStartDate));
}

function canStartOperation(operation, workOrder) {
  return !isClosedWorkOrder(workOrder) && !isBeforePlannedStart(workOrder) && ["READY", "PAUSED"].includes(operation.status);
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
  return Boolean(
    !isClosedWorkOrder(workOrder) &&
      operation?.assignedOperatorId === userId &&
      ["READY", "IN_PROGRESS", "PAUSED"].includes(operation.status) &&
      operation.machineId
  );
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

function getLastCompletedOperationForUser(workOrder, userId) {
  return [...(workOrder?.operations ?? [])]
    .reverse()
    .find((operation) => operation.assignedOperatorId === userId && operation.status === "COMPLETED");
}

function getNextPendingOperationAfter(workOrder, operation) {
  if (!operation) {
    return null;
  }

  return (workOrder.operations ?? [])
    .filter((item) => item.sequenceNo > operation.sequenceNo && item.status !== "COMPLETED")
    .sort((first, second) => first.sequenceNo - second.sequenceNo)[0];
}

function getProductionUnavailableReason(workOrder, userId) {
  if (!workOrder) {
    return "Üretim girişi için bir iş emri seçin.";
  }

  if (isClosedWorkOrder(workOrder)) {
    return "Bu iş emri kapalı olduğu için üretim girişi yapılamaz.";
  }

  if (isBeforePlannedStart(workOrder)) {
    return "Bu iş emrinin planlanan başlangıç tarihi gelmedi.";
  }

  const myOperations = workOrder.operations?.filter((operation) => operation.assignedOperatorId === userId) ?? [];

  if (!myOperations.length) {
    const activeOperation = getOperationProgress(workOrder.operations).activeOperation;
    const activeOperatorName = activeOperation?.assignedOperator?.name;

    return activeOperation
      ? `Bu iş emrinin şu anki adımı ${activeOperation.operationName}. Operatör: ${activeOperatorName ?? "atanmamış"}.`
      : "Bu iş emrinde size atanmış operasyon yok.";
  }

  const activeMyOperation = myOperations.find((operation) => ["READY", "IN_PROGRESS", "PAUSED"].includes(operation.status));

  if (!activeMyOperation) {
    const completedOperation = getLastCompletedOperationForUser(workOrder, userId);
    const nextOperation = getNextPendingOperationAfter(workOrder, completedOperation);

    if (completedOperation && nextOperation) {
      return `${completedOperation.operationName} adımınız tamamlandı. Sıradaki adım ${nextOperation.operationName}; operatör: ${nextOperation.assignedOperator?.name ?? "atanmamış"}.`;
    }

    return "Bu iş emrindeki size atanmış adımlar tamamlanmış veya henüz sırada değil.";
  }

  if (!activeMyOperation.machineId) {
    return `${activeMyOperation.operationName} için makine atanmamış. Üretim yöneticisi makine ataması yapmalı.`;
  }

  return "Bu iş emrinde şu anda üretim girişi yapılabilecek operasyon yok.";
}

function getProductionContextOperation(workOrder, userId) {
  if (!workOrder?.operations?.length) {
    return null;
  }

  return (
    workOrder.operations.find((operation) => operation.assignedOperatorId === userId && ["READY", "IN_PROGRESS", "PAUSED"].includes(operation.status)) ??
    getOperationProgress(workOrder.operations).activeOperation ??
    [...workOrder.operations].reverse().find((operation) => operation.assignedOperatorId === userId) ??
    workOrder.operations[0]
  );
}

function getMyCurrentOperationText(workOrder, userId) {
  const actionableOperation = workOrder.operations?.find((operation) => operation.assignedOperatorId === userId && ["READY", "IN_PROGRESS", "PAUSED"].includes(operation.status));

  if (actionableOperation) {
    return `${actionableOperation.operationName} sizde`;
  }

  const completedOperation = getLastCompletedOperationForUser(workOrder, userId);

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
      logPushDebug("permission-web-api-missing");
      return false;
    }

    if (globalThis.Notification.permission === "granted") {
      logPushDebug("permission-web-already-granted");
      return true;
    }

    if (globalThis.Notification.permission === "denied") {
      logPushDebug("permission-web-denied");
      return false;
    }

    logPushDebug("permission-web-request-start", { current: globalThis.Notification.permission });
    const permission = await globalThis.Notification.requestPermission();
    logPushDebug("permission-web-request-result", { permission });
    return permission === "granted";
  }

  const Notifications = await getNativeNotificationsModule();
  if (!Notifications) {
    logPushDebug("permission-native-module-missing");
    return false;
  }

  const current = await Notifications.getPermissionsAsync();
  logPushDebug("permission-native-current", {
    granted: current.granted,
    status: current.status,
    canAskAgain: current.canAskAgain,
    expires: current.expires,
    iosStatus: current.ios?.status
  });
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true;
  }

  logPushDebug("permission-native-request-start");
  const requested = await Notifications.requestPermissionsAsync();
  logPushDebug("permission-native-request-result", {
    granted: requested.granted,
    status: requested.status,
    canAskAgain: requested.canAskAgain,
    expires: requested.expires,
    iosStatus: requested.ios?.status
  });
  return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

async function showSystemNotification({ title, body, badge = 1 }) {
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
      channelId: NOTIFICATION_CHANNEL_ID,
      badge,
      color: "#2d7d76",
      vibrate: [0, 250, 120, 250],
      sound: "default",
      priority: Notifications.AndroidNotificationPriority?.HIGH
    },
    trigger: null
  });
}

async function updateAppBadgeCount(count) {
  if (Platform.OS === "web") {
    return;
  }

  const Notifications = await getNativeNotificationsModule();
  if (!Notifications) {
    return;
  }

  await Notifications.setBadgeCountAsync(Math.max(count, 0)).catch(() => {});
}

async function getExpoPushTokenForDevice() {
  logPushDebug("expo-token-start");
  if (Platform.OS === "web") {
    logPushDebug("expo-token-skip-web");
    return null;
  }

  const Notifications = await getNativeNotificationsModule();
  if (!Notifications) {
    logPushDebug("expo-token-native-module-missing");
    return null;
  }

  const hasPermission = await ensureSystemNotificationPermission();
  logPushDebug("expo-token-permission-result", { hasPermission });
  if (!hasPermission) {
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  logPushDebug("expo-token-project-id", {
    hasProjectId: Boolean(projectId),
    projectIdSource: Constants.expoConfig?.extra?.eas?.projectId ? "expoConfig.extra.eas.projectId" : Constants.easConfig?.projectId ? "easConfig.projectId" : "missing"
  });
  if (!projectId) {
    throw new Error("EAS projectId bulunamadi. app.json extra.eas.projectId kontrol edilmeli.");
  }

  try {
    logPushDebug("expo-token-request-start");
    const tokenResult = await Notifications.getExpoPushTokenAsync({ projectId });
    logPushDebug("expo-token-request-success", {
      hasToken: Boolean(tokenResult?.data),
      tokenPreview: maskPushToken(tokenResult?.data)
    });
    console.log("Expo Push Token:", tokenResult.data);
    return tokenResult.data;
  } catch (tokenError) {
    logPushDebug("expo-token-request-error", {
      message: tokenError?.message ?? "unknown",
      code: tokenError?.code,
      stack: tokenError?.stack?.split("\n")?.slice(0, 3)?.join(" | ")
    });
    throw tokenError;
  }
}

async function getNativeDevicePushTokenDiagnostic() {
  if (Platform.OS === "web") {
    logPushDebug("native-device-token-skip-web");
    return "web";
  }

  const Notifications = await getNativeNotificationsModule();
  if (!Notifications?.getDevicePushTokenAsync) {
    logPushDebug("native-device-token-api-missing");
    return "native-token-api-yok";
  }

  try {
    logPushDebug("native-device-token-request-start");
    const tokenResult = await Notifications.getDevicePushTokenAsync();
    const tokenValue = typeof tokenResult?.data === "string" ? tokenResult.data : JSON.stringify(tokenResult?.data ?? "");
    logPushDebug("native-device-token-request-success", {
      type: tokenResult?.type,
      hasToken: Boolean(tokenValue),
      tokenPreview: maskPushToken(tokenValue)
    });
    console.log("Native Device Push Token:", tokenResult);
    return tokenValue ? `${tokenResult?.type ?? "native"}:${maskPushToken(tokenValue)}` : "native-token-boş";
  } catch (nativeTokenError) {
    const errorMessage = nativeTokenError?.message ?? "Bilinmeyen native token hatası";
    logPushDebug("native-device-token-request-error", {
      message: errorMessage,
      code: nativeTokenError?.code
    });
    console.log("Native Device Push Token error:", errorMessage, nativeTokenError);
    return `native-token-hatası: ${errorMessage}`;
  }
}

function maskPushToken(token) {
  if (!token) {
    return "-";
  }

  return `${token.slice(0, 22)}...${token.slice(-6)}`;
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
  const [scrapDisposition, setScrapDisposition] = useState("REPRODUCE");
  const [scrapResolutionQuantity, setScrapResolutionQuantity] = useState("0");
  const [scrapDispositionNote, setScrapDispositionNote] = useState("");
  const [note, setNote] = useState("");
  const [isCriticalAlert, setIsCriticalAlert] = useState(false);
  const [alertSeverity, setAlertSeverity] = useState("WARNING");
  const [selectedImage, setSelectedImage] = useState(null);
  const [operationMessageDrafts, setOperationMessageDrafts] = useState({});
  const [operationDowntimeDrafts, setOperationDowntimeDrafts] = useState({});
  const [notificationCounts, setNotificationCounts] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [pushStatus, setPushStatus] = useState("Bildirim durumu kontrol edilmedi.");
  const [shiftMonth, setShiftMonth] = useState(getCurrentMonth());
  const [shiftAssignments, setShiftAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [offlineSummary, setOfflineSummary] = useState({ pending: 0, synced: 0, failed: 0 });
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [isSyncingOfflineQueue, setIsSyncingOfflineQueue] = useState(false);
  const [lastProductionSubmission, setLastProductionSubmission] = useState(null);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const selectedWorkOrderIdRef = useRef("");
  const appStateRef = useRef(AppState.currentState);
  const unreadNotificationCountRef = useRef(0);

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
  const productionCandidates = useMemo(
    () =>
      assignedWorkOrders.flatMap((workOrder) =>
        (workOrder.operations ?? [])
          .filter((operation) => canLogProductionForOperation(operation, user?.id, workOrder))
          .map((operation) => ({ ...operation, workOrder }))
      ),
    [assignedWorkOrders, user?.id]
  );
  const scopedProductionCandidates = selectedWorkOrder
    ? productionCandidates.filter((operation) => operation.workOrder.id === selectedWorkOrder.id)
    : productionCandidates;
  const selectedProductionCandidate = scopedProductionCandidates.find((operation) => operation.id === selectedOperationId);
  const selectedProductionWorkOrder = selectedProductionCandidate?.workOrder ?? null;
  const rawSelectedProductionOperation = selectedProductionCandidate ?? null;
  const selectedProductionOperation =
    rawSelectedProductionOperation && canLogProductionForOperation(rawSelectedProductionOperation, user?.id, selectedProductionWorkOrder)
      ? { ...rawSelectedProductionOperation, workOrder: selectedProductionWorkOrder ?? rawSelectedProductionOperation.workOrder }
      : null;
  const displayedProductionCandidates = scopedProductionCandidates;
  const selectedDisplayQuantities = selectedWorkOrder ? getWorkOrderDisplayQuantities(selectedWorkOrder) : null;
  const selectedProgressPercent = selectedWorkOrder ? getProgressPercent(selectedWorkOrder) : 0;
  const productionContextWorkOrder = selectedProductionWorkOrder ?? selectedWorkOrder;
  const productionContextOperation = selectedProductionOperation ?? getProductionContextOperation(selectedWorkOrder, user?.id);
  const selectedProductionRemaining = selectedProductionOperation ? getOperationRemainingQuantity(selectedProductionOperation, selectedProductionWorkOrder) : 0;
  const selectedProductionTransferQuantity = selectedProductionOperation ? getOperationTransferQuantity(selectedProductionOperation, selectedProductionWorkOrder) : 0;
  const productionContextTransferQuantity = productionContextOperation && productionContextWorkOrder ? getOperationTransferQuantity(productionContextOperation, productionContextWorkOrder) : 0;
  const productionContextRemaining = productionContextOperation && productionContextWorkOrder ? getOperationRemainingQuantity(productionContextOperation, productionContextWorkOrder) : 0;
  const productionUnavailableReason = !displayedProductionCandidates.length ? getProductionUnavailableReason(selectedWorkOrder, user?.id) : "";
  const runningWorkOrderCount = activeAssignedWorkOrders.filter((workOrder) => workOrder.status === "IN_PROGRESS").length;
  const totalRemainingQuantity = assignedWorkOrders.reduce((total, workOrder) => total + getRemainingQuantity(workOrder), 0);
  const productionBlockReason = rawSelectedProductionOperation
    ? !rawSelectedProductionOperation.machineId
      ? "Bu operasyon için makine atanmadığı için üretim kaydı girilemez."
      : !["READY", "IN_PROGRESS", "PAUSED"].includes(rawSelectedProductionOperation.status)
        ? "Bu operasyon üretim girişi durumunda değil."
        : rawSelectedProductionOperation.assignedOperatorId !== user?.id
          ? "Bu operasyon size atanmadığı için üretim kaydı girilemez."
          : getOperationRemainingQuantity(rawSelectedProductionOperation, selectedProductionWorkOrder) <= 0
            ? getSpecialWorkOrderInfo(selectedProductionWorkOrder)
              ? "Bu telafi operasyonunda üretilecek kalan adet yok."
              : "Bu operasyon için kalan üretim yok. Fire telafisi gerekiyorsa oluşan telafi iş emrinden üretim girin."
            : ""
    : "Üretim girişi için bir operasyon seçin.";
  const canCompleteProductionOperation =
    Boolean(rawSelectedProductionOperation && selectedProductionWorkOrder && canCompleteOperation(rawSelectedProductionOperation, selectedProductionWorkOrder, user));
  const canSubmitProductionEntry = Boolean(selectedProductionOperation && !productionBlockReason && !isSubmitting);

  const plannedShiftCount = shiftAssignments.filter((assignment) => ["PLANNED", "CONFIRMED"].includes(assignment.status)).length;
  const leaveShiftCount = shiftAssignments.filter((assignment) => assignment.status === "LEAVE").length;
  const absentShiftCount = shiftAssignments.filter((assignment) => assignment.status === "ABSENT").length;
  const shiftCalendarDays = useMemo(() => getMonthCalendarDays(shiftMonth, shiftAssignments), [shiftMonth, shiftAssignments]);

  useEffect(() => {
    selectedWorkOrderIdRef.current = selectedWorkOrderId;
  }, [selectedWorkOrderId]);

  useEffect(() => {
    setActiveMobileView("WORKS");
    setSelectedWorkOrderId("");
    setSelectedOperationId("");
  }, [user?.id]);

  useEffect(() => {
    if (!productionCandidates.length) {
      if (selectedOperationId) {
        setSelectedOperationId("");
      }
      return;
    }

    const selectedStillAvailable = productionCandidates.some(
      (operation) => operation.id === selectedOperationId && (!selectedWorkOrderId || operation.workOrder.id === selectedWorkOrderId)
    );

    if (selectedStillAvailable) {
      return;
    }

    const nextOperation = selectedWorkOrderId
      ? productionCandidates.find((operation) => operation.workOrder.id === selectedWorkOrderId)
      : null;

    if (nextOperation) {
      setSelectedOperationId(nextOperation.id);
      return;
    }

    if (activeMobileView === "PRODUCTION") {
      const fallbackOperation = productionCandidates[0];
      setSelectedOperationId(fallbackOperation.id);
      if (!selectedWorkOrderId) {
        setSelectedWorkOrderId(fallbackOperation.workOrder.id);
      }
      return;
    }

    setSelectedOperationId("");
  }, [activeMobileView, productionCandidates, selectedOperationId, selectedWorkOrderId]);

  useEffect(() => {
    pushDebugLogListener = (entry) => {
      if (user?.id) {
        createMobileDebugLog({
          category: "push",
          step: entry.step,
          platform: entry.payload.platform,
          payload: entry.payload
        }).catch(() => {});
      }
    };

    return () => {
      pushDebugLogListener = null;
    };
  }, [user?.id]);

  useEffect(() => {
    unreadNotificationCountRef.current = unreadNotificationCount;
  }, [unreadNotificationCount]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      appStateRef.current = nextState;

      if (nextState === "active" && user) {
        syncPendingOfflineOperations();
        loadNotifications();
        loadWorkOrders({ preserveMessage: true });
        loadShiftCalendar();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [user?.id]);

  async function refreshOfflineSummary() {
    try {
      setOfflineSummary(await getOfflineQueueSummary());
    } catch (_error) {
      setOfflineSummary({ pending: 0, synced: 0, failed: 0 });
    }
  }

  async function syncPendingOfflineOperations({ silent = true } = {}) {
    if (!user || isSyncingOfflineQueue) {
      return null;
    }

    setIsSyncingOfflineQueue(true);

    try {
      const summary = await syncOfflineQueue();
      setOfflineSummary({
        pending: summary.pending,
        synced: summary.synced,
        failed: summary.failed
      });
      setIsOfflineMode(!summary.isOnline);

      if (!silent && summary.isOnline && summary.pending === 0) {
        setSuccessMessage("Senkronizasyon tamamlandı.");
      }

      if (summary.isOnline) {
        await loadWorkOrders({ preserveMessage: true });
        await loadNotifications();
      }

      return summary;
    } catch (_error) {
      setIsOfflineMode(true);
      await refreshOfflineSummary();
      return null;
    } finally {
      setIsSyncingOfflineQueue(false);
    }
  }

  useEffect(() => {
    if (user?.id) {
      loadShiftCalendar(shiftMonth);
    }
  }, [user?.id, shiftMonth]);

  useEffect(() => {
    if (!user?.id) {
      return undefined;
    }

    let isMounted = true;

    async function prepareOfflineQueue() {
      await initOfflineQueue();
      if (!isMounted) {
        return;
      }

      await refreshOfflineSummary();
      if (isMounted) {
        await syncPendingOfflineOperations({ silent: true });
      }
    }

    prepareOfflineQueue();

    return () => {
      isMounted = false;
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
    setShiftAssignments([]);
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
      updateAppBadgeCount(response.meta.unreadCount);
    } catch (notificationError) {
      if (isUnauthorizedError(notificationError)) {
        await clearExpiredSession();
      }
    }
  }

  async function loadShiftCalendar(targetMonth = shiftMonth, operatorId = user?.id) {
    if (!operatorId) {
      return;
    }

    try {
      const data = await getShiftAssignments({
        month: targetMonth,
        operatorId
      });
      setShiftAssignments(data);
    } catch (shiftError) {
      if (isUnauthorizedError(shiftError)) {
        await clearExpiredSession();
      }
    }
  }

  async function registerDevicePushToken() {
    try {
      logPushDebug("register-device-start", { userId: user?.id });
      setPushStatus("Telefon bildirimi hazirlaniyor...");
      const nativeTokenDiagnostic = await getNativeDevicePushTokenDiagnostic();
      logPushDebug("register-device-native-diagnostic", { nativeTokenDiagnostic });
      setPushStatus(`Native cihaz token durumu: ${nativeTokenDiagnostic}. Expo push token aliniyor...`);
      const token = await getExpoPushTokenForDevice();

      if (!token) {
        const hasPermission = await ensureSystemNotificationPermission();
        logPushDebug("register-device-token-empty", { hasPermission, nativeTokenDiagnostic });
        setPushStatus(
          hasPermission
            ? `Push token alinamadi. Native token: ${nativeTokenDiagnostic}. Google Play servisleri, FCM ve EAS APK kurulumunu kontrol edin.`
            : "Bildirim izni verilmedi. Android ayarlarından MES Lite bildirim iznini açın."
        );
        return false;
      }

      logPushDebug("register-device-backend-start", {
        tokenPreview: maskPushToken(token),
        platform: Platform.OS
      });
      const registeredToken = await registerPushToken({
        token,
        platform: Platform.OS,
        deviceName: Platform.OS === "web" ? "Web" : "Mobile"
      });
      logPushDebug("register-device-backend-success", {
        tokenId: registeredToken?.id,
        isActive: registeredToken?.isActive,
        lastSeenAt: registeredToken?.lastSeenAt
      });
      setPushStatus(`Telefon bildirimi aktif. Token: ${maskPushToken(token)}`);
      return true;
    } catch (pushError) {
      const errorMessage = pushError?.message ?? "Bilinmeyen hata";
      logPushDebug("register-device-error", {
        message: errorMessage,
        responseStatus: pushError?.response?.status,
        responseMessage: pushError?.response?.data?.message
      });
      console.log("Expo Push Token error:", errorMessage, pushError);
      setPushStatus(`Telefon bildirimi kaydedilemedi: ${errorMessage}. Rozet testi calisiyorsa sorun FCM/EAS push token tarafindadir.`);
      return false;
    }
  }

  async function loadPushStatus() {
    if (Platform.OS === "web") {
      setPushStatus("Web testinde telefon push bildirimi kullanilmaz. APK ile fiziksel telefonda test edin.");
      return;
    }

    try {
      logPushDebug("push-status-load-start");
      const tokens = await getMyPushTokens();
      const activeTokens = tokens.filter((token) => token.isActive);
      logPushDebug("push-status-load-success", {
        total: tokens.length,
        active: activeTokens.length,
        latest: activeTokens[0]?.lastSeenAt
      });
      setPushStatus(activeTokens.length ? `Telefon bildirimi aktif (${activeTokens.length} cihaz kayıtlı). Son kayıt: ${formatDateTime(activeTokens[0].lastSeenAt)}` : "Aktif telefon bildirimi yok. Bildirimleri Aktifleştir butonuna basın.");
    } catch (pushStatusError) {
      logPushDebug("push-status-load-error", {
        message: pushStatusError?.message,
        responseStatus: pushStatusError?.response?.status,
        responseMessage: pushStatusError?.response?.data?.message
      });
      setPushStatus("Bildirim durumu okunamadı.");
    }
  }

  async function handleMarkNotificationRead(notificationId) {
    try {
      const response = await markNotificationRead(notificationId);
      setNotifications((current) =>
        current.map((notification) => (notification.id === notificationId ? { ...notification, readAt: notification.readAt ?? new Date().toISOString() } : notification))
      );
      setUnreadNotificationCount(response.meta.unreadCount);
      updateAppBadgeCount(response.meta.unreadCount);
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
      updateAppBadgeCount(response.meta.unreadCount);
    } catch (_error) {
      setError("Bildirimler okundu olarak işaretlenemedi.");
    }
  }

  async function handleClearNotifications() {
    try {
      const response = await clearNotifications();
      setNotifications([]);
      setUnreadNotificationCount(response.meta.unreadCount);
      setNotificationCounts({});
      updateAppBadgeCount(response.meta.unreadCount);
      setSuccessMessage("Bildirimler temizlendi.");
    } catch (_error) {
      setError("Bildirimler temizlenemedi.");
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const session = await getStoredSession();

        if (session.token && session.user && isMounted) {
          setUser(session.user);
          await initOfflineQueue();
          await refreshOfflineSummary();
          await loadWorkOrders();
          await loadNotifications();
          await registerDevicePushToken();
          await loadPushStatus();
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
      const nextUnreadCount = unreadNotificationCountRef.current + 1;
      unreadNotificationCountRef.current = nextUnreadCount;
      setUnreadNotificationCount(nextUnreadCount);
      updateAppBadgeCount(nextUnreadCount);

      const workOrderId = notification.metadata?.workOrderId ?? (notification.entityType === "WorkOrder" ? notification.entityId : null);
      if (workOrderId && selectedWorkOrderIdRef.current !== workOrderId) {
        setNotificationCounts((current) => ({
          ...current,
          [workOrderId]: (current[workOrderId] ?? 0) + 1
        }));
      }

      showSystemNotification({
        title: notification.title,
        body: notification.message,
        badge: nextUnreadCount
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
      loadShiftCalendar();
    });

    const syncInterval = setInterval(() => {
      if (appStateRef.current === "active") {
        syncPendingOfflineOperations();
        loadNotifications();
        refreshWorkOrders({ preserveMessage: true });
        loadShiftCalendar();
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
      const cleanEmail = email.trim().toLocaleLowerCase("tr-TR");
      const cleanPassword = password.trim();
      const session = await login({ email: cleanEmail, password: cleanPassword });
      setEmail(cleanEmail);
      setPassword(cleanPassword);
      setUser(session.user);
      await initOfflineQueue();
      await refreshOfflineSummary();
      await loadWorkOrders();
      await loadNotifications();
      await syncPendingOfflineOperations({ silent: true });
      await loadShiftCalendar(shiftMonth, session.user.id);
      await registerDevicePushToken();
      await loadPushStatus();
    } catch (loginError) {
      setError(`${getErrorMessage(loginError, "Giriş yapılamadı.")} API: ${getApiBaseUrl()}`);
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
    setOfflineSummary({ pending: 0, synced: 0, failed: 0 });
    setIsOfflineMode(false);
    setLastProductionSubmission(null);
  }

  async function runAction(action, fallbackMessage) {
    setError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const result = await action();
      await refreshOfflineSummary();

      if (!isOfflineQueuedResult(result)) {
        await loadWorkOrders();
      }

      return result ?? true;
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

  function updateLocalOperationStatus(operationId, status) {
    setWorkOrders((current) =>
      current.map((workOrder) => ({
        ...workOrder,
        status: status === "IN_PROGRESS" && workOrder.status === "PLANNED" ? "IN_PROGRESS" : workOrder.status,
        operations: (workOrder.operations ?? []).map((operation) =>
          operation.id === operationId ? { ...operation, status, offlineStatusPending: true } : operation
        )
      }))
    );
  }

  function updateLocalOperationProduction(operationId, producedQuantity, scrapQuantity) {
    setWorkOrders((current) =>
      current.map((workOrder) => ({
        ...workOrder,
        operations: (workOrder.operations ?? []).map((operation) =>
          operation.id === operationId
            ? {
                ...operation,
                producedQuantity: (operation.producedQuantity ?? 0) + producedQuantity,
                scrapQuantity: (operation.scrapQuantity ?? 0) + scrapQuantity,
                offlineStatusPending: true
              }
            : operation
        )
      }))
    );
  }

  function completeLocalOperation(operationId) {
    setWorkOrders((current) =>
      current.map((workOrder) => {
        const operationIndex = (workOrder.operations ?? []).findIndex((operation) => operation.id === operationId);
        if (operationIndex < 0) {
          return workOrder;
        }

        const operations = workOrder.operations.map((operation, index) => {
          if (index === operationIndex) {
            return { ...operation, status: "COMPLETED", offlineStatusPending: true };
          }

          if (index === operationIndex + 1 && operation.status === "WAITING") {
            return { ...operation, status: "READY", offlineStatusPending: true };
          }

          return operation;
        });

        return {
          ...workOrder,
          status: operationIndex === operations.length - 1 ? "COMPLETED" : workOrder.status,
          operations
        };
      })
    );
  }

  async function handleOperationAction(action, successText, fallbackMessage, onQueued) {
    const result = await runAction(action, fallbackMessage);
    if (result) {
      const isQueued = isOfflineQueuedResult(result);
      if (isQueued) {
        onQueued?.();
      }
      setSuccessMessage(isQueued ? "Kaydedildi, senkronizasyon bekliyor." : successText);
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
      "Operasyon duraklatılamadı.",
      () => updateLocalOperationStatus(operationId, "PAUSED")
    );
  }

  async function handleCompleteProductionOperation() {
    if (!rawSelectedProductionOperation) {
      setError("Tamamlanacak operasyon bulunamadı.");
      return;
    }

    await handleOperationAction(
      () => completeWorkOrderOperation(rawSelectedProductionOperation.id),
      "Operasyon tamamlandı. Ürün sıradaki adıma devredildi.",
      "Operasyon tamamlanamadı.",
      () => completeLocalOperation(rawSelectedProductionOperation.id)
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
      setSuccessMessage(isOfflineQueuedResult(isSuccess) ? "Kaydedildi, senkronizasyon bekliyor." : "Operasyon mesajı gönderildi.");
    }
  }

  async function handleProductionEntry() {
    const produced = Number(producedQuantity);
    const scrap = Number(scrapQuantity);

    setError("");
    setSuccessMessage("");

    if (!selectedProductionOperation?.machineId || !selectedProductionWorkOrder || productionBlockReason) {
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

    if (scrap > 0 && !scrapDisposition) {
      setError("Fire girildiğinde fire kararı seçilmelidir.");
      return;
    }

    const resolutionQuantity = Number(scrapResolutionQuantity);

    if (scrap > 0 && (!Number.isFinite(resolutionQuantity) || resolutionQuantity < 0 || resolutionQuantity > scrap)) {
      setError(`Fire çözüm adedi 0 ile ${scrap} arasında olmalıdır.`);
      return;
    }

    if (scrap > 0 && scrapDisposition === "REPRODUCE" && resolutionQuantity <= 0) {
      setError("Yeniden üretim kararı için yeniden üretilecek adet girilmelidir.");
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
    const submitOperationId = createOperationId();
    const submittedAt = new Date().toISOString();
    const submissionBase = {
      operationId: submitOperationId,
      orderNo: selectedProductionWorkOrder.orderNo,
      operationName: selectedProductionOperation.operationName,
      producedQuantity: produced,
      scrapQuantity: scrap,
      submittedAt
    };
    setLastProductionSubmission({
      ...submissionBase,
      status: "SENDING",
      message: "Backend'e gönderiliyor."
    });

    try {
      const productionLog = await createProductionLog({
        operationId: submitOperationId,
        workOrderId: selectedProductionWorkOrder.id,
        workOrderOperationId: selectedProductionOperation.id,
        machineId: selectedProductionOperation.machineId,
        producedQuantity: produced,
        scrapQuantity: scrap,
        ...(scrap > 0 ? { scrapReason } : {}),
        ...(scrap > 0
          ? {
              scrapDisposition,
              scrapResolutionQuantity: resolutionQuantity,
              ...(scrapDispositionNote ? { scrapDispositionNote } : {})
            }
          : {}),
        ...(isCriticalAlert ? { isCriticalAlert, alertSeverity } : {}),
        ...(note ? { note } : {})
      });

      const isQueued = isOfflineQueuedResult(productionLog);

      if (isQueued) {
        updateLocalOperationProduction(selectedProductionOperation.id, produced, scrap);
        await refreshOfflineSummary();
        setLastProductionSubmission({
          ...submissionBase,
          status: "PENDING",
          message: "Local kuyruğa alındı, senkronizasyon bekliyor."
        });
        setSuccessMessage(`Kaydedildi, senkronizasyon bekliyor${selectedImage ? ". Görsel bağlantı geldiğinde tekrar eklenmeli." : "."}`);
        setProducedQuantity("10");
        setScrapQuantity("0");
        setScrapReason("");
        setScrapDisposition("REPRODUCE");
        setScrapResolutionQuantity("0");
        setScrapDispositionNote("");
        setNote("");
        setIsCriticalAlert(false);
        setAlertSeverity("WARNING");
        setSelectedImage(null);
        return;
      }

      if (selectedImage) {
        await uploadProductionLogImage(productionLog.id, selectedImage);
      }

      await loadWorkOrders();
      setLastProductionSubmission({
        ...submissionBase,
        status: "SYNCED",
        productionLogId: productionLog.id,
        message: "Backend'e kaydedildi."
      });
      setSuccessMessage(`${produced} üretim ve ${scrap} fire kaydı alındı${selectedImage ? ", görsel eklendi." : "."}`);
      setProducedQuantity("10");
      setScrapQuantity("0");
      setScrapReason("");
      setScrapDisposition("REPRODUCE");
      setScrapResolutionQuantity("0");
      setScrapDispositionNote("");
      setNote("");
      setIsCriticalAlert(false);
      setAlertSeverity("WARNING");
      setSelectedImage(null);
    } catch (productionError) {
      if (isUnauthorizedError(productionError)) {
        await clearExpiredSession();
        return;
      }

      const errorMessage = getErrorMessage(productionError, "Üretim girişi kaydedilemedi.");
      setLastProductionSubmission({
        ...submissionBase,
        status: "FAILED",
        message: errorMessage
      });
      setError(errorMessage);
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

  function handleOpenMobileNotification(notification) {
    const metadata = notification.metadata ?? {};
    const targetWorkOrderId = metadata.workOrderId ?? metadata.actionWorkOrderId ?? (notification.entityType === "WorkOrder" ? notification.entityId : null);
    const targetOperationId = metadata.operationId ?? metadata.workOrderOperationId ?? (notification.entityType === "WorkOrderOperation" ? notification.entityId : null);
    const targetWorkOrder = assignedWorkOrders.find(
      (workOrder) =>
        workOrder.id === targetWorkOrderId ||
        (targetOperationId && (workOrder.operations ?? []).some((operation) => operation.id === targetOperationId))
    );

    if (!targetWorkOrder) {
      setError("Bu bildirimdeki kayıt mobil iş listenizde bulunmuyor.");
      Alert.alert("Kayıt açılamadı", "Bu bildirimdeki iş emri hesabınızın mobil iş listesinde bulunmuyor.");
      return;
    }

    selectWorkOrder(targetWorkOrder);
    if (targetOperationId) {
      setSelectedOperationId(targetOperationId);
    }
    setError("");
    if (!notification.readAt) {
      handleMarkNotificationRead(notification.id);
    }
  }

  function moveMobileView(direction) {
    setActiveMobileView((currentView) => {
      const currentIndex = MOBILE_VIEW_ORDER.indexOf(currentView);
      const nextIndex = Math.min(Math.max(currentIndex + direction, 0), MOBILE_VIEW_ORDER.length - 1);
      const nextView = MOBILE_VIEW_ORDER[nextIndex];

      if (nextView === "DETAIL" && !selectedWorkOrder) {
        return currentView;
      }

      if (nextView === "PRODUCTION" && !selectedWorkOrder) {
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
          <TextInput style={styles.input} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="username" value={email} onChangeText={setEmail} />
          <Text style={styles.label}>Şifre</Text>
          <TextInput style={styles.input} autoCapitalize="none" autoCorrect={false} secureTextEntry textContentType="password" value={password} onChangeText={setPassword} />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.primaryButton} onPress={handleLogin} disabled={isSubmitting}>
            <Text style={styles.primaryButtonText}>{isSubmitting ? "Giriş yapılıyor..." : "Giriş Yap"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const offlineStatusTitle = isSyncingOfflineQueue
    ? "Senkronizasyon yapılıyor"
    : isOfflineMode
      ? "İnternet yok"
      : offlineSummary.failed > 0
        ? "Senkronize edilemeyen kayıt var"
        : offlineSummary.pending > 0
          ? "Senkronizasyon bekliyor"
          : "Senkronizasyon tamamlandı";
  const offlineStatusText = `${offlineSummary.pending} bekleyen, ${offlineSummary.failed} başarısız kayıt`;

  if (user.role === "QUALITY_STAFF") {
    return (
      <MobileQualityView
        user={user}
        offlineSummary={offlineSummary}
        isOfflineMode={isOfflineMode}
        isSyncing={isSyncingOfflineQueue}
        onSync={() => syncPendingOfflineOperations({ silent: false })}
        onQueued={refreshOfflineSummary}
        onLogout={handleLogout}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
        onMarkNotificationRead={handleMarkNotificationRead}
        onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        onClearNotifications={handleClearNotifications}
        pushStatus={pushStatus}
      />
    );
  }

  const isWorkTabActive = ["WORKS", "DETAIL", "PRODUCTION"].includes(activeMobileView);
  const bottomTabs = [
    { value: "WORKS", label: "İşler", icon: "construct-outline", activeIcon: "construct" },
    { value: "CALENDAR", label: "Takvim", icon: "calendar-outline", activeIcon: "calendar" },
    { value: "SYNC", label: "Senkron", icon: "sync-outline", activeIcon: "sync", badge: offlineSummary.pending + offlineSummary.failed },
    { value: "NOTIFICATIONS", label: "Bildirim", icon: "notifications-outline", activeIcon: "notifications", badge: unreadNotificationCount },
    { value: "PROFILE", label: "Profil", icon: "person-outline", activeIcon: "person" }
  ];
  const activeViewTitle = activeMobileView === "DETAIL"
    ? "İş Emri Detayı"
    : activeMobileView === "PRODUCTION"
      ? "Üretim Girişi"
      : bottomTabs.find((tab) => tab.value === activeMobileView)?.label ?? "İşler";

  return (
    <View style={styles.appShell}>
    <ScrollView style={styles.page} contentContainerStyle={styles.pageContent}>
      <View style={styles.compactHeader}>
        <View style={styles.compactHeaderIcon}>
          <Ionicons name="construct" size={20} color="#70d7c0" />
        </View>
        <View style={styles.compactHeaderText}>
          <Text style={styles.compactHeaderTitle}>{activeViewTitle}</Text>
          <Text style={styles.compactHeaderSubtitle} numberOfLines={1}>{user.name}</Text>
        </View>
        <View style={styles.connectionIndicator}>
          <View style={[styles.connectionDot, isOfflineMode ? styles.connectionDotOffline : null]} />
          <Text style={styles.connectionLabel}>{isOfflineMode ? "Offline" : "Online"}</Text>
        </View>
      </View>

      {isOfflineMode || isSyncingOfflineQueue || offlineSummary.pending > 0 || offlineSummary.failed > 0 ? (
      <View style={[styles.syncStatus, isOfflineMode || offlineSummary.failed > 0 ? styles.syncStatusWarning : null]}>
        <View>
          <Text style={styles.syncStatusTitle}>{offlineStatusTitle}</Text>
          <Text style={styles.syncStatusText}>{offlineStatusText}</Text>
        </View>
        <Pressable style={styles.inlineButton} onPress={() => syncPendingOfflineOperations({ silent: false })} disabled={isSyncingOfflineQueue}>
          <Text style={styles.inlineButtonText}>{isSyncingOfflineQueue ? "Kontrol ediliyor" : "Şimdi Senkronize Et"}</Text>
        </Pressable>
      </View>
      ) : null}

      {activeMobileView === "SYNC" ? <OfflineQueuePanel
        summary={offlineSummary}
        onSync={() => syncPendingOfflineOperations({ silent: false })}
        onChanged={refreshOfflineSummary}
      /> : null}

      {isWorkTabActive ? <View style={styles.mobileSummary}>
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
      </View> : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {successMessage ? <Text style={styles.success}>{successMessage}</Text> : null}
      {user && error ? (
        <Pressable style={styles.inlineButton} onPress={loadWorkOrders} disabled={isSubmitting}>
          <Text style={styles.inlineButtonText}>Tekrar Dene</Text>
        </Pressable>
      ) : null}

      {activeMobileView === "NOTIFICATIONS" ? <View style={[styles.card, styles.notificationPanelCard]}>
        <View style={styles.notificationPanelHeader}>
          <View>
            <Text style={styles.sectionTitle}>Bildirimler</Text>
            <Text style={styles.muted}>{unreadNotificationCount} okunmamış bildirim</Text>
          </View>
          <View style={styles.notificationHeaderActions}>
            <Pressable style={styles.inlineButton} onPress={handleMarkAllNotificationsRead} disabled={!unreadNotificationCount || isSubmitting}>
              <Text style={styles.inlineButtonText}>Tümünü Okundu Yap</Text>
            </Pressable>
            <Pressable style={styles.inlineButton} onPress={handleClearNotifications} disabled={!notifications.length || isSubmitting}>
              <Text style={styles.inlineButtonText}>Temizle</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView style={styles.notificationListScroll} nestedScrollEnabled>
          {notifications.map((notification) => (
            <View key={notification.id} style={[styles.mobileNotificationCard, !notification.readAt ? styles.mobileNotificationUnread : null]}>
              <View style={styles.mobileNotificationText}>
                <Text style={styles.detailValue}>{notification.title}</Text>
                <Text style={styles.muted}>{notification.message}</Text>
                <Text style={styles.detailLabel}>{formatDateTime(notification.createdAt)}</Text>
                <Pressable style={styles.notificationTargetButton} onPress={() => handleOpenMobileNotification(notification)}>
                  <Ionicons name="arrow-forward-circle-outline" size={17} color="#0f7f78" />
                  <Text style={styles.notificationTargetLink}>Kayda git</Text>
                </Pressable>
              </View>
              {!notification.readAt ? (
                <Pressable style={styles.inlineButton} onPress={(event) => { event.stopPropagation(); handleMarkNotificationRead(notification.id); }} disabled={isSubmitting}>
                  <Text style={styles.inlineButtonText}>Okundu</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>
        {!notifications.length ? <Text style={styles.muted}>Henüz bildirim yok.</Text> : null}
      </View> : null}

      {activeMobileView === "SYNC" ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Senkronizasyon Özeti</Text>
          <Text style={styles.muted}>Offline kaydedilen işlemler burada güvenli biçimde takip edilir.</Text>
          <View style={styles.mobileSummary}>
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{offlineSummary.pending}</Text><Text style={styles.detailLabel}>Bekleyen</Text></View>
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{offlineSummary.failed}</Text><Text style={styles.detailLabel}>Başarısız</Text></View>
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{offlineSummary.synced}</Text><Text style={styles.detailLabel}>Tamamlanan</Text></View>
          </View>
        </View>
      ) : null}

      {activeMobileView === "PROFILE" ? (
        <View style={styles.card}>
          <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{user.name?.charAt(0)?.toUpperCase() ?? "M"}</Text></View>
          <Text style={styles.profileName}>{user.name}</Text>
          <Text style={styles.muted}>{user.email}</Text>
          <View style={styles.profileInfoRow}><Text style={styles.detailLabel}>Rol</Text><Text style={styles.detailValue}>{user.role}</Text></View>
          <View style={styles.profileInfoRow}><Text style={styles.detailLabel}>Bağlantı</Text><Text style={styles.detailValue}>{isOfflineMode ? "Çevrimdışı" : "Çevrimiçi"}</Text></View>
          <View style={styles.profileInfoRow}><Text style={styles.detailLabel}>API</Text><Text style={styles.profileApiText}>{getApiBaseUrl()}</Text></View>
          <View style={styles.profileStatusBox}><Text style={styles.detailLabel}>Telefon bildirimleri</Text><Text style={styles.muted}>{pushStatus}</Text></View>
          <Pressable style={styles.secondaryButton} onPress={handleLogout}><Text style={styles.secondaryButtonText}>Çıkış Yap</Text></Pressable>
        </View>
      ) : null}

      <View {...mobileViewPanResponder.panHandlers}>
      {activeMobileView === "WORKS" ? (
        <View style={styles.workSection}>
          <Text style={styles.sectionTitle}>Aktif İşlerim</Text>
          {activeAssignedWorkOrders.map((workOrder) => (
            <Pressable
              key={workOrder.id}
              style={[styles.orderCard, selectedWorkOrderId === workOrder.id ? styles.selectedOrderRow : null]}
              onPress={() => selectWorkOrder(workOrder)}
            >
              <View style={styles.orderCardHeader}>
                <View style={styles.orderCardMain}>
                  <Text style={styles.orderNo}>{workOrder.orderNo}</Text>
                  <Text style={styles.muted}>
                    {workOrder.product.code} - {workOrder.product.name}
                  </Text>
                  {getSpecialWorkOrderInfo(workOrder) ? <Text style={styles.specialOrderBadge}>{getSpecialWorkOrderInfo(workOrder).label}</Text> : null}
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
        <View style={styles.workSection}>
          <Text style={styles.sectionTitle}>Devam Eden Takiplerim</Text>
          {handoffAssignedWorkOrders.map((workOrder) => (
            <Pressable
              key={workOrder.id}
              style={[styles.orderCard, styles.followUpOrderCard, selectedWorkOrderId === workOrder.id ? styles.selectedOrderRow : null]}
              onPress={() => selectWorkOrder(workOrder)}
            >
              <View style={styles.orderCardHeader}>
                <View style={styles.orderCardMain}>
                  <Text style={styles.orderNo}>{workOrder.orderNo}</Text>
                  <Text style={styles.muted}>
                    {workOrder.product.code} - {workOrder.product.name}
                  </Text>
                  {getSpecialWorkOrderInfo(workOrder) ? <Text style={styles.specialOrderBadge}>{getSpecialWorkOrderInfo(workOrder).label}</Text> : null}
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
        <View style={styles.workSection}>
          <Text style={styles.sectionTitle}>Geçmiş / Kapalı İşler</Text>
          {closedAssignedWorkOrders.map((workOrder) => (
            <Pressable
              key={workOrder.id}
              style={[styles.orderCard, selectedWorkOrderId === workOrder.id ? styles.selectedOrderRow : null]}
              onPress={() => selectWorkOrder(workOrder)}
            >
              <View style={styles.orderCardHeader}>
                <View style={styles.orderCardMain}>
                  <Text style={styles.orderNo}>{workOrder.orderNo}</Text>
                  <Text style={styles.muted}>
                    {workOrder.product.code} - {workOrder.product.name}
                  </Text>
                  {getSpecialWorkOrderInfo(workOrder) ? <Text style={styles.specialOrderBadge}>{getSpecialWorkOrderInfo(workOrder).label}</Text> : null}
                </View>
                <View style={styles.cardBadgeStack}>
                  {notificationCounts[workOrder.id] ? <Text style={styles.notificationBadge}>{notificationCounts[workOrder.id]}</Text> : null}
                  <Text style={[styles.statusBadge, isShortClosedWorkOrder(workOrder) ? styles.shortClosedBadge : null]}>{getWorkOrderStatusLabel(workOrder)}</Text>
                </View>
              </View>
              <View style={styles.orderCardFooter}>
                <Text style={styles.detailValue}>
                  Üretim: {getWorkOrderDisplayQuantities(workOrder).producedQuantity}/{workOrder.plannedQuantity}
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

          <View style={styles.detailCommandBar}>
            <Pressable style={styles.detailBackButton} onPress={() => setActiveMobileView("WORKS")}>
              <Ionicons name="arrow-back" size={18} color="#526670" />
              <Text style={styles.detailBackButtonText}>İş Listesi</Text>
            </Pressable>
            {!isClosedWorkOrder(selectedWorkOrder) && mySelectedOperations.length ? (
              <Pressable style={styles.productionEntryButton} onPress={() => setActiveMobileView("PRODUCTION")}>
                <Ionicons name="add-circle-outline" size={19} color="#ffffff" />
                <Text style={styles.productionEntryButtonText}>Üretim Girişi</Text>
              </Pressable>
            ) : null}
          </View>

          {getSpecialWorkOrderInfo(selectedWorkOrder) ? (
            <View style={styles.specialOrderNotice}>
              <Text style={styles.specialOrderNoticeTitle}>{getSpecialWorkOrderInfo(selectedWorkOrder).label}</Text>
              <Text style={styles.muted}>{getSpecialWorkOrderInfo(selectedWorkOrder).text}</Text>
            </View>
          ) : null}

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
              <Text style={styles.kpiValue}>{selectedDisplayQuantities?.producedQuantity ?? selectedWorkOrder.producedQuantity}</Text>
              <Text style={styles.detailLabel}>Üretim</Text>
            </View>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiValue}>{selectedDisplayQuantities?.scrapQuantity ?? selectedWorkOrder.scrapQuantity}</Text>
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
                  <Text style={styles.detailValue}>{getMyCurrentOperationText(selectedWorkOrder, user.id)}</Text>
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
                      <Text style={[styles.operationSequence, styles[`operationSequence${operation.status}`]]}>{operation.sequenceNo}</Text>
                      <View style={styles.operationHeaderText}>
                        <Text style={styles.operationName}>{operation.operationName}</Text>
                        <Text style={styles.muted}>{operation.machine?.code ?? "Makine yok"}</Text>
                      </View>
                      <Text
                        style={[
                          styles.operationStage,
                          styles[`operationStage${operation.status}`],
                          isShortCompletedOperation(operation, selectedWorkOrder) ? styles.shortClosedBadge : null
                        ]}
                      >
                        {getOperationStageLabel(operation, selectedWorkOrder)}
                      </Text>
                    </View>
                    <Text style={styles.detailValue}>{getOperationStatusLabel(operation, selectedWorkOrder)}</Text>
                    {operation.offlineStatusPending ? (
                      <Text style={styles.myOperationText}>Yerel olarak güncellendi. Senkronizasyon bekleniyor.</Text>
                    ) : null}
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
                    {isMine && !isClosedWorkOrder(selectedWorkOrder) && isBeforePlannedStart(selectedWorkOrder) ? (
                      <Text style={styles.error}>Plan tarihi gelmeden operatör operasyonu başlatamaz.</Text>
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
                              "Operasyon başlatılamadı.",
                              () => updateLocalOperationStatus(operation.id, "IN_PROGRESS")
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
                              "Operasyon tamamlanamadı.",
                              () => completeLocalOperation(operation.id)
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

      {activeMobileView === "CALENDAR" ? (
        <View style={styles.card}>
          <View style={styles.calendarHeader}>
            <View>
              <Text style={styles.sectionTitle}>Vardiya Takvimim</Text>
              <Text style={styles.muted}>{formatMonthLabel(shiftMonth)}</Text>
            </View>
            <View style={styles.calendarMonthActions}>
              <Pressable style={styles.inlineButton} onPress={() => setShiftMonth(getPreviousMonth(shiftMonth))} disabled={isSubmitting}>
                <Text style={styles.inlineButtonText}>Önceki</Text>
              </Pressable>
              <Pressable style={styles.inlineButton} onPress={() => setShiftMonth(getCurrentMonth())} disabled={isSubmitting}>
                <Text style={styles.inlineButtonText}>Bugün</Text>
              </Pressable>
              <Pressable style={styles.inlineButton} onPress={() => setShiftMonth(getNextMonth(shiftMonth))} disabled={isSubmitting}>
                <Text style={styles.inlineButtonText}>Sonraki</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.shiftSummaryRow}>
            <View style={styles.shiftSummaryBox}>
              <Text style={styles.summaryValue}>{plannedShiftCount}</Text>
              <Text style={styles.detailLabel}>Planlı</Text>
            </View>
            <View style={styles.shiftSummaryBox}>
              <Text style={styles.summaryValue}>{leaveShiftCount}</Text>
              <Text style={styles.detailLabel}>İzin</Text>
            </View>
            <View style={styles.shiftSummaryBox}>
              <Text style={styles.summaryValue}>{absentShiftCount}</Text>
              <Text style={styles.detailLabel}>Gelmedi</Text>
            </View>
          </View>

          <View style={styles.shiftCalendarGrid}>
            {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((dayName) => (
              <Text key={dayName} style={styles.shiftWeekday}>
                {dayName}
              </Text>
            ))}
            {shiftCalendarDays.map((day) => {
              const assignment = day.assignment;
              const isLeave = assignment?.status === "LEAVE";
              const isAbsent = assignment?.status === "ABSENT";
              const shiftCode = assignment?.shift ? getShiftShortCode(assignment.shift) : "+";
              const shiftTime = assignment?.shift ? `${assignment.shift.startTime}-${assignment.shift.endTime}` : "";

              return (
                <View
                  key={day.key}
                  style={[
                    styles.shiftDayCell,
                    day.isEmpty ? styles.shiftDayCellEmpty : null,
                    assignment ? styles.shiftDayCellAssigned : null,
                    isLeave ? styles.shiftCalendarLeave : null,
                    isAbsent ? styles.shiftCalendarAbsent : null
                  ]}
                >
                  {!day.isEmpty ? (
                    <>
                      <View style={styles.shiftDayHeader}>
                        <Text style={styles.shiftDayNumber}>{day.day}</Text>
                        <Text style={[styles.shiftDayCode, assignment ? null : styles.shiftDayCodeEmpty]}>{shiftCode}</Text>
                      </View>
                      {assignment ? (
                        <>
                          <Text style={styles.shiftDayStatus} numberOfLines={1}>
                            {SHIFT_STATUS_LABELS[assignment.status] ?? assignment.status}
                          </Text>
                          <Text style={styles.shiftDayTime} numberOfLines={1}>
                            {shiftTime}
                          </Text>
                          {assignment.note ? (
                            <Text style={styles.shiftDayNote} numberOfLines={2}>
                              {assignment.note}
                            </Text>
                          ) : null}
                        </>
                      ) : (
                        <Text style={styles.shiftDayTime} numberOfLines={1}>
                          Plan yok
                        </Text>
                      )}
                    </>
                  ) : null}
                </View>
              );
            })}
          </View>

          {!shiftAssignments.length ? <Text style={styles.muted}>Bu ay için vardiya planı bulunmuyor.</Text> : null}
        </View>
      ) : null}

      {activeMobileView === "PRODUCTION" ? (
      <View style={styles.card}>
        <View style={styles.productionFormHeader}>
          <Text style={styles.sectionTitle}>Üretim Girişi</Text>
          <Pressable style={styles.detailBackButton} onPress={() => setActiveMobileView("DETAIL")}>
            <Ionicons name="arrow-back" size={18} color="#526670" />
            <Text style={styles.detailBackButtonText}>Detaya Dön</Text>
          </Pressable>
        </View>
        <Text style={styles.label}>İş Emri</Text>
        {selectedWorkOrder ? (
          <View style={[styles.operationChoiceButton, styles.choiceButtonActive]}>
            <Text style={styles.choiceText}>{selectedWorkOrder.orderNo}</Text>
            <Text style={styles.muted}>
              {productionContextOperation
                ? `${productionContextOperation.sequenceNo}. ${productionContextOperation.operationName} - ${OPERATION_STATUS_LABELS[productionContextOperation.status] ?? productionContextOperation.status}`
                : "Operasyon bulunamadı"}
            </Text>
            {getSpecialWorkOrderInfo(selectedWorkOrder) ? <Text style={styles.specialOrderBadge}>{getSpecialWorkOrderInfo(selectedWorkOrder).label}</Text> : null}
          </View>
        ) : (
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
        )}
        {!displayedProductionCandidates.length ? (
          <View style={styles.productionNotice}>
            <Text style={styles.detailLabel}>Üretim girişi kapalı</Text>
            <Text style={styles.muted}>{productionUnavailableReason}</Text>
          </View>
        ) : null}
        {getSpecialWorkOrderInfo(productionContextWorkOrder) ? (
          <View style={styles.specialOrderNotice}>
            <Text style={styles.specialOrderNoticeTitle}>{getSpecialWorkOrderInfo(productionContextWorkOrder).label}</Text>
            <Text style={styles.muted}>{getSpecialWorkOrderInfo(productionContextWorkOrder).text}</Text>
          </View>
        ) : null}
        {productionContextOperation && productionContextWorkOrder ? (
          <View style={styles.productionNotice}>
            <Text style={styles.detailLabel}>{selectedProductionOperation ? "Seçili operasyon" : "Operasyon bilgisi"}</Text>
            <Text style={styles.detailValue}>
              {productionContextWorkOrder.orderNo} - {productionContextOperation.operationName}
            </Text>
            <Text style={styles.muted}>
              Önceki adımdan gelen: {selectedProductionOperation ? selectedProductionTransferQuantity : productionContextTransferQuantity} adet, kalan: {selectedProductionOperation ? selectedProductionRemaining : productionContextRemaining} adet
            </Text>
            <Text style={styles.muted}>
              Makine: {productionContextOperation.machine?.name ?? productionContextOperation.machine?.code ?? "Makine atanmamış"}
            </Text>
            <Text style={styles.muted}>
              Operasyon üretim/fire: {productionContextOperation.producedQuantity}/{productionContextOperation.scrapQuantity}
            </Text>
          </View>
        ) : null}
        {productionBlockReason && displayedProductionCandidates.length ? (
          <View style={styles.productionActionNotice}>
            <Text style={styles.error}>{productionBlockReason}</Text>
            {canCompleteProductionOperation ? (
              <>
                <Text style={styles.muted}>Bu adımın üretim miktarı tamamlanmış. Ürünü sıradaki operasyona devretmek için operasyonu tamamlayın.</Text>
                <Pressable style={styles.primaryButton} onPress={handleCompleteProductionOperation} disabled={isSubmitting}>
                  <Text style={styles.primaryButtonText}>{isSubmitting ? "Tamamlanıyor..." : "Operasyonu Tamamla"}</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}
        <Text style={styles.label}>Üretilen Adet</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={producedQuantity} onChangeText={setProducedQuantity} />
        <View style={styles.quickRow}>
          {QUICK_QUANTITIES.map((quantity) => (
            <Pressable
              key={quantity}
              style={[styles.quickButton, !canSubmitProductionEntry ? styles.disabledButton : null]}
              onPress={() => fillQuickQuantity(quantity)}
              disabled={!canSubmitProductionEntry}
            >
              <Text style={styles.quickButtonText}>{quantity}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Fire Adedi</Text>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={scrapQuantity}
          onChangeText={(value) => {
            setScrapQuantity(value);
            if (scrapDisposition === "REPRODUCE") {
              setScrapResolutionQuantity(value);
            }
          }}
        />
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
            <Text style={styles.label}>Fire Kararı</Text>
            <View style={styles.choiceList}>
              {SCRAP_DISPOSITIONS.map((disposition) => (
                <Pressable
                  key={disposition.value}
                  style={[styles.choiceButton, scrapDisposition === disposition.value ? styles.choiceButtonActive : null]}
                  onPress={() => {
                    setScrapDisposition(disposition.value);
                    if (disposition.value === "REPRODUCE") {
                      setScrapResolutionQuantity(scrapQuantity);
                    }
                  }}
                >
                  <Text style={styles.choiceText}>{disposition.label}</Text>
                </Pressable>
              ))}
            </View>
            {scrapDisposition === "REPRODUCE" ? (
              <>
                <Text style={styles.label}>Yeniden Üretilecek Adet</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={scrapResolutionQuantity} onChangeText={setScrapResolutionQuantity} />
              </>
            ) : null}
            <Text style={styles.label}>Fire Karar Notu</Text>
            <TextInput
              style={styles.input}
              value={scrapDispositionNote}
              onChangeText={setScrapDispositionNote}
              placeholder="Örn: 10 adet yeniden üretim planına alınacak"
            />
            <View style={styles.productionNotice}>
              <Text style={styles.detailLabel}>Fire takip notu</Text>
              <Text style={styles.muted}>
                Bu fire kaydı {SCRAP_DISPOSITION_LABELS[scrapDisposition] ?? "karar bekliyor"} olarak saklanacak. Sağlam adet müşteriye gidecek üretimi, fire adedi proses kaybını gösterir.
              </Text>
            </View>
          </>
        ) : null}
        <Text style={styles.label}>Not</Text>
        <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="İsteğe bağlı not" />
        <Pressable
          style={[styles.alertToggle, isCriticalAlert ? styles.alertToggleActive : null]}
          onPress={() => setIsCriticalAlert((current) => !current)}
          disabled={!canSubmitProductionEntry}
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
          <Pressable style={styles.secondaryButton} onPress={takePhoto} disabled={!canSubmitProductionEntry}>
            <Text style={styles.secondaryButtonText}>Kamera</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={pickImageFromGallery} disabled={!canSubmitProductionEntry}>
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
          style={[styles.primaryButton, !canSubmitProductionEntry ? styles.disabledButton : null]}
          onPress={handleProductionEntry}
          disabled={!canSubmitProductionEntry}
        >
          <Text style={styles.primaryButtonText}>{isSubmitting ? "Kaydediliyor..." : "Kaydet"}</Text>
        </Pressable>
        {lastProductionSubmission ? (
          <View
            style={[
              styles.lastSubmissionPanel,
              lastProductionSubmission.status === "FAILED" ? styles.lastSubmissionFailed : null,
              lastProductionSubmission.status === "PENDING" ? styles.lastSubmissionPending : null,
              lastProductionSubmission.status === "SYNCED" ? styles.lastSubmissionSynced : null
            ]}
          >
            <View style={styles.lastSubmissionHeader}>
              <Text style={styles.lastSubmissionTitle}>Son üretim işlemi</Text>
              <Text style={styles.lastSubmissionStatus}>
                {lastProductionSubmission.status === "SENDING"
                  ? "Gönderiliyor"
                  : lastProductionSubmission.status === "PENDING"
                    ? "Kuyrukta"
                    : lastProductionSubmission.status === "SYNCED"
                      ? "Kaydedildi"
                      : "Hata"}
              </Text>
            </View>
            <Text style={styles.detailValue}>
              {lastProductionSubmission.orderNo} - {lastProductionSubmission.operationName}
            </Text>
            <View style={styles.lastSubmissionGrid}>
              <View style={styles.lastSubmissionMetric}>
                <Text style={styles.detailLabel}>Üretim</Text>
                <Text style={styles.detailValue}>{lastProductionSubmission.producedQuantity}</Text>
              </View>
              <View style={styles.lastSubmissionMetric}>
                <Text style={styles.detailLabel}>Fire</Text>
                <Text style={styles.detailValue}>{lastProductionSubmission.scrapQuantity}</Text>
              </View>
              <View style={styles.lastSubmissionMetric}>
                <Text style={styles.detailLabel}>Saat</Text>
                <Text style={styles.detailValue}>{formatDateTime(lastProductionSubmission.submittedAt)}</Text>
              </View>
            </View>
            <Text style={styles.muted}>{lastProductionSubmission.message}</Text>
            <Text style={styles.lastSubmissionOperationId}>OperationId: {lastProductionSubmission.operationId}</Text>
          </View>
        ) : null}
      </View>
      ) : null}

      </View>
    </ScrollView>
    <View style={styles.bottomTabBar}>
      {bottomTabs.map((tab) => {
        const isActive = tab.value === "WORKS" ? isWorkTabActive : activeMobileView === tab.value;

        return (
          <Pressable
            key={tab.value}
            style={styles.bottomTabButton}
            onPress={() => setActiveMobileView(tab.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <View style={styles.bottomTabIconWrap}>
              <Ionicons name={isActive ? tab.activeIcon : tab.icon} size={22} color={isActive ? "#0f7f78" : "#687985"} />
              {tab.badge > 0 ? <Text style={styles.bottomTabBadge}>{tab.badge > 99 ? "99+" : tab.badge}</Text> : null}
            </View>
            <Text style={[styles.bottomTabLabel, isActive ? styles.bottomTabLabelActive : null]} numberOfLines={1}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: {
    flex: 1,
    backgroundColor: "#eef3f6"
  },
  compactHeader: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#173038",
    borderColor: "#294952",
    borderRadius: 10,
    borderWidth: 1
  },
  compactHeaderIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#21474a",
    borderColor: "#3b6a69",
    borderRadius: 8,
    borderWidth: 1
  },
  compactHeaderText: { flex: 1, minWidth: 0 },
  compactHeaderTitle: { color: "#ffffff", fontSize: 17, fontWeight: "900" },
  compactHeaderSubtitle: { marginTop: 2, color: "#b8c8cc", fontSize: 12, fontWeight: "600" },
  connectionIndicator: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 6, backgroundColor: "#233e46", borderRadius: 7 },
  connectionDot: { width: 7, height: 7, backgroundColor: "#1b9b67", borderRadius: 4 },
  connectionDotOffline: { backgroundColor: "#d7952b" },
  connectionLabel: { color: "#d9e5e7", fontSize: 10, fontWeight: "800" },
  page: {
    flex: 1,
    backgroundColor: "#eef3f6"
  },
  pageContent: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: 14,
    minHeight: fullScreenHeight,
    padding: 12,
    paddingTop: 18,
    paddingBottom: 24
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
    minHeight: 112,
    padding: 18,
    backgroundColor: "#12363d",
    borderColor: "#1d5960",
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: "#0f2930",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 4
  },
  eyebrow: {
    marginBottom: 4,
    color: "#8de7d2",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
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
    color: "#c7dce2",
    fontSize: 15
  },
  authSubtitle: {
    marginTop: 4,
    color: "#60707d"
  },
  mobileSummary: {
    flexDirection: "row",
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderColor: "#d9e4ea",
    borderRadius: 10,
    borderWidth: 1
  },
  syncStatus: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    backgroundColor: "#edfdfa",
    borderColor: "#99f6e4",
    borderLeftColor: "#0f7f78",
    borderLeftWidth: 4,
    borderRadius: 14,
    borderWidth: 1
  },
  syncStatusWarning: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderLeftColor: "#f97316"
  },
  syncStatusTitle: {
    color: "#0f2c34",
    fontSize: 14,
    fontWeight: "900"
  },
  syncStatusText: {
    color: "#607580",
    fontSize: 12,
    fontWeight: "700"
  },
  summaryItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: 8,
    borderRightColor: "#e6edf1",
    borderRightWidth: 1
  },
  summaryValue: {
    color: "#0f2c34",
    fontSize: 21,
    fontWeight: "900"
  },
  card: {
    gap: 12,
    padding: 16,
    backgroundColor: "#ffffff",
    borderColor: "#d9e4ea",
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#18313a",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 2
  },
  workSection: {
    gap: 10
  },
  tabCard: {
    padding: 8,
    borderRadius: 18
  },
  sectionTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
    color: "#0f2c34"
  },
  detailHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  detailCommandBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  detailBackButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 11,
    backgroundColor: "#f4f8fa",
    borderColor: "#cbd8df",
    borderRadius: 8,
    borderWidth: 1
  },
  detailBackButtonText: {
    color: "#526670",
    fontSize: 13,
    fontWeight: "800"
  },
  productionEntryButton: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 14,
    backgroundColor: "#0f7f78",
    borderRadius: 8
  },
  productionEntryButtonText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900"
  },
  productionFormHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10
  },
  statusBadge: {
    maxWidth: "100%",
    paddingHorizontal: 12,
    paddingVertical: 6,
    color: "#11635e",
    backgroundColor: "#d8f3ea",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden"
  },
  shortClosedBadge: {
    color: "#9a3412",
    backgroundColor: "#ffedd5"
  },
  specialOrderBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
    color: "#075985",
    backgroundColor: "#e0f2fe",
    borderColor: "#bae6fd",
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden"
  },
  specialOrderNotice: {
    gap: 4,
    padding: 12,
    backgroundColor: "#eef6ff",
    borderColor: "#bfdbfe",
    borderLeftColor: "#2563eb",
    borderLeftWidth: 4,
    borderRadius: 14,
    borderWidth: 1
  },
  specialOrderNoticeTitle: {
    color: "#075985",
    fontSize: 13,
    fontWeight: "900"
  },
  detailRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  detailBox: {
    flex: 1,
    gap: 5,
    minWidth: 140,
    minHeight: 72,
    justifyContent: "center",
    padding: 12,
    backgroundColor: "#f7fafb",
    borderColor: "#e1eaf0",
    borderRadius: 12,
    borderWidth: 1
  },
  detailLabel: {
    color: "#607580",
    fontSize: 12,
    fontWeight: "800"
  },
  detailValue: {
    color: "#0f2c34",
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "900"
  },
  kpiRow: {
    flexDirection: "row",
    gap: 8
  },
  kpiBox: {
    flex: 1,
    gap: 2,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#f7fafb",
    borderColor: "#e1eaf0",
    borderRadius: 12,
    borderWidth: 1
  },
  kpiValue: {
    color: "#0f2c34",
    fontSize: 24,
    fontWeight: "900"
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  progressTrack: {
    height: 12,
    overflow: "hidden",
    backgroundColor: "#e8eef2",
    borderRadius: 999
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#0f8f84",
    borderRadius: 999
  },
  label: {
    color: "#33424d",
    fontSize: 14,
    fontWeight: "700"
  },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    color: "#0f2c34",
    backgroundColor: "#fbfdfe",
    borderColor: "#c8d3dd",
    borderRadius: 12,
    borderWidth: 1
  },
  primaryButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#0f7f78",
    borderRadius: 12
  },
  primaryButtonText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  secondaryButton: {
    minHeight: 46,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    backgroundColor: "#ffffff",
    borderColor: "#c8d3dd",
    borderRadius: 12,
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
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#f8fbfc",
    borderColor: "#c8d3dd",
    borderRadius: 10,
    borderWidth: 1
  },
  inlineButtonText: {
    color: "#17202a",
    fontWeight: "800"
  },
  muted: {
    color: "#607580",
    lineHeight: 20
  },
  productionNotice: {
    gap: 6,
    padding: 14,
    backgroundColor: "#edfdfa",
    borderColor: "#9bd8c8",
    borderLeftColor: "#0f7f78",
    borderLeftWidth: 4,
    borderRadius: 14,
    borderWidth: 1
  },
  productionActionNotice: {
    gap: 10,
    padding: 12,
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderLeftColor: "#f97316",
    borderLeftWidth: 4,
    borderRadius: 14,
    borderWidth: 1
  },
  lastSubmissionPanel: {
    gap: 8,
    padding: 12,
    backgroundColor: "#f7fafb",
    borderColor: "#dbe3ea",
    borderLeftColor: "#64748b",
    borderLeftWidth: 4,
    borderRadius: 14,
    borderWidth: 1
  },
  lastSubmissionSynced: {
    backgroundColor: "#edfdfa",
    borderColor: "#99f6e4",
    borderLeftColor: "#0f7f78"
  },
  lastSubmissionPending: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderLeftColor: "#f97316"
  },
  lastSubmissionFailed: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderLeftColor: "#dc2626"
  },
  lastSubmissionHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8
  },
  lastSubmissionTitle: {
    color: "#0f2c34",
    fontSize: 14,
    fontWeight: "900"
  },
  lastSubmissionStatus: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    color: "#0f2c34",
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 999,
    borderWidth: 1,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 15,
    overflow: "hidden",
    textAlign: "center"
  },
  lastSubmissionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  lastSubmissionMetric: {
    flex: 1,
    minWidth: 96,
    gap: 3,
    padding: 10,
    backgroundColor: "#ffffff",
    borderColor: "#e1eaf0",
    borderRadius: 10,
    borderWidth: 1
  },
  lastSubmissionOperationId: {
    color: "#607580",
    fontSize: 11,
    lineHeight: 16
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  quickButton: {
    minWidth: 58,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f1f5f8",
    borderColor: "#dbe3ea",
    borderRadius: 12,
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
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: 12,
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
    gap: 12,
    padding: 14,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderLeftColor: "#0f7f78",
    borderLeftWidth: 4,
    borderRadius: 14,
    borderWidth: 1,
    shadowColor: "#18313a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1
  },
  orderCardHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  orderCardMain: {
    flex: 1,
    minWidth: 180
  },
  cardBadgeStack: {
    maxWidth: "48%",
    flexShrink: 1,
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
    borderColor: "#0f7f78",
    borderLeftColor: "#0f7f78"
  },
  followUpOrderCard: {
    backgroundColor: "#f8fafc",
    borderColor: "#c8d3dd",
    borderLeftColor: "#64748b"
  },
  notificationPanelHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  notificationHeaderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 8
  },
  notificationListScroll: {
    height: Math.max(fullScreenHeight - 330, 360),
    maxHeight: Math.max(fullScreenHeight - 330, 360)
  },
  notificationPanelCard: {
    minHeight: Math.max(fullScreenHeight - 260, 440)
  },
  calendarHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  calendarMonthActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  shiftSummaryRow: {
    flexDirection: "row",
    gap: 8
  },
  shiftSummaryBox: {
    flex: 1,
    minHeight: 68,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    backgroundColor: "#f7fafb",
    borderColor: "#e1eaf0",
    borderRadius: 12,
    borderWidth: 1
  },
  shiftCalendarList: {
    gap: 8
  },
  shiftCalendarCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 10,
    backgroundColor: "#f0fdfa",
    borderColor: "#b9eadb",
    borderRadius: 8,
    borderWidth: 1
  },
  shiftCalendarLeave: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa"
  },
  shiftCalendarAbsent: {
    backgroundColor: "#fee2e2",
    borderColor: "#fecaca"
  },
  shiftCalendarText: {
    flex: 1,
    gap: 3
  },
  shiftCalendarGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    padding: 6,
    backgroundColor: "#f8fbfc",
    borderColor: "#e1eaf0",
    borderRadius: 14,
    borderWidth: 1
  },
  shiftWeekday: {
    width: "13.45%",
    minHeight: 24,
    color: "#60707d",
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center"
  },
  shiftDayCell: {
    width: "13.45%",
    minHeight: 92,
    gap: 4,
    padding: 6,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 12,
    borderWidth: 1
  },
  shiftDayCellEmpty: {
    backgroundColor: "transparent",
    borderColor: "transparent"
  },
  shiftDayCellAssigned: {
    backgroundColor: "#ecfdf8",
    borderColor: "#8fd4c5"
  },
  shiftDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4
  },
  shiftDayNumber: {
    color: "#17202a",
    fontSize: 12,
    fontWeight: "900"
  },
  shiftDayCode: {
    minWidth: 22,
    height: 22,
    color: "#ffffff",
    backgroundColor: "#0f7f78",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    lineHeight: 22,
    overflow: "hidden",
    textAlign: "center"
  },
  shiftDayCodeEmpty: {
    color: "#8a9aa8",
    backgroundColor: "#edf1f5"
  },
  shiftDayStatus: {
    color: "#256f6c",
    fontSize: 10,
    fontWeight: "900"
  },
  shiftDayTime: {
    color: "#60707d",
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700"
  },
  shiftDayNote: {
    color: "#33424d",
    fontSize: 9,
    lineHeight: 12
  },
  mobileNotificationCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderLeftColor: "#c8d3dd",
    borderLeftWidth: 4,
    borderRadius: 14,
    borderWidth: 1
  },
  mobileNotificationUnread: {
    backgroundColor: "#effdf9",
    borderColor: "#0f7f78",
    borderLeftColor: "#0f7f78"
  },
  mobileNotificationText: {
    flex: 1,
    gap: 3
  },
  notificationTargetLink: {
    color: "#0f7f78",
    fontSize: 12,
    fontWeight: "900"
  },
  notificationTargetButton: {
    minHeight: 34,
    flexDirection: "row",
    alignSelf: "flex-start",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
    paddingHorizontal: 9,
    backgroundColor: "#effdf9",
    borderColor: "#9bd7ca",
    borderRadius: 6,
    borderWidth: 1
  },
  bottomTabBar: {
    flexDirection: "row",
    minHeight: 66,
    paddingTop: 7,
    paddingBottom: Platform.OS === "ios" ? 18 : 8,
    backgroundColor: "#ffffff",
    borderTopColor: "#d6e1e8",
    borderTopWidth: 1,
    shadowColor: "#0f2930",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10
  },
  bottomTabButton: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 2
  },
  bottomTabIconWrap: {
    position: "relative"
  },
  bottomTabBadge: {
    position: "absolute",
    top: -7,
    right: -12,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    overflow: "hidden",
    color: "#ffffff",
    backgroundColor: "#d93232",
    borderRadius: 9,
    fontSize: 9,
    fontWeight: "900",
    lineHeight: 17,
    textAlign: "center"
  },
  bottomTabLabel: {
    maxWidth: "100%",
    color: "#687985",
    fontSize: 10,
    fontWeight: "700"
  },
  bottomTabLabelActive: {
    color: "#0f7f78",
    fontWeight: "900"
  },
  profileAvatar: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#d9f3ed",
    borderRadius: 32
  },
  profileAvatarText: {
    color: "#0f6f69",
    fontSize: 26,
    fontWeight: "900"
  },
  profileName: {
    color: "#0f2c34",
    fontSize: 22,
    fontWeight: "900"
  },
  profileInfoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 12,
    borderBottomColor: "#e4ebf0",
    borderBottomWidth: 1
  },
  profileApiText: {
    flex: 1,
    color: "#0f2c34",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right"
  },
  profileStatusBox: {
    gap: 5,
    padding: 12,
    backgroundColor: "#f4f8fa",
    borderRadius: 10
  },
  orderNo: {
    color: "#0f2c34",
    fontSize: 15,
    fontWeight: "900"
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
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f1f5f8",
    borderColor: "#e4ebf0",
    borderRadius: 999,
    borderWidth: 1
  },
  operationChoiceButton: {
    minWidth: 150,
    flexGrow: 1,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "#f1f5f8",
    borderColor: "#e4ebf0",
    borderRadius: 14,
    borderWidth: 1
  },
  choiceButtonActive: {
    backgroundColor: "#d8f3ea",
    borderColor: "#0f7f78"
  },
  choiceText: {
    color: "#17202a",
    fontWeight: "700"
  },
  operationSection: {
    gap: 12
  },
  operationSummary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  operationCard: {
    gap: 9,
    marginLeft: 8,
    padding: 14,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderLeftColor: "#94a3b8",
    borderLeftWidth: 5,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: "#18313a",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.05,
    shadowRadius: 9,
    elevation: 1
  },
  myOperationCard: {
    borderColor: "#0f7f78",
    borderLeftColor: "#0f7f78",
    backgroundColor: "#eefaf7"
  },
  operationWAITING: {
    opacity: 0.72,
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderLeftColor: "#cbd5e1"
  },
  operationREADY: {
    backgroundColor: "#ecfeff",
    borderColor: "#67e8f9",
    borderLeftColor: "#0891b2"
  },
  operationIN_PROGRESS: {
    backgroundColor: "#e8f3ff",
    borderColor: "#60a5fa",
    borderLeftColor: "#2563eb"
  },
  operationPAUSED: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
    borderLeftColor: "#d97706"
  },
  operationCOMPLETED: {
    backgroundColor: "#ecfdf3",
    borderColor: "#4ade80",
    borderLeftColor: "#16a34a"
  },
  shortCompletedOperationCard: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderLeftColor: "#f97316"
  },
  operationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10
  },
  operationSequence: {
    minWidth: 32,
    height: 32,
    textAlign: "center",
    textAlignVertical: "center",
    color: "#ffffff",
    backgroundColor: "#0f7f78",
    borderRadius: 999,
    fontWeight: "900",
    lineHeight: 32,
    overflow: "hidden"
  },
  operationSequenceWAITING: {
    color: "#64748b",
    backgroundColor: "#e2e8f0"
  },
  operationSequenceREADY: {
    backgroundColor: "#0891b2"
  },
  operationSequenceIN_PROGRESS: {
    backgroundColor: "#2563eb"
  },
  operationSequencePAUSED: {
    backgroundColor: "#d97706"
  },
  operationSequenceCOMPLETED: {
    backgroundColor: "#16a34a"
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    color: "#ffffff",
    backgroundColor: "#0f7f78",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: "900",
    overflow: "hidden"
  },
  operationStageWAITING: {
    color: "#64748b",
    backgroundColor: "#e2e8f0"
  },
  operationStageREADY: {
    color: "#155e75",
    backgroundColor: "#cffafe"
  },
  operationStageIN_PROGRESS: {
    color: "#1d4ed8",
    backgroundColor: "#dbeafe"
  },
  operationStagePAUSED: {
    color: "#92400e",
    backgroundColor: "#ffedd5"
  },
  operationStageCOMPLETED: {
    color: "#166534",
    backgroundColor: "#dcfce7"
  },
  myOperationText: {
    color: "#0f7f78",
    fontWeight: "900"
  },
  operationActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  operationActionButton: {
    minHeight: 44,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    backgroundColor: "#ffffff",
    borderColor: "#c8d3dd",
    borderRadius: 12,
    borderWidth: 1
  },
  operationActionText: {
    color: "#17202a",
    fontSize: 12,
    fontWeight: "900"
  },
  operationMessage: {
    gap: 3,
    padding: 10,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 12,
    borderWidth: 1
  },
  operationMessageForm: {
    gap: 9,
    marginTop: 2,
    paddingTop: 10,
    borderTopColor: "#dbe3ea",
    borderTopWidth: 1
  }
});



