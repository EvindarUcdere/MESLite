import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  deleteAllFailedOfflineOperations,
  deleteFailedOfflineOperation,
  getOfflineOperations,
  OFFLINE_OPERATION_STATUS,
  retryOfflineOperation
} from "../offline/offlineQueue";

const TYPE_LABELS = {
  PRODUCTION_LOG: "Üretim / fire kaydı",
  OPERATION_START: "Operasyonu başlat / devam et",
  OPERATION_PAUSE: "Operasyonu duraklat",
  OPERATION_COMPLETE: "Operasyonu tamamla",
  OPERATION_MESSAGE: "Saha notu",
  QUALITY_CHECK: "Kalite sonucu",
  QUALITY_ACTION_DECISION: "Kalite aksiyon kararı",
  SCRAP_ACTION: "Fire kararı"
};

const STATUS_LABELS = {
  PENDING: "Bekliyor",
  FAILED: "Başarısız",
  SYNCED: "Senkronize"
};

const FILTERS = [
  { value: "ACTIVE", label: "Aktif" },
  { value: OFFLINE_OPERATION_STATUS.FAILED, label: "Başarısız" },
  { value: OFFLINE_OPERATION_STATUS.SYNCED, label: "Geçmiş" }
];

function formatDate(value) {
  return value ? new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-";
}

function getPayloadSummary(operation) {
  const payload = operation.payload ?? {};

  if (operation.type === "PRODUCTION_LOG") {
    return `Üretim ${payload.producedQuantity ?? 0}, fire ${payload.scrapQuantity ?? 0}`;
  }

  if (operation.type === "QUALITY_CHECK") {
    return `${STATUS_LABELS[payload.status] ?? payload.status}, hatalı ${payload.defectQuantity ?? 0}`;
  }

  if (operation.type === "SCRAP_ACTION") {
    return `${payload.scrapDisposition ?? "Karar"}, ${payload.scrapResolutionQuantity ?? 0} adet`;
  }

  if (operation.type === "OPERATION_PAUSE") {
    return payload.reason ?? "Duruş nedeni";
  }

  if (operation.type === "OPERATION_MESSAGE") {
    return payload.message ?? "Saha notu";
  }

  return operation.operationId;
}

function getFriendlyError(message) {
  const translations = {
    "Only started operations can be completed": "Yalnızca başlatılmış operasyonlar tamamlanabilir.",
    "Only ready, paused or short-completed operations can be started": "Bu operasyon mevcut durumunda başlatılamaz.",
    "Network Error": "Backend bağlantısı kurulamadı."
  };

  return translations[message] ?? message ?? "Senkronizasyon sırasında işlem reddedildi.";
}

function isPermanentFailure(operation) {
  return /bulunamadı|bulunamadi|yetkili değil|yetkili degil|kapalı|kapali|aşamaz|asamaz|eşleşmelidir|eslesmelidir/i.test(operation.errorMessage ?? "");
}

