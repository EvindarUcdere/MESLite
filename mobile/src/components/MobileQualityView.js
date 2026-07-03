import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getApiBaseUrl } from "../api/client";
import { createQualityCheck, getQualityChecks } from "../api/qualityChecks.api";
import { createScrapAction } from "../api/productionLogs.api";
import { getWorkOrders } from "../api/workOrders.api";
import { isOfflineQueuedResult } from "../offline/offlineApi";
import OfflineQueuePanel from "./OfflineQueuePanel";

const QUALITY_KEYWORDS = ["kalite", "quality", "kontrol"];
const DECISIONS = [
  { value: "PASSED", label: "Geçti" },
  { value: "PARTIAL", label: "Kısmi" },
  { value: "FAILED", label: "Kaldı" }
];
const SCRAP_DECISIONS = [
  { value: "REPRODUCE", label: "Yeniden Üret" },
  { value: "REWORK", label: "Yeniden İşle" },
  { value: "SCRAP", label: "Hurda" },
  { value: "CONDITIONAL_ACCEPT", label: "Şartlı Kabul" }
];

function isQualityOperation(operation) {
  const name = operation.operationName?.toLocaleLowerCase("tr-TR") ?? "";
  return operation.routeOperation?.requiresQualityCheck || QUALITY_KEYWORDS.some((keyword) => name.includes(keyword));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
}

