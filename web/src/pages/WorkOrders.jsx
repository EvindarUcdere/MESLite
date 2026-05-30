import { Play, Plus, Square, TimerReset } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getMachines, getProducts, getUsers } from "../api/masterData.api.js";
import { createProductionLog } from "../api/productionLogs.api.js";
import { completeWorkOrder, createWorkOrder, getWorkOrders, pauseWorkOrder, startWorkOrder } from "../api/workOrders.api.js";
import { useAuthStore } from "../store/authStore.js";
import { ROLES } from "../utils/roles.js";

const STATUS_LABELS = {
  PLANNED: "Planlandı",
  IN_PROGRESS: "Üretimde",
  PAUSED: "Duraklatıldı",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal"
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
  const [machines, setMachines] = useState([]);
  const [operators, setOperators] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    orderNo: "",
    productId: "",
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
  const productionCandidates = useMemo(
    () => workOrders.filter((workOrder) => workOrder.status === "IN_PROGRESS" && workOrder.machineId && workOrder.assignedOperatorId),
    [workOrders]
  );
  const canCreateManualProductionLog = user?.role === ROLES.ADMIN;

  async function loadData() {
    setError("");
    const [workOrderData, productData, machineData, userData] = await Promise.all([getWorkOrders(), getProducts(), getMachines(), getUsers()]);
    setWorkOrders(workOrderData);
    setProducts(productData);
    setMachines(machineData);
    setOperators(userData.filter((user) => user.role === "OPERATOR" && user.isActive));
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [workOrderData, productData, machineData, userData] = await Promise.all([getWorkOrders(), getProducts(), getMachines(), getUsers()]);

        if (isMounted) {
          setWorkOrders(workOrderData);
          setProducts(productData);
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

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
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
        ...(form.machineId ? { machineId: form.machineId } : {}),
        ...(form.assignedOperatorId ? { assignedOperatorId: form.assignedOperatorId } : {})
      };

      await createWorkOrder(payload);
      setForm((current) => ({
        ...current,
        orderNo: "",
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

                return (
                  <tr key={workOrder.id}>
                    <td>{workOrder.orderNo}</td>
                    <td>{workOrder.product.name}</td>
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
                );
              })}
              {!isLoading && workOrders.length === 0 ? (
                <tr>
                  <td colSpan="8">Henüz iş emri yok.</td>
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