export default function OfflineQueuePanel({ summary, onSync, onChanged }) {
  const [isExpanded, setIsExpanded] = useState(summary.failed > 0);
  const [filter, setFilter] = useState("ACTIVE");
  const [operations, setOperations] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  async function loadOperations() {
    setIsLoading(true);
    try {
      const rows = await getOfflineOperations({ limit: 40 });
      setOperations(rows);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isExpanded) {
      loadOperations();
    }
  }, [isExpanded, summary.pending, summary.failed, summary.synced]);

  const visibleOperations = operations.filter((operation) => {
    if (filter === "ACTIVE") {
      return operation.status === OFFLINE_OPERATION_STATUS.PENDING || operation.status === OFFLINE_OPERATION_STATUS.FAILED;
    }

    return operation.status === filter;
  });

  async function handleRetry(operation) {
    await retryOfflineOperation(operation.id);
    await onChanged();
    await loadOperations();
    await onSync();
  }

  async function removeOperation(operation) {
    await deleteFailedOfflineOperation(operation.id);
    await onChanged();
    await loadOperations();
  }

  function handleDelete(operation) {
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Bu başarısız kayıt kalıcı olarak silinsin mi?")) {
        removeOperation(operation);
      }
      return;
    }

    Alert.alert("Kaydı sil", "Bu başarısız kayıt kalıcı olarak silinsin mi?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Sil", style: "destructive", onPress: () => removeOperation(operation) }
    ]);
  }

  async function removeAllFailed() {
    await deleteAllFailedOfflineOperations();
    await onChanged();
    await loadOperations();
  }

  function handleDeleteAllFailed() {
    if (Platform.OS === "web") {
      if (globalThis.confirm?.("Bu kullanıcıya ait tüm başarısız kayıtlar silinsin mi?")) {
        removeAllFailed();
      }
      return;
    }

    Alert.alert("Başarısız kayıtları temizle", "Bu kullanıcıya ait tüm başarısız kayıtlar kalıcı olarak silinsin mi?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Tümünü Sil", style: "destructive", onPress: removeAllFailed }
    ]);
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.header}
        onPress={() => setIsExpanded((current) => !current)}
        accessibilityRole="button"
        accessibilityLabel="Offline işlem kayıtlarını göster"
      >
        <View>
          <Text style={styles.title}>Offline İşlemler</Text>
          <Text style={styles.subtitle}>{summary.pending} bekleyen, {summary.failed} başarısız, {summary.synced} tamamlanan</Text>
        </View>
        <Text style={styles.toggle}>{isExpanded ? "Gizle" : "Aç"}</Text>
      </Pressable>

      {isExpanded ? (
        <>
          <View style={styles.filters}>
            {FILTERS.map((item) => (
              <Pressable key={item.value} style={[styles.filter, filter === item.value ? styles.filterActive : null]} onPress={() => setFilter(item.value)}>
                <Text style={[styles.filterText, filter === item.value ? styles.filterTextActive : null]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>

          {summary.failed > 0 ? (
            <View style={styles.failedToolbar}>
              <Text style={styles.failedToolbarText}>Artık uygulanamayan kayıtları kuyruktan kaldırabilirsiniz.</Text>
              <Pressable style={styles.clearFailedButton} onPress={handleDeleteAllFailed}>
                <Text style={styles.clearFailedText}>Başarısızları Temizle</Text>
              </Pressable>
            </View>
          ) : null}

          {isLoading ? <Text style={styles.empty}>Kayıtlar yükleniyor...</Text> : null}
          {!isLoading && visibleOperations.length === 0 ? <Text style={styles.empty}>Bu durumda kayıt yok.</Text> : null}

          {visibleOperations.map((operation) => (
            <View key={operation.id} style={styles.operation}>
              <View style={styles.operationHeader}>
                <Text style={styles.operationType}>{TYPE_LABELS[operation.type] ?? operation.type}</Text>
                <Text style={[styles.status, styles[`status${operation.status}`]]}>{STATUS_LABELS[operation.status] ?? operation.status}</Text>
              </View>
              <Text style={styles.payload}>{getPayloadSummary(operation)}</Text>
              <Text style={styles.meta}>{formatDate(operation.createdAt)} | Deneme {operation.retryCount}</Text>
              {operation.errorMessage ? <Text style={styles.error}>{getFriendlyError(operation.errorMessage)}</Text> : null}
              {operation.status === OFFLINE_OPERATION_STATUS.FAILED ? (
                <View style={styles.actions}>
                  {!isPermanentFailure(operation) ? (
                    <Pressable style={styles.retryButton} onPress={() => handleRetry(operation)}>
                      <Text style={styles.retryText}>Tekrar Dene</Text>
                    </Pressable>
                  ) : <Text style={styles.permanentFailureText}>Kaynak kayıt artık mevcut değil.</Text>}
                  <Pressable style={styles.deleteButton} onPress={() => handleDelete(operation)}>
                    <Text style={styles.deleteText}>Sil</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#d4e0e2", borderRadius: 6, overflow: "hidden" },
  header: { minHeight: 62, paddingHorizontal: 12, paddingVertical: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#173139", fontWeight: "800", fontSize: 15 },
  subtitle: { color: "#687980", fontSize: 12, marginTop: 2 },
  toggle: { color: "#167d75", fontWeight: "800" },
  filters: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#e0e8e9", borderBottomWidth: 1, borderBottomColor: "#e0e8e9" },
  filter: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", backgroundColor: "#f5f8f8" },
  filterActive: { backgroundColor: "#167d75" },
  filterText: { color: "#52666c", fontWeight: "700", fontSize: 12 },
  filterTextActive: { color: "#ffffff" },
  failedToolbar: { padding: 10, gap: 8, backgroundColor: "#fff9ed", borderBottomWidth: 1, borderBottomColor: "#f0dfb7" },
  failedToolbarText: { color: "#795b24", fontSize: 12 },
  clearFailedButton: { minHeight: 36, alignSelf: "flex-start", justifyContent: "center", paddingHorizontal: 12, borderRadius: 5, backgroundColor: "#8a5a13" },
  clearFailedText: { color: "#ffffff", fontWeight: "800", fontSize: 12 },
  empty: { color: "#6a7b81", textAlign: "center", padding: 16 },
  operation: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#e5ebec", gap: 4 },
  operationHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  operationType: { color: "#1d363e", fontWeight: "800", flex: 1 },
  status: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, overflow: "hidden", fontSize: 11, fontWeight: "800" },
  statusPENDING: { color: "#865311", backgroundColor: "#fff0cf" },
  statusFAILED: { color: "#9f2f2a", backgroundColor: "#fde5e2" },
  statusSYNCED: { color: "#176a49", backgroundColor: "#ddf2e7" },
  payload: { color: "#43585f", fontSize: 13 },
  meta: { color: "#79888d", fontSize: 11 },
  error: { color: "#a12d28", backgroundColor: "#fff0ee", padding: 8, borderRadius: 4, marginTop: 3 },
  actions: { flexDirection: "row", gap: 8, marginTop: 5 },
  retryButton: { backgroundColor: "#167d75", minHeight: 38, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  retryText: { color: "#ffffff", fontWeight: "800" },
  permanentFailureText: { color: "#87534e", fontSize: 12, flex: 1, alignSelf: "center" },
  deleteButton: { borderWidth: 1, borderColor: "#c75a52", minHeight: 38, paddingHorizontal: 13, alignItems: "center", justifyContent: "center", borderRadius: 5 },
  deleteText: { color: "#a12d28", fontWeight: "800" }
});