export default function MobileQualityView({
  user,
  offlineSummary,
  isOfflineMode,
  isSyncing,
  onSync,
  onQueued,
  onLogout,
  notifications = [],
  unreadNotificationCount = 0,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onClearNotifications,
  pushStatus
}) {
  const [activeTab, setActiveTab] = useState("CONTROLS");
  const [workOrders, setWorkOrders] = useState([]);
  const [qualityChecks, setQualityChecks] = useState([]);
  const [selectedOperationId, setSelectedOperationId] = useState("");
  const [status, setStatus] = useState("PASSED");
  const [defectQuantity, setDefectQuantity] = useState("0");
  const [defectReason, setDefectReason] = useState("");
  const [note, setNote] = useState("");
  const [scrapDisposition, setScrapDisposition] = useState("REPRODUCE");
  const [scrapResolutionQuantity, setScrapResolutionQuantity] = useState("0");
  const [scrapDispositionNote, setScrapDispositionNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadData({ preserveMessage = false } = {}) {
    setError("");
    if (!preserveMessage) {
      setMessage("");
    }

    try {
      const [nextWorkOrders, nextChecks] = await Promise.all([getWorkOrders(), getQualityChecks()]);
      setWorkOrders(nextWorkOrders);
      setQualityChecks(nextChecks);
    } catch (loadError) {
      setError(loadError?.response?.data?.message ?? "Kalite verileri yenilenemedi. Mevcut liste çevrimdışı kullanılabilir.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!isOfflineMode && offlineSummary.pending === 0) {
      loadData({ preserveMessage: true });
    }
  }, [isOfflineMode, offlineSummary.pending, offlineSummary.synced]);

  const pendingItems = useMemo(() => {
    const checkedOperationIds = new Set(qualityChecks.map((check) => check.workOrderOperationId).filter(Boolean));

    return workOrders.flatMap((workOrder) =>
      (workOrder.operations ?? [])
        .filter(
          (operation) =>
            operation.status === "COMPLETED" &&
            operation.producedQuantity > 0 &&
            isQualityOperation(operation) &&
            !checkedOperationIds.has(operation.id)
        )
        .map((operation) => ({ workOrder, operation }))
    );
  }, [qualityChecks, workOrders]);

  const selectedItem = pendingItems.find((item) => item.operation.id === selectedOperationId) ?? null;
  const selectedScrapLog = selectedItem?.workOrder.productionLogs?.find(
    (log) =>
      log.workOrderOperationId === selectedItem.operation.id &&
      Number(log.scrapQuantity ?? 0) > 0 &&
      !log.scrapActionWorkOrderId &&
      log.scrapActionStatus !== "NOT_REQUIRED"
  ) ?? null;

  function selectItem(item) {
    setSelectedOperationId(item.operation.id);
    setStatus("PASSED");
    setDefectQuantity("0");
    setDefectReason("");
    setNote("");
    const openScrapLog = item.workOrder.productionLogs?.find(
      (log) =>
        log.workOrderOperationId === item.operation.id &&
        Number(log.scrapQuantity ?? 0) > 0 &&
        !log.scrapActionWorkOrderId &&
        log.scrapActionStatus !== "NOT_REQUIRED"
    );
    setScrapDisposition(openScrapLog?.scrapDisposition === "PENDING_REVIEW" ? "REPRODUCE" : openScrapLog?.scrapDisposition ?? "REPRODUCE");
    setScrapResolutionQuantity(String(openScrapLog?.scrapQuantity ?? 0));
    setScrapDispositionNote("");
    setError("");
    setMessage("");
  }

  async function submitQualityCheck() {
    if (!selectedItem) {
      setError("Kalite sonucu girilecek operasyonu seçin.");
      return;
    }

    const defect = Number(defectQuantity);
    if (!Number.isInteger(defect) || defect < 0 || defect > selectedItem.operation.producedQuantity) {
      setError(`Hatalı adet 0 ile ${selectedItem.operation.producedQuantity} arasında olmalıdır.`);
      return;
    }

    if (["FAILED", "PARTIAL"].includes(status) && !defectReason.trim()) {
      setError("Kaldı veya kısmi sonuç için hata nedeni zorunludur.");
      return;
    }

    const scrapResolution = Number(scrapResolutionQuantity);
    if (
      selectedScrapLog &&
      scrapDisposition !== "CONDITIONAL_ACCEPT" &&
      (!Number.isInteger(scrapResolution) || scrapResolution < 1 || scrapResolution > selectedScrapLog.scrapQuantity)
    ) {
      setError(`Fire aksiyon adedi 1 ile ${selectedScrapLog.scrapQuantity} arasında olmalıdır.`);
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      const result = await createQualityCheck({
        workOrderId: selectedItem.workOrder.id,
        workOrderOperationId: selectedItem.operation.id,
        status,
        defectQuantity: status === "PASSED" ? 0 : defect,
        ...(defectReason.trim() ? { defectReason: defectReason.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {})
      });
      const queued = isOfflineQueuedResult(result);
      let scrapQueued = false;

      if (selectedScrapLog) {
        const scrapResult = await createScrapAction(selectedScrapLog.id, {
          scrapDisposition,
          ...(scrapDisposition !== "CONDITIONAL_ACCEPT" ? { scrapResolutionQuantity: scrapResolution } : {}),
          scrapDispositionNote: scrapDispositionNote.trim() || "Mobil kalite kontrolünden fire kararı verildi."
        });
        scrapQueued = isOfflineQueuedResult(scrapResult);
      }

      if (queued || scrapQueued) {
        setQualityChecks((current) => [
          ...current,
          { id: `local-${result.operationId}`, workOrderOperationId: selectedItem.operation.id, status, offlinePending: true }
        ]);
        await onQueued();
        setMessage(selectedScrapLog ? "Kalite ve fire kararı kaydedildi, senkronizasyon bekliyor." : "Kalite kararı kaydedildi, senkronizasyon bekliyor.");
      } else {
        setQualityChecks((current) => [result, ...current.filter((check) => check.id !== result.id)]);
        setMessage("Kalite sonucu kaydedildi.");
      }

      setSelectedOperationId("");
    } catch (submitError) {
      setError(submitError?.response?.data?.message ?? "Kalite sonucu kaydedilemedi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const statusTitle = isSyncing
    ? "Senkronizasyon yapılıyor"
    : isOfflineMode
      ? "Çevrimdışı"
      : offlineSummary.failed > 0
        ? "Senkronize edilemeyen kayıt var"
        : offlineSummary.pending > 0
          ? "Senkronizasyon bekliyor"
          : "Senkronizasyon tamamlandı";

  const tabs = [
    { value: "CONTROLS", label: "Kontroller", icon: "shield-checkmark-outline", activeIcon: "shield-checkmark", badge: pendingItems.length },
    { value: "HISTORY", label: "Geçmiş", icon: "time-outline", activeIcon: "time" },
    { value: "SYNC", label: "Senkron", icon: "sync-outline", activeIcon: "sync", badge: offlineSummary.pending + offlineSummary.failed },
    { value: "NOTIFICATIONS", label: "Bildirim", icon: "notifications-outline", activeIcon: "notifications", badge: unreadNotificationCount },
    { value: "PROFILE", label: "Profil", icon: "person-outline", activeIcon: "person" }
  ];

  return (
    <View style={styles.appShell}>
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>MES Lite Kalite</Text>
          <Text style={styles.title}>Kalite Kontrol</Text>
          <Text style={styles.muted}>{user.name}</Text>
        </View>
        <Pressable style={styles.secondaryButton} onPress={onLogout}>
          <Text style={styles.secondaryButtonText}>Çıkış</Text>
        </Pressable>
      </View>

      <View style={[styles.syncBar, isOfflineMode || offlineSummary.failed > 0 ? styles.syncWarning : null]}>
        <View>
          <Text style={styles.syncTitle}>{statusTitle}</Text>
          <Text style={styles.syncText}>{offlineSummary.pending} bekleyen, {offlineSummary.failed} başarısız kayıt</Text>
        </View>
        <Pressable style={styles.syncButton} onPress={onSync} disabled={isSyncing}>
          <Text style={styles.syncButtonText}>{isSyncing ? "Kontrol" : "Senkronize Et"}</Text>
        </Pressable>
      </View>

      {activeTab === "SYNC" ? <OfflineQueuePanel summary={offlineSummary} onSync={onSync} onChanged={onQueued} /> : null}

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {activeTab === "CONTROLS" ? <>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{selectedItem ? "Kalite Kararı" : "Kontrol Bekleyenler"}</Text>
        {selectedItem ? (
          <Pressable style={styles.backButton} onPress={() => setSelectedOperationId("")}>
            <Ionicons name="arrow-back" size={17} color="#9a5b0e" />
            <Text style={styles.backButtonText}>Listeye Dön</Text>
          </Pressable>
        ) : <Text style={styles.count}>{pendingItems.length}</Text>}
      </View>

      {!selectedItem ? <>
        {isLoading ? <ActivityIndicator color="#167d75" /> : null}
        {!isLoading && pendingItems.length === 0 ? <Text style={styles.empty}>Kalite sonucu bekleyen operasyon yok.</Text> : null}

        {pendingItems.map((item) => (
          <Pressable key={item.operation.id} style={styles.item} onPress={() => selectItem(item)}>
            <View style={styles.itemTop}>
              <Text style={styles.itemTitle}>{item.workOrder.orderNo}</Text>
              <Text style={styles.itemDate}>{formatDate(item.operation.completedAt)}</Text>
            </View>
            <Text style={styles.itemOperation}>{item.operation.sequenceNo}. {item.operation.operationName}</Text>
            <Text style={styles.muted}>Operatör: {item.operation.assignedOperator?.name ?? "-"}</Text>
            <Text style={styles.metrics}>Üretim {item.operation.producedQuantity}  |  Fire {item.operation.scrapQuantity}</Text>
          </Pressable>
        ))}
      </> : null}

      {selectedItem ? (
        <View style={styles.form}>
          <Text style={styles.formContext}>{selectedItem.workOrder.orderNo} / {selectedItem.operation.operationName}</Text>

          <View style={styles.segmented}>
            {DECISIONS.map((decision) => (
              <Pressable
                key={decision.value}
                style={[styles.segment, status === decision.value ? styles.segmentActive : null]}
                onPress={() => {
                  setStatus(decision.value);
                  if (decision.value === "PASSED") {
                    setDefectQuantity("0");
                    setDefectReason("");
                  }
                }}
              >
                <Text style={[styles.segmentText, status === decision.value ? styles.segmentTextActive : null]}>{decision.label}</Text>
              </Pressable>
            ))}
          </View>

          {status !== "PASSED" ? (
            <>
              <Text style={styles.label}>Hatalı Adet</Text>
              <TextInput style={styles.input} value={defectQuantity} onChangeText={setDefectQuantity} keyboardType="number-pad" />
              <Text style={styles.label}>Hata Nedeni</Text>
              <TextInput style={styles.input} value={defectReason} onChangeText={setDefectReason} placeholder="Ölçü hatası, çizik..." />
            </>
          ) : null}

          <Text style={styles.label}>Kontrol Notu</Text>
          <TextInput style={[styles.input, styles.noteInput]} value={note} onChangeText={setNote} multiline placeholder="Kalite kontrol açıklaması" />

          {selectedScrapLog ? (
            <View style={styles.scrapSection}>
              <Text style={styles.sectionTitle}>Fire Kararı</Text>
              <Text style={styles.scrapSummary}>{selectedScrapLog.scrapQuantity} adet fire için nihai aksiyon seçin.</Text>
              <View style={styles.scrapChoices}>
                {SCRAP_DECISIONS.map((decision) => (
                  <Pressable
                    key={decision.value}
                    style={[styles.scrapChoice, scrapDisposition === decision.value ? styles.scrapChoiceActive : null]}
                    onPress={() => setScrapDisposition(decision.value)}
                  >
                    <Text style={scrapDisposition === decision.value ? styles.segmentTextActive : styles.segmentText}>{decision.label}</Text>
                  </Pressable>
                ))}
              </View>
              {scrapDisposition !== "CONDITIONAL_ACCEPT" ? (
                <>
                  <Text style={styles.label}>Aksiyon Adedi</Text>
                  <TextInput style={styles.input} value={scrapResolutionQuantity} onChangeText={setScrapResolutionQuantity} keyboardType="number-pad" />
                </>
              ) : null}
              <Text style={styles.label}>Fire Karar Notu</Text>
              <TextInput style={styles.input} value={scrapDispositionNote} onChangeText={setScrapDispositionNote} placeholder="Karar açıklaması" />
            </View>
          ) : null}

          <Pressable style={[styles.primaryButton, isSubmitting ? styles.disabled : null]} onPress={submitQualityCheck} disabled={isSubmitting}>
            <Text style={styles.primaryButtonText}>{isSubmitting ? "Kaydediliyor..." : "Kalite Sonucunu Kaydet"}</Text>
          </Pressable>
        </View>
      ) : null}
      </> : null}

      {activeTab === "HISTORY" ? (
        <View style={styles.tabSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Kalite Geçmişi</Text>
            <Text style={styles.count}>{qualityChecks.length}</Text>
          </View>
          {qualityChecks.map((check) => (
            <View key={check.id} style={styles.historyCard}>
              <View style={styles.itemTop}>
                <Text style={styles.itemTitle}>{check.workOrder?.orderNo ?? check.workOrderOperation?.workOrder?.orderNo ?? "Kalite kaydı"}</Text>
                <Text style={[styles.resultBadge, styles[`result${check.status}`]]}>{check.status}</Text>
              </View>
              <Text style={styles.itemOperation}>{check.workOrderOperation?.operationName ?? "Operasyon bilgisi"}</Text>
              <Text style={styles.muted}>Hatalı adet: {check.defectQuantity ?? 0}</Text>
              {check.defectReason ? <Text style={styles.muted}>Neden: {check.defectReason}</Text> : null}
              {check.note ? <Text style={styles.muted}>{check.note}</Text> : null}
              <Text style={styles.itemDate}>{formatDate(check.createdAt)}</Text>
            </View>
          ))}
          {!qualityChecks.length ? <Text style={styles.empty}>Henüz kalite geçmişi bulunmuyor.</Text> : null}
        </View>
      ) : null}

      {activeTab === "SYNC" ? (
        <View style={styles.tabSection}>
          <Text style={styles.sectionTitle}>Senkronizasyon Özeti</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{offlineSummary.pending}</Text><Text style={styles.muted}>Bekleyen</Text></View>
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{offlineSummary.failed}</Text><Text style={styles.muted}>Başarısız</Text></View>
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{offlineSummary.synced}</Text><Text style={styles.muted}>Tamamlanan</Text></View>
          </View>
        </View>
      ) : null}

      {activeTab === "NOTIFICATIONS" ? (
        <View style={styles.tabSection}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Bildirimler</Text><Text style={styles.count}>{unreadNotificationCount}</Text></View>
          <View style={styles.notificationActions}>
            <Pressable style={styles.secondaryButton} onPress={onMarkAllNotificationsRead} disabled={!unreadNotificationCount}><Text style={styles.secondaryButtonText}>Tümünü Okundu Yap</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={onClearNotifications} disabled={!notifications.length}><Text style={styles.secondaryButtonText}>Temizle</Text></Pressable>
          </View>
          {notifications.map((notification) => (
            <View key={notification.id} style={[styles.notificationCard, !notification.readAt ? styles.notificationUnread : null]}>
              <Text style={styles.itemTitle}>{notification.title}</Text>
              <Text style={styles.muted}>{notification.message}</Text>
              <View style={styles.itemTop}>
                <Text style={styles.itemDate}>{formatDate(notification.createdAt)}</Text>
                {!notification.readAt ? <Pressable onPress={() => onMarkNotificationRead?.(notification.id)}><Text style={styles.notificationRead}>Okundu</Text></Pressable> : null}
              </View>
            </View>
          ))}
          {!notifications.length ? <Text style={styles.empty}>Henüz bildirim yok.</Text> : null}
        </View>
      ) : null}

      {activeTab === "PROFILE" ? (
        <View style={styles.tabSection}>
          <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{user.name?.charAt(0)?.toUpperCase() ?? "K"}</Text></View>
          <Text style={styles.profileName}>{user.name}</Text>
          <Text style={styles.muted}>{user.email}</Text>
          <View style={styles.profileRow}><Text style={styles.label}>Rol</Text><Text style={styles.profileValue}>Kalite Personeli</Text></View>
          <View style={styles.profileRow}><Text style={styles.label}>Bağlantı</Text><Text style={styles.profileValue}>{isOfflineMode ? "Çevrimdışı" : "Çevrimiçi"}</Text></View>
          <View style={styles.profileRow}><Text style={styles.label}>API</Text><Text style={styles.profileApi}>{getApiBaseUrl()}</Text></View>
          <View style={styles.profileStatus}><Text style={styles.label}>Telefon bildirimleri</Text><Text style={styles.muted}>{pushStatus}</Text></View>
          <Pressable style={styles.secondaryButton} onPress={onLogout}><Text style={styles.secondaryButtonText}>Çıkış Yap</Text></Pressable>
        </View>
      ) : null}
    </ScrollView>
    <View style={styles.bottomTabBar}>
      {tabs.map((tab) => {
        const active = activeTab === tab.value;
        return (
          <Pressable key={tab.value} style={styles.bottomTabButton} onPress={() => setActiveTab(tab.value)} accessibilityRole="tab" accessibilityState={{ selected: active }}>
            <View style={styles.bottomTabIconWrap}>
              <Ionicons name={active ? tab.activeIcon : tab.icon} size={22} color={active ? "#b66b12" : "#687985"} />
              {tab.badge > 0 ? <Text style={styles.bottomTabBadge}>{tab.badge > 99 ? "99+" : tab.badge}</Text> : null}
            </View>
            <Text style={[styles.bottomTabLabel, active ? styles.bottomTabLabelActive : null]} numberOfLines={1}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appShell: { flex: 1, backgroundColor: "#eef4f5" },
  page: { flex: 1, backgroundColor: "#eef4f5" },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 8 },
  eyebrow: { color: "#167d75", fontSize: 12, fontWeight: "800" },
  title: { color: "#15252d", fontSize: 26, fontWeight: "800" },
  muted: { color: "#64747b", fontSize: 13 },
  secondaryButton: { borderWidth: 1, borderColor: "#b7c8cc", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6 },
  secondaryButtonText: { color: "#274149", fontWeight: "700" },
  syncBar: { backgroundColor: "#dcefea", borderLeftWidth: 4, borderLeftColor: "#167d75", padding: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderRadius: 6 },
  syncWarning: { backgroundColor: "#fff1d6", borderLeftColor: "#b66b12" },
  syncTitle: { color: "#17353b", fontWeight: "800" },
  syncText: { color: "#52656b", fontSize: 12, marginTop: 2 },
  syncButton: { backgroundColor: "#ffffff", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 5 },
  syncButtonText: { color: "#166c65", fontWeight: "800", fontSize: 12 },
  success: { color: "#146c43", backgroundColor: "#ddf4e8", padding: 10, borderRadius: 5 },
  error: { color: "#a52a2a", backgroundColor: "#fde8e6", padding: 10, borderRadius: 5 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  sectionTitle: { color: "#172b33", fontSize: 18, fontWeight: "800" },
  backButton: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 9, borderColor: "#e0b75f", borderRadius: 5, borderWidth: 1, backgroundColor: "#fff8e8" },
  backButtonText: { color: "#9a5b0e", fontSize: 12, fontWeight: "800" },
  count: { minWidth: 30, textAlign: "center", color: "#ffffff", backgroundColor: "#167d75", paddingVertical: 4, borderRadius: 5, fontWeight: "800" },
  empty: { color: "#64747b", paddingVertical: 18, textAlign: "center" },
  item: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d5e0e2", borderRadius: 6, padding: 13, gap: 5 },
  itemSelected: { borderColor: "#167d75", borderWidth: 2 },
  itemTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  itemTitle: { color: "#172b33", fontSize: 16, fontWeight: "800", flex: 1 },
  itemDate: { color: "#708087", fontSize: 12 },
  itemOperation: { color: "#29444c", fontWeight: "700" },
  metrics: { color: "#167d75", fontWeight: "800", marginTop: 2 },
  form: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d5e0e2", borderRadius: 6, padding: 14, gap: 10, marginTop: 4 },
  formContext: { color: "#52656b" },
  segmented: { flexDirection: "row", borderWidth: 1, borderColor: "#b7c8cc", borderRadius: 6, overflow: "hidden" },
  segment: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f8f8" },
  segmentActive: { backgroundColor: "#167d75" },
  segmentText: { color: "#40565d", fontWeight: "800" },
  segmentTextActive: { color: "#ffffff" },
  label: { color: "#344c53", fontSize: 13, fontWeight: "700", marginTop: 2 },
  input: { borderWidth: 1, borderColor: "#bdcbce", borderRadius: 6, minHeight: 44, paddingHorizontal: 11, backgroundColor: "#fbfdfd", color: "#172b33" },
  noteInput: { minHeight: 88, paddingTop: 10, textAlignVertical: "top" },
  scrapSection: { borderTopWidth: 1, borderTopColor: "#d5e0e2", paddingTop: 12, gap: 8 },
  scrapSummary: { color: "#8a4c12", backgroundColor: "#fff1d6", padding: 9, borderRadius: 5 },
  scrapChoices: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  scrapChoice: { minHeight: 40, paddingHorizontal: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#b7c8cc", borderRadius: 5, backgroundColor: "#f5f8f8" },
  scrapChoiceActive: { backgroundColor: "#167d75", borderColor: "#167d75" },
  primaryButton: { backgroundColor: "#167d75", minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 6, marginTop: 4 },
  primaryButtonText: { color: "#ffffff", fontWeight: "800" },
  disabled: { opacity: 0.55 },
  tabSection: { gap: 12 },
  historyCard: { gap: 5, padding: 13, backgroundColor: "#ffffff", borderColor: "#d5e0e2", borderRadius: 6, borderWidth: 1 },
  resultBadge: { paddingHorizontal: 8, paddingVertical: 4, overflow: "hidden", borderRadius: 5, fontSize: 11, fontWeight: "800" },
  resultPASSED: { color: "#146c43", backgroundColor: "#ddf4e8" },
  resultPARTIAL: { color: "#8a4c12", backgroundColor: "#fff1d6" },
  resultFAILED: { color: "#a52a2a", backgroundColor: "#fde8e6" },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryItem: { flex: 1, alignItems: "center", gap: 2, padding: 12, backgroundColor: "#ffffff", borderColor: "#d5e0e2", borderRadius: 6, borderWidth: 1 },
  summaryValue: { color: "#172b33", fontSize: 22, fontWeight: "900" },
  notificationActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  notificationCard: { gap: 7, padding: 13, backgroundColor: "#ffffff", borderColor: "#d5e0e2", borderLeftColor: "#b7c8cc", borderLeftWidth: 4, borderRadius: 6, borderWidth: 1 },
  notificationUnread: { backgroundColor: "#fff8e8", borderColor: "#d7952b", borderLeftColor: "#d7952b" },
  notificationRead: { color: "#9a5b0e", fontSize: 12, fontWeight: "800" },
  profileAvatar: { width: 64, height: 64, alignItems: "center", justifyContent: "center", backgroundColor: "#ffedc2", borderRadius: 32 },
  profileAvatarText: { color: "#9a5b0e", fontSize: 26, fontWeight: "900" },
  profileName: { color: "#172b33", fontSize: 22, fontWeight: "900" },
  profileRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 14, paddingVertical: 11, borderBottomColor: "#d5e0e2", borderBottomWidth: 1 },
  profileValue: { color: "#172b33", fontWeight: "800", textAlign: "right" },
  profileApi: { flex: 1, color: "#172b33", fontSize: 12, fontWeight: "700", textAlign: "right" },
  profileStatus: { gap: 5, padding: 12, backgroundColor: "#fff8e8", borderRadius: 6 },
  bottomTabBar: { flexDirection: "row", minHeight: 66, paddingTop: 7, paddingBottom: 8, backgroundColor: "#ffffff", borderTopColor: "#d5e0e2", borderTopWidth: 1, shadowColor: "#172b33", shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 10 },
  bottomTabButton: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 2 },
  bottomTabIconWrap: { position: "relative" },
  bottomTabBadge: { position: "absolute", top: -7, right: -12, minWidth: 17, height: 17, paddingHorizontal: 4, overflow: "hidden", color: "#ffffff", backgroundColor: "#d93232", borderRadius: 9, fontSize: 9, fontWeight: "900", lineHeight: 17, textAlign: "center" },
  bottomTabLabel: { maxWidth: "100%", color: "#687985", fontSize: 10, fontWeight: "700" },
  bottomTabLabelActive: { color: "#9a5b0e", fontWeight: "900" }
});
