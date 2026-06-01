import * as ImagePicker from "expo-image-picker";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { getStoredSession, login, logout } from "./src/api/auth.api";
import { createProductionLog, uploadProductionLogImage } from "./src/api/productionLogs.api";
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

function canStartOperation(operation) {
  return ["READY", "PAUSED"].includes(operation.status);
}

function canPauseOperation(operation) {
  return operation.status === "IN_PROGRESS";
}

function hasOperationLog(operation) {
  return Boolean(operation._count?.productionLogs || operation.producedQuantity > 0 || operation.scrapQuantity > 0);
}

function canCompleteOperation(operation) {
  return ["IN_PROGRESS", "PAUSED"].includes(operation.status) && hasOperationLog(operation);
}

export default function App() {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("operator@meslite.local");
  const [password, setPassword] = useState("Admin123!");
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState("");
  const [selectedOperationId, setSelectedOperationId] = useState("");
  const [producedQuantity, setProducedQuantity] = useState("10");
  const [scrapQuantity, setScrapQuantity] = useState("0");
  const [scrapReason, setScrapReason] = useState("");
  const [note, setNote] = useState("");
  const [isCriticalAlert, setIsCriticalAlert] = useState(false);
  const [alertSeverity, setAlertSeverity] = useState("WARNING");
  const [selectedImage, setSelectedImage] = useState(null);
  const [operationMessageDrafts, setOperationMessageDrafts] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const assignedWorkOrders = useMemo(
    () => workOrders.filter((workOrder) => operatorHasOperation(workOrder, user?.id)),
    [user, workOrders]
  );
  const selectedWorkOrder = assignedWorkOrders.find((workOrder) => workOrder.id === selectedWorkOrderId);
  const selectedOperationProgress = selectedWorkOrder ? getOperationProgress(selectedWorkOrder.operations) : null;
  const mySelectedOperations = selectedWorkOrder?.operations?.filter((operation) => operation.assignedOperatorId === user?.id) ?? [];
  const productionCandidates = assignedWorkOrders.flatMap((workOrder) =>
    (workOrder.operations ?? [])
      .filter((operation) => operation.assignedOperatorId === user?.id && ["READY", "IN_PROGRESS", "PAUSED"].includes(operation.status) && operation.machineId)
      .map((operation) => ({ ...operation, workOrder }))
  );
  const selectedProductionOperation = productionCandidates.find((operation) => operation.id === selectedOperationId);
  const selectedProductionWorkOrder = selectedProductionOperation?.workOrder;
  const selectedProgressPercent = selectedWorkOrder ? getProgressPercent(selectedWorkOrder) : 0;
  const selectedProductionRemaining = selectedProductionWorkOrder ? getRemainingQuantity(selectedProductionWorkOrder) : 0;
  const runningWorkOrderCount = assignedWorkOrders.filter((workOrder) => workOrder.status === "IN_PROGRESS").length;
  const totalRemainingQuantity = assignedWorkOrders.reduce((total, workOrder) => total + getRemainingQuantity(workOrder), 0);

  async function clearExpiredSession() {
    await logout();
    setUser(null);
    setWorkOrders([]);
    setSelectedWorkOrderId("");
    setSelectedOperationId("");
    setSuccessMessage("");
    setError("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
  }

  async function loadWorkOrders() {
    setError("");
    setSuccessMessage("");

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

  async function handleOperationAction(action, successText, fallbackMessage) {
    const isSuccess = await runAction(action, fallbackMessage);
    if (isSuccess) {
      setSuccessMessage(successText);
    }
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
      setError("Üretim girişi için size atanmış hazır veya üretimde olan operasyon seçin.");
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

  async function pickImageFromGallery() {
    setError("");

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
  }

  async function takePhoto() {
    setError("");

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
          <Text style={styles.detailLabel}>İş Emri</Text>
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
        <Text style={styles.sectionTitle}>Operasyonum Olan İş Emirleri</Text>
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
              <Text style={styles.detailValue}>{workOrder.operations?.filter((operation) => operation.assignedOperatorId === user.id).length ?? 0} adım bende</Text>
              <Text style={styles.muted}>{getOperationProgress(workOrder.operations).activeOperation?.operationName ?? "Operasyon yok"}</Text>
            </View>
          </Pressable>
        ))}
        {!assignedWorkOrders.length ? <Text style={styles.muted}>Size atanmış operasyonu olan iş emri yok.</Text> : null}
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

          {selectedWorkOrder.operations?.length ? (
            <View style={styles.operationSection}>
              <Text style={styles.sectionTitle}>Operasyon Akışı</Text>
              <View style={styles.operationSummary}>
                <View style={styles.detailBox}>
                  <Text style={styles.detailLabel}>Ürün Şu Anda</Text>
                  <Text style={styles.detailValue}>{selectedOperationProgress?.activeOperation?.operationName ?? "-"}</Text>
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

                return (
                  <View key={operation.id} style={[styles.operationCard, styles[`operation${operation.status}`], isMine ? styles.myOperationCard : null]}>
                    <View style={styles.operationHeader}>
                      <Text style={styles.operationSequence}>{operation.sequenceNo}</Text>
                      <View style={styles.operationHeaderText}>
                        <Text style={styles.operationName}>{operation.operationName}</Text>
                        <Text style={styles.muted}>{operation.machine?.code ?? "Makine yok"}</Text>
                      </View>
                      <Text style={styles.operationStage}>{OPERATION_STAGE_LABELS[operation.status] ?? operation.status}</Text>
                    </View>
                    <Text style={styles.detailValue}>{OPERATION_STATUS_LABELS[operation.status] ?? operation.status}</Text>
                    <Text style={styles.muted}>Operatör: {operation.assignedOperator?.name ?? "-"}</Text>
                    <Text style={styles.muted}>
                      Önceki: {previousOperation?.assignedOperator?.name ?? "-"} / Sonraki: {nextOperation?.assignedOperator?.name ?? "-"}
                    </Text>
                    {isMine ? <Text style={styles.myOperationText}>Bu adım size atanmış.</Text> : null}
                    {isMine ? (
                      <View style={styles.operationActionRow}>
                        <Pressable
                          style={[styles.operationActionButton, !canStartOperation(operation) ? styles.disabledButton : null]}
                          onPress={() =>
                            handleOperationAction(
                              () => startWorkOrderOperation(operation.id),
                              "Operasyon başlatıldı.",
                              "Operasyon başlatılamadı."
                            )
                          }
                          disabled={!canStartOperation(operation) || isSubmitting}
                        >
                          <Text style={styles.operationActionText}>Operasyonu Başlat</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.operationActionButton, !canPauseOperation(operation) ? styles.disabledButton : null]}
                          onPress={() =>
                            handleOperationAction(
                              () => pauseWorkOrderOperation(operation.id),
                              "Operasyon duraklatıldı.",
                              "Operasyon duraklatılamadı."
                            )
                          }
                          disabled={!canPauseOperation(operation) || isSubmitting}
                        >
                          <Text style={styles.operationActionText}>Operasyonu Duraklat</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.operationActionButton, !canCompleteOperation(operation) ? styles.disabledButton : null]}
                          onPress={() =>
                            handleOperationAction(
                              () => completeWorkOrderOperation(operation.id),
                              "Operasyon tamamlandı.",
                              "Operasyon tamamlanamadı."
                            )
                          }
                          disabled={!canCompleteOperation(operation) || isSubmitting}
                        >
                          <Text style={styles.operationActionText}>Operasyonu Tamamla</Text>
                        </Pressable>
                      </View>
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

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Üretim Girişi</Text>
        <Text style={styles.label}>İş Emri</Text>
        <View style={styles.choiceList}>
          {productionCandidates.map((operation) => (
            <Pressable
              key={operation.id}
              style={[styles.operationChoiceButton, selectedOperationId === operation.id ? styles.choiceButtonActive : null]}
              onPress={() => {
                setSelectedOperationId(operation.id);
                setSelectedWorkOrderId(operation.workOrder.id);
              }}
            >
              <Text style={styles.choiceText}>{operation.workOrder.orderNo}</Text>
              <Text style={styles.muted}>
                {operation.sequenceNo}. {operation.operationName} - {OPERATION_STATUS_LABELS[operation.status] ?? operation.status}
              </Text>
            </Pressable>
          ))}
        </View>
        {!productionCandidates.length ? (
          <Text style={styles.muted}>Üretim girişi için size atanmış hazır, üretimde veya duraklatılmış operasyon yok.</Text>
        ) : null}
        {selectedProductionOperation && selectedProductionWorkOrder ? (
          <View style={styles.productionNotice}>
            <Text style={styles.detailLabel}>Seçili operasyon</Text>
            <Text style={styles.detailValue}>
              {selectedProductionWorkOrder.orderNo} - {selectedProductionOperation.operationName}
            </Text>
            <Text style={styles.muted}>
              {selectedProductionRemaining} adet kaldı, makine: {selectedProductionOperation.machine?.name ?? selectedProductionOperation.machine?.code}
            </Text>
            <Text style={styles.muted}>
              Operasyon üretim/fire: {selectedProductionOperation.producedQuantity}/{selectedProductionOperation.scrapQuantity}
            </Text>
          </View>
        ) : null}
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
          style={[styles.primaryButton, !selectedProductionOperation ? styles.disabledButton : null]}
          onPress={handleProductionEntry}
          disabled={!selectedProductionOperation || isSubmitting}
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
  operationChoiceButton: {
    minWidth: 180,
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#edf1f5",
    borderRadius: 8
  },
  choiceButtonActive: {
    backgroundColor: "#d9f2e8"
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
    gap: 8
  },
  operationCard: {
    gap: 7,
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
  operationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
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
    fontSize: 16,
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
    minHeight: 34,
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
