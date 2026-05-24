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

const fullScreenHeight = Platform.OS === "web" ? "100vh" : "100%";

function getErrorMessage(error, fallback) {
  return error?.response?.data?.message ?? fallback;
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

  const assignedWorkOrders = useMemo(
    () => workOrders.filter((workOrder) => !user?.id || workOrder.assignedOperatorId === user.id),
    [user, workOrders]
  );
  const selectedWorkOrder = assignedWorkOrders.find((workOrder) => workOrder.id === selectedWorkOrderId);
  const productionCandidates = assignedWorkOrders.filter((workOrder) => workOrder.status === "IN_PROGRESS" && workOrder.machineId);
  const selectedProductionWorkOrder = productionCandidates.find((workOrder) => workOrder.id === selectedWorkOrderId);

  async function loadWorkOrders() {
    const data = await getWorkOrders();
    setWorkOrders(data);
  }

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const session = await getStoredSession();

        if (session.token && session.user && isMounted) {
          setUser(session.user);
          const data = await getWorkOrders();
          setWorkOrders(data);
        }
      } catch (_error) {
        if (isMounted) {
          setError("Oturum bilgisi yüklenemedi.");
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

    await runAction(
      () =>
        createProductionLog({
          workOrderId: selectedProductionWorkOrder.id,
          machineId: selectedProductionWorkOrder.machineId,
          producedQuantity: produced,
          scrapQuantity: scrap,
          ...(note ? { note } : {})
        }),
      "Üretim girişi kaydedilemedi."
    );

    setProducedQuantity("10");
    setScrapQuantity("0");
    setNote("");
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
        <Text style={styles.title}>MES Lite</Text>
        <Text style={styles.subtitle}>Operatör üretim girişi</Text>
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
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>İş Emirlerim</Text>
          <Text style={styles.subtitle}>{user.name}</Text>
        </View>
        <Pressable style={styles.secondaryButton} onPress={handleLogout}>
          <Text style={styles.secondaryButtonText}>Çıkış</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Atanmış İş Emirleri</Text>
        {assignedWorkOrders.map((workOrder) => (
          <Pressable
            key={workOrder.id}
            style={[styles.orderRow, selectedWorkOrderId === workOrder.id ? styles.selectedOrderRow : null]}
            onPress={() => setSelectedWorkOrderId(workOrder.id)}
          >
            <View>
              <Text style={styles.orderNo}>{workOrder.orderNo}</Text>
              <Text style={styles.muted}>{workOrder.product.name}</Text>
              <Text style={styles.muted}>
                {workOrder.producedQuantity}/{workOrder.plannedQuantity} adet
              </Text>
            </View>
            <Text style={styles.statusText}>{STATUS_LABELS[workOrder.status] ?? workOrder.status}</Text>
          </Pressable>
        ))}
        {!assignedWorkOrders.length ? <Text style={styles.muted}>Size atanmış iş emri yok.</Text> : null}
      </View>

      {selectedWorkOrder ? (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>İş Emri Aksiyonları</Text>
          <Text style={styles.muted}>{selectedWorkOrder.orderNo}</Text>
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
        <Text style={styles.label}>Üretilen Adet</Text>
        <TextInput style={styles.input} keyboardType="numeric" value={producedQuantity} onChangeText={setProducedQuantity} />
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#17202a"
  },
  subtitle: {
    marginTop: 4,
    color: "#60707d"
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
  muted: {
    color: "#60707d"
  },
  orderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 12,
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
  statusText: {
    color: "#256f6c",
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
