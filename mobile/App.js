import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getStoredSession, login, logout } from "./src/api/auth.api";
import { createProductionLog } from "./src/api/productionLogs.api";
import { completeWorkOrder, getWorkOrders, pauseWorkOrder, startWorkOrder } from "./src/api/workOrders.api";

const STATUS_LABELS = {
  PLANNED: "Planlandı",
  IN_PROGRESS: "Üretimde",
  PAUSED: "Duraklatıldı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal"
};

const QUICK_QUANTITIES = [1, 5, 10, 25];
const fullScreenHeight = Platform.OS === "web" ? "100vh" : "100%";

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message ?? fallback;
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

function getProgressPercent(workOrder) {
  if (!workOrder.plannedQuantity) {
    return 0;
  }

  return Math.min(Math.round((workOrder.producedQuantity / workOrder.plannedQuantity) * 100), 100);
}

function getMachineName(workOrder) {
  return workOrder.machine?.name ?? "Makine atanmamış";
}

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("operator@meslite.local");
  const [password, setPassword] = useState("Admin123!");
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [producedQuantity, setProducedQuantity] = useState("10");
  const [scrapQuantity, setScrapQuantity] = useState("0");
  const [note, setNote] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const assignedWorkOrders = useMemo(
    () => workOrders.filter((workOrder) => !user?.id || workOrder.assignedOperatorId === user.id),
    [user, workOrders]
  );
  const selectedWorkOrder = assignedWorkOrders.find((workOrder) => workOrder.id === selectedWorkOrderId);
  const productionCandidates = assignedWorkOrders.filter((workOrder) => workOrder.status === "IN_PROGRESS" && workOrder.machineId);
  const selectedProductionWorkOrder = productionCandidates.find((workOrder) => workOrder.id === selectedWorkOrderId);
  const selectedProgressPercent = selectedWorkOrder ? getProgressPercent(selectedWorkOrder) : 0;
  const selectedProductionRemaining = selectedProductionWorkOrder ? getRemainingQuantity(selectedProductionWorkOrder) : 0;
  const runningWorkOrderCount = assignedWorkOrders.filter((workOrder) => workOrder.status === "IN_PROGRESS").length;
  const totalRemainingQuantity = assignedWorkOrders.reduce((total, workOrder) => total + getRemainingQuantity(workOrder), 0);

  async function loadWorkOrders() {
    setError("");
    setSuccessMessage("");

    try {
      const data = await getWorkOrders();
      setWorkOrders(data);
    } catch (loadError) {
      setError(getConnectionMessage(loadError));
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

  async function handleLogin() {
    setError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const session = await login({ email, password });
      setUser(session.user);
      await loadWorkOrders();
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
    setSelectedWorkOrderId("");
  }

  async function runAction(action, fallbackMessage) {
    setError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      await action();
      await loadWorkOrders();
    } catch (actionError) {
      setError(getErrorMessage(actionError, fallbackMessage));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleProductionEntry() {
    const produced = Number(producedQuantity);
    const scrap = Number(scrapQuantity);

    setError("");
    setSuccessMessage("");

    if (!selectedProductionWorkOrder?.machineId) {
      setError("Üretim girişi için makinesi atanmış ve üretimde olan iş emri seçin.");
      return;
    }

    if (!Number.isFinite(produced) || !Number.isFinite(scrap) || produced < 0 || scrap < 0) {
      setError("Üretim ve fire adedi sıfır veya pozitif sayı olmalı.");
      return;
    }

    if (produced === 0 && scrap === 0) {
      setError("Üretim veya fire adedinden en az biri sıfırdan büyük olmalı.");
      return;
    }

    if (produced > selectedProductionRemaining) {
      setError(`Üretilen adet kalan miktarı aşamaz. Kalan: ${selectedProductionRemaining} adet.`);
      return;
    }

    setIsSubmitting(true);

    try {
      await createProductionLog({
        workOrderId: selectedProductionWorkOrder.id,
        machineId: selectedProductionWorkOrder.machineId,
        producedQuantity: produced,
        scrapQuantity: scrap,
        ...(note ? { note } : {})
      });
      await loadWorkOrders();
      setSuccessMessage(`${produced} üretim ve ${scrap} fire kaydı alındı.`);
      setProducedQuantity("10");
      setScrapQuantity("0");
      setNote("");
    } catch (productionError) {
      setError(getErrorMessage(productionError, "Üretim girişi kaydedilemedi."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function fillQuickQuantity(quantity) {
    if (!selectedProductionWorkOrder) {
      return;
    }

    setProducedQuantity(String(Math.min(quantity, selectedProductionRemaining)));
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
          <Text style={styles.summaryValue}>{assignedWorkOrders.length}</Text>
          <Text style={styles.detailLabel}>Atanan</Text>
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
        <Text style={styles.sectionTitle}>Atanmış İş Emirleri</Text>
        {assignedWorkOrders.map((workOrder) => (
          <Pressable
            key={workOrder.id}
            style={[styles.orderCard, selectedWorkOrderId === workOrder.id ? styles.selectedOrderRow : null]}
            onPress={() => setSelectedWorkOrderId(workOrder.id)}
          >
            <View style={styles.orderCardHeader}>
              <View>
                <Text style={styles.orderNo}>{workOrder.orderNo}</Text>
                <Text style={styles.muted}>
                  {workOrder.product.code} - {workOrder.product.name}
                </Text>
              </View>
              <Text style={styles.statusBadge}>{STATUS_LABELS[workOrder.status] ?? workOrder.status}</Text>
            </View>
            <View style={styles.orderCardFooter}>
              <Text style={styles.detailValue}>{getRemainingQuantity(workOrder)} adet kaldı</Text>
              <Text style={styles.muted}>{getMachineName(workOrder)}</Text>
            </View>
          </Pressable>
        ))}
        {!assignedWorkOrders.length ? <Text style={styles.muted}>Size atanmış iş emri yok.</Text> : null}
      </View>

      {selectedWorkOrder ? (
        <View style={styles.card}>
          <View style={styles.detailHeader}>
            <View>
              <Text style={styles.sectionTitle}>İş Emri Detayı</Text>
              <Text style={styles.muted}>{selectedWorkOrder.orderNo}</Text>
            </View>
            <Text style={styles.statusBadge}>{STATUS_LABELS[selectedWorkOrder.status] ?? selectedWorkOrder.status}</Text>
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

          <Text style={styles.sectionTitle}>İş Emri Aksiyonları</Text>
          <View style={styles.actionRow}>
            <Pressable
              style={[styles.primaryButton, !["PLANNED", "PAUSED"].includes(selectedWorkOrder.status) ? styles.disabledButton : null]}
              onPress={() => runAction(() => startWorkOrder(selectedWorkOrder.id), "İş emri başlatılamadı.")}
              disabled={!["PLANNED", "PAUSED"].includes(selectedWorkOrder.status) || isSubmitting}
            >
              <Text style={styles.primaryButtonText}>Başlat</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, selectedWorkOrder.status !== "IN_PROGRESS" ? styles.disabledButton : null]}
              onPress={() => runAction(() => pauseWorkOrder(selectedWorkOrder.id), "İş emri duraklatılamadı.")}
              disabled={selectedWorkOrder.status !== "IN_PROGRESS" || isSubmitting}
            >
              <Text style={styles.secondaryButtonText}>Duraklat</Text>
            </Pressable>
            <Pressable
              style={[
                styles.secondaryButton,
                !["IN_PROGRESS", "PAUSED"].includes(selectedWorkOrder.status) || selectedWorkOrder.producedQuantity <= 0
                  ? styles.disabledButton
                  : null
              ]}
              onPress={() => runAction(() => completeWorkOrder(selectedWorkOrder.id), "İş emri tamamlanamadı.")}
              disabled={
                !["IN_PROGRESS", "PAUSED"].includes(selectedWorkOrder.status) ||
                selectedWorkOrder.producedQuantity <= 0 ||
                isSubmitting
              }
            >
              <Text style={styles.secondaryButtonText}>Tamamla</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Üretim Girişi</Text>
        <Text style={styles.label}>İş Emri</Text>
        <View style={styles.choiceList}>
          {productionCandidates.map((workOrder) => (
            <Pressable
              key={workOrder.id}
              style={[styles.choiceButton, selectedWorkOrderId === workOrder.id ? styles.choiceButtonActive : null]}
              onPress={() => setSelectedWorkOrderId(workOrder.id)}
            >
              <Text style={styles.choiceText}>{workOrder.orderNo}</Text>
            </Pressable>
          ))}
        </View>
        {!productionCandidates.length ? <Text style={styles.muted}>Üretim girişi için üretimde olan iş emri yok.</Text> : null}
        {selectedProductionWorkOrder ? (
          <View style={styles.productionNotice}>
            <Text style={styles.detailLabel}>Seçili iş emri</Text>
            <Text style={styles.detailValue}>
              {selectedProductionWorkOrder.orderNo} - {selectedProductionWorkOrder.product.code}
            </Text>
            <Text style={styles.muted}>
              {selectedProductionRemaining} adet kaldı, makine: {getMachineName(selectedProductionWorkOrder)}
            </Text>
          </View>
        ) : null}
        <Text style={styles.label}>Üretilen Adet</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={producedQuantity} onChangeText={setProducedQuantity} />
        <View style={styles.quickRow}>
          {QUICK_QUANTITIES.map((quantity) => (
            <Pressable
              key={quantity}
              style={[styles.quickButton, !selectedProductionWorkOrder ? styles.disabledButton : null]}
              onPress={() => fillQuickQuantity(quantity)}
              disabled={!selectedProductionWorkOrder}
            >
              <Text style={styles.quickButtonText}>{quantity}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Fire Adedi</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={scrapQuantity} onChangeText={setScrapQuantity} />
        <Text style={styles.label}>Not</Text>
        <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="İsteğe bağlı not" />
        <Pressable
          style={[styles.primaryButton, !selectedProductionWorkOrder ? styles.disabledButton : null]}
          onPress={handleProductionEntry}
          disabled={!selectedProductionWorkOrder || isSubmitting}
        >
          <Text style={styles.primaryButtonText}>{isSubmitting ? "Kaydediliyor..." : "Kaydet"}</Text>
        </Pressable>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#f4f7f9"
  },
  pageContent: {
    gap: 16,
    minHeight: fullScreenHeight,
    padding: 20,
    paddingTop: 48
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
    gap: 16,
    padding: 18,
    backgroundColor: "#17202a",
    borderRadius: 8
  },
  eyebrow: {
    marginBottom: 4,
    color: "#9ee2d0",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase"
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
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
    gap: 10
  },
  summaryItem: {
    flex: 1,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1
  },
  summaryValue: {
    color: "#17202a",
    fontSize: 22,
    fontWeight: "900"
  },
  card: {
    gap: 12,
    padding: 16,
    backgroundColor: "#ffffff",
    borderColor: "#dbe3ea",
    borderRadius: 8,
    borderWidth: 1
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#17202a"
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: "#256f6c",
    backgroundColor: "#d9f2e8",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800"
  },
  detailRow: {
    flexDirection: "row",
    gap: 10
  },
  detailBox: {
    flex: 1,
    gap: 4,
    minHeight: 66,
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#f7fafc",
    borderColor: "#edf1f5",
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
    fontWeight: "800"
  },
  kpiRow: {
    flexDirection: "row",
    gap: 10
  },
  kpiBox: {
    flex: 1,
    gap: 2,
    minHeight: 64,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#f7fafc",
    borderColor: "#edf1f5",
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
    minHeight: 42,
    paddingHorizontal: 12,
    color: "#17202a",
    backgroundColor: "#ffffff",
    borderColor: "#c8d3dd",
    borderRadius: 6,
    borderWidth: 1
  },
  primaryButton: {
    minHeight: 42,
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
    minHeight: 42,
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
    minHeight: 36,
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
    gap: 4,
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
    minWidth: 48,
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
  orderCard: {
    gap: 12,
    padding: 12,
    backgroundColor: "#ffffff",
    borderColor: "#edf1f5",
    borderRadius: 8,
    borderWidth: 1
  },
  orderCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10
  },
  orderCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingTop: 10,
    borderTopColor: "#edf1f5",
    borderTopWidth: 1
  },
  selectedOrderRow: {
    backgroundColor: "#f0fdfa"
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
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#edf1f5",
    borderRadius: 999
  },
  choiceButtonActive: {
    backgroundColor: "#d9f2e8"
  },
  choiceText: {
    color: "#17202a",
    fontWeight: "700"
  }
});
