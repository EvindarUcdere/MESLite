import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
  Plus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Wand2
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getProducts } from "../api/masterData.api.js";
import { createSalesOrder, createWorkOrdersFromSalesOrder, getSalesOrderMrp, getSalesOrders } from "../api/salesOrders.api.js";

const emptyItem = {
  productId: "",
  quantity: "1",
  unit: "adet",
  note: ""
};

const steps = [
  { id: 1, title: "Sipariş", description: "Müşteri talebi alınır" },
  { id: 2, title: "MRP Kontrolü", description: "Reçete ve stok doğrulanır" },
  { id: 3, title: "İş Emri", description: "Uygunsa üretime aktarılır" }
];

function toDateTimeLocal(dateValue) {
  if (!dateValue) {
    return "";
  }

  return new Date(dateValue).toLocaleString("sv-SE", { timeZone: "Europe/Istanbul" }).slice(0, 16);
}

function toIsoDateTime(value) {
  return value ? new Date(value).toISOString() : undefined;
}

function formatNumber(value) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(Number(value ?? 0));
}

function statusLabel(status) {
  const labels = {
    DRAFT: "Taslak",
    CONFIRMED: "Onaylandı",
    PLANNED: "Planlandı",
    IN_PRODUCTION: "Üretimde",
    COMPLETED: "Tamamlandı",
    CANCELLED: "İptal"
  };

  return labels[status] ?? status;
}

function getOrderTotalQuantity(order) {
  return order?.items?.reduce((total, item) => total + Number(item.quantity || 0), 0) ?? 0;
}

export default function SalesOrders() {
  const [products, setProducts] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [mrpResult, setMrpResult] = useState(null);
  const [activeStep, setActiveStep] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMrpLoading, setIsMrpLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    orderNo: "",
    customerName: "",
    requestedDate: "",
    dueDate: "",
    note: "",
    items: [{ ...emptyItem }]
  });

  const activeProducts = useMemo(() => products.filter((product) => product.isActive), [products]);
  const selectedOrder = useMemo(() => salesOrders.find((order) => order.id === selectedOrderId), [salesOrders, selectedOrderId]);
  const shortageItems = useMemo(() => mrpResult?.requirements?.filter((item) => !item.isEnough) ?? [], [mrpResult]);
  const createdWorkOrders = selectedOrder?.workOrders ?? [];

  const formTotalQuantity = useMemo(
    () => form.items.reduce((total, item) => total + Number(item.quantity || 0), 0),
    [form.items]
  );

  async function loadMrp(orderId = selectedOrderId) {
    if (!orderId) {
      setMrpResult(null);
      return;
    }

    setIsMrpLoading(true);
    setError("");

    try {
      const data = await getSalesOrderMrp(orderId);
      setMrpResult(data);
    } catch (_error) {
      setError("MRP hesabı yüklenemedi.");
    } finally {
      setIsMrpLoading(false);
    }
  }

  async function loadData(nextSelectedId = selectedOrderId) {
    const [productData, salesOrderData] = await Promise.all([getProducts(), getSalesOrders()]);
    setProducts(productData);
    setSalesOrders(salesOrderData);

    const nextId = nextSelectedId || salesOrderData[0]?.id || "";
    setSelectedOrderId(nextId);

    if (nextId) {
      await loadMrp(nextId);
    } else {
      setMrpResult(null);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [productData, salesOrderData] = await Promise.all([getProducts(), getSalesOrders()]);

        if (!isMounted) {
          return;
        }

        setProducts(productData);
        setSalesOrders(salesOrderData);
        setForm((current) => ({
          ...current,
          items: [{ ...emptyItem, productId: productData.find((product) => product.isActive)?.id ?? "" }]
        }));

        const firstOrderId = salesOrderData[0]?.id || "";
        setSelectedOrderId(firstOrderId);

        if (firstOrderId) {
          const data = await getSalesOrderMrp(firstOrderId);
          if (isMounted) {
            setMrpResult(data);
          }
        }
      } catch (_error) {
        if (isMounted) {
          setError("Satış siparişi verileri yüklenemedi.");
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
    setMessage("");
    setError("");
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateItem(index, field, value) {
    setMessage("");
    setError("");
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    }));
  }

  function addItem() {
    setForm((current) => ({
      ...current,
      items: [...current.items, { ...emptyItem, productId: activeProducts[0]?.id ?? "" }]
    }));
  }

  function removeItem(index) {
    setForm((current) => ({
      ...current,
      items: current.items.length === 1 ? current.items : current.items.filter((_item, itemIndex) => itemIndex !== index)
    }));
  }

  async function selectOrder(orderId) {
    setSelectedOrderId(orderId);
    setActiveStep(2);
    await loadMrp(orderId);
  }

  async function handleCreateSalesOrder(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      const created = await createSalesOrder({
        orderNo: form.orderNo.trim(),
        customerName: form.customerName.trim(),
        requestedDate: toIsoDateTime(form.requestedDate),
        dueDate: toIsoDateTime(form.dueDate),
        note: form.note.trim() || undefined,
        items: form.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unit: item.unit || "adet",
          note: item.note.trim() || undefined
        }))
      });

      setMessage("Satış siparişi oluşturuldu. Şimdi MRP/stok kontrolünü inceleyebilirsiniz.");
      setForm({
        orderNo: "",
        customerName: "",
        requestedDate: "",
        dueDate: "",
        note: "",
        items: [{ ...emptyItem, productId: activeProducts[0]?.id ?? "" }]
      });
      setActiveStep(2);
      await loadData(created.id);
    } catch (submitError) {
      setError(submitError.response?.data?.message ?? "Satış siparişi oluşturulamadı.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateWorkOrders() {
    if (!selectedOrderId || !mrpResult?.isMaterialReady) {
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      await createWorkOrdersFromSalesOrder(selectedOrderId, {
        plannedStartDate: selectedOrder?.requestedDate ?? undefined,
        plannedEndDate: selectedOrder?.dueDate ?? undefined
      });
      setMessage("Satış siparişi üretime aktarıldı. İş emirleri MES ekranında takip edilebilir.");
      setActiveStep(3);
      await loadData(selectedOrderId);
    } catch (submitError) {
      setError(submitError.response?.data?.message ?? "İş emri oluşturulamadı.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p>Yükleniyor...</p>;
  }

  return (
    <div className="page-stack sales-order-page">
      <header className="page-header sales-order-hero">
        <div>
          <span className="dashboard-eyebrow">Satıştan Üretime</span>
          <h1>Satış Siparişleri ve MRP</h1>
          <p>Müşteri talebini önce stok ve reçete ile doğrulayın, sonra güvenli şekilde MES iş emrine dönüştürün.</p>
        </div>
        <button className="secondary-action" type="button" onClick={() => loadData()}>
          <RefreshCw size={16} />
          Yenile
        </button>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {message ? <p className="success-text">{message}</p> : null}

      <section className="sales-flow-shell">
        <div className="sales-flow-steps">
          {steps.map((step) => (
            <button
              className={`sales-flow-step ${activeStep === step.id ? "active" : ""} ${activeStep > step.id ? "done" : ""}`}
              key={step.id}
              type="button"
              onClick={() => setActiveStep(step.id)}
            >
              <span>{step.id}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.description}</small>
              </div>
            </button>
          ))}
        </div>

        <div className="sales-flow-grid">
          <article className="panel sales-flow-main">
            {activeStep === 1 ? (
              <>
                <div className="panel-heading-row sales-section-heading">
                  <div>
                    <h2>Sipariş Bilgisi</h2>
                    <p>Müşteri talebi burada kayıt altına alınır; üretim henüz başlatılmaz.</p>
                  </div>
                  <ShoppingCart size={22} />
                </div>

                <form className="sales-order-form" onSubmit={handleCreateSalesOrder}>
                  <div className="form-grid-two sales-form-grid">
                    <label>
                      Sipariş No
                      <input value={form.orderNo} onChange={(event) => updateForm("orderNo", event.target.value)} placeholder="SO-2026-001" required />
                    </label>
                    <label>
                      Müşteri
                      <input value={form.customerName} onChange={(event) => updateForm("customerName", event.target.value)} placeholder="Demirkaya Otomotiv" required />
                    </label>
                    <label>
                      Plan Başlangıcı
                      <input type="datetime-local" value={form.requestedDate} onChange={(event) => updateForm("requestedDate", event.target.value)} />
                    </label>
                    <label>
                      Teslim Tarihi
                      <input type="datetime-local" value={form.dueDate} onChange={(event) => updateForm("dueDate", event.target.value)} />
                    </label>
                  </div>

                  <label>
                    Not
                    <input value={form.note} onChange={(event) => updateForm("note", event.target.value)} placeholder="Sipariş açıklaması" />
                  </label>

                  <div className="sales-order-items">
                    <div className="panel-heading-row sales-items-heading">
                      <div>
                        <h3>Ürün Kalemleri</h3>
                        <p>{form.items.length} kalem, toplam {formatNumber(formTotalQuantity)} adet</p>
                      </div>
                      <button className="secondary-action" type="button" onClick={addItem}>
                        <Plus size={16} />
                        Kalem Ekle
                      </button>
                    </div>

                    {form.items.map((item, index) => (
                      <div className="sales-order-item-row" key={`${index}-${item.productId}`}>
                        <label className="sales-item-product">
                          Ürün
                          <select value={item.productId} onChange={(event) => updateItem(index, "productId", event.target.value)} required>
                            <option value="">Ürün seç</option>
                            {activeProducts.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.code} - {product.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="sales-item-quantity">
                          Adet
                          <input min="1" type="number" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} required />
                        </label>
                        <label className="sales-item-note">
                          Not
                          <input value={item.note} onChange={(event) => updateItem(index, "note", event.target.value)} placeholder="Opsiyonel" />
                        </label>
                        <button className="icon-text-action sales-item-remove" type="button" onClick={() => removeItem(index)} disabled={form.items.length === 1}>
                          <Trash2 size={16} />
                          Kaldır
                        </button>
                      </div>
                    ))}
                  </div>

                  <button className="primary-action sales-submit-action" type="submit" disabled={isSubmitting}>
                    <PackageCheck size={18} />
                    Siparişi Kaydet ve MRP Kontrolüne Geç
                  </button>
                </form>
              </>
            ) : null}

            {activeStep === 2 ? (
              <>
                <div className="panel-heading-row sales-section-heading">
                  <div>
                    <h2>MRP ve Stok Kontrolü</h2>
                    <p>Ürün reçetesine göre gereken malzemeler hesaplanır ve kullanılabilir stokla karşılaştırılır.</p>
                  </div>
                  {mrpResult?.isMaterialReady ? <CheckCircle2 className="success-icon" /> : <AlertTriangle className="warning-icon" />}
                </div>

                <label className="sales-order-picker">
                  Kontrol edilecek sipariş
                  <select value={selectedOrderId} onChange={(event) => selectOrder(event.target.value)}>
                    <option value="">Sipariş seç</option>
                    {salesOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.orderNo} - {order.customerName}
                      </option>
                    ))}
                  </select>
                </label>

                {isMrpLoading ? <p>MRP hesaplanıyor...</p> : null}

                {mrpResult ? (
                  <>
                    <div className={`mrp-status-card ${mrpResult.isMaterialReady ? "ready" : "blocked"}`}>
                      <strong>{mrpResult.isMaterialReady ? "Stok uygun" : "Eksik malzeme var"}</strong>
                      <span>
                        {mrpResult.isMaterialReady
                          ? "Bu sipariş üretim planına güvenle aktarılabilir."
                          : `${shortageItems.length} malzeme kaleminde eksik var. Eksik kapanmadan iş emri oluşturulmaz.`}
                      </span>
                    </div>

                    <div className="mrp-requirement-list">
                      {mrpResult.requirements.map((item) => (
                        <div className="mrp-requirement-row" key={item.productId}>
                          <div>
                            <strong>{item.code}</strong>
                            <span>{item.name}</span>
                          </div>
                          <div>
                            <small>İhtiyaç</small>
                            <strong>
                              {formatNumber(item.requiredQuantity)} {item.unit}
                            </strong>
                          </div>
                          <div>
                            <small>Kullanılabilir</small>
                            <strong>{formatNumber(item.availableQuantity)}</strong>
                          </div>
                          <span className={`status-pill ${item.isEnough ? "status-ready" : "status-blocked"}`}>
                            {item.isEnough ? "Yeterli" : `${formatNumber(item.shortageQuantity)} eksik`}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="sales-flow-actions">
                      <button className="secondary-action" type="button" onClick={() => setActiveStep(1)}>
                        Siparişe Dön
                      </button>
                      <button className="primary-action" type="button" onClick={() => setActiveStep(3)} disabled={!mrpResult.isMaterialReady}>
                        İş Emri Adımına Geç
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="empty-state-card">MRP görmek için bir satış siparişi seçin.</div>
                )}
              </>
            ) : null}

            {activeStep === 3 ? (
              <>
                <div className="panel-heading-row sales-section-heading">
                  <div>
                    <h2>İş Emrine Dönüştür</h2>
                    <p>Stok uygunsa sipariş kalemleri MES iş emrine çevrilir.</p>
                  </div>
                  <ClipboardList size={22} />
                </div>

                {selectedOrder ? (
                  <div className="sales-order-summary-card">
                    <div>
                      <strong>{selectedOrder.orderNo}</strong>
                      <span>{selectedOrder.customerName}</span>
                    </div>
                    <span className={`status-pill status-${selectedOrder.status?.toLowerCase()}`}>{statusLabel(selectedOrder.status)}</span>
                    <small>Teslim: {selectedOrder.dueDate ? toDateTimeLocal(selectedOrder.dueDate).replace("T", " ") : "-"}</small>
                  </div>
                ) : null}

                <div className={`mrp-status-card ${mrpResult?.isMaterialReady ? "ready" : "blocked"}`}>
                  <strong>{mrpResult?.isMaterialReady ? "Üretime aktarılabilir" : "Önce MRP kontrolü gerekli"}</strong>
                  <span>
                    {mrpResult?.isMaterialReady
                      ? "Backend stok uygunluğunu tekrar kontrol eder ve ardından iş emirlerini oluşturur."
                      : "Eksik malzeme veya seçilmemiş sipariş varken iş emri oluşturulamaz."}
                  </span>
                </div>

                {createdWorkOrders.length ? (
                  <div className="created-work-order-list">
                    <h3>Oluşan İş Emirleri</h3>
                    {createdWorkOrders.map((workOrder) => (
                      <div className="created-work-order-row" key={workOrder.id}>
                        <strong>{workOrder.orderNo}</strong>
                        <span>{workOrder.product?.name}</span>
                        <span className={`status-pill status-${workOrder.status?.toLowerCase()}`}>{workOrder.status}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="sales-flow-actions">
                  <button className="secondary-action" type="button" onClick={() => setActiveStep(2)}>
                    MRP'ye Dön
                  </button>
                  <button className="primary-action" type="button" onClick={handleCreateWorkOrders} disabled={!mrpResult?.isMaterialReady || isSubmitting}>
                    <Wand2 size={18} />
                    İş Emirlerini Oluştur
                  </button>
                </div>
              </>
            ) : null}
          </article>

          <aside className="panel sales-flow-side">
            <h2>Akış Özeti</h2>
            {selectedOrder ? (
              <>
                <div className="sales-order-summary-card">
                  <div>
                    <strong>{selectedOrder.orderNo}</strong>
                    <span>{selectedOrder.customerName}</span>
                  </div>
                  <span className={`status-pill status-${selectedOrder.status?.toLowerCase()}`}>{statusLabel(selectedOrder.status)}</span>
                </div>
                <div className="sales-summary-metrics">
                  <div>
                    <small>Kalem</small>
                    <strong>{selectedOrder.items?.length ?? 0}</strong>
                  </div>
                  <div>
                    <small>Toplam adet</small>
                    <strong>{getOrderTotalQuantity(selectedOrder)}</strong>
                  </div>
                  <div>
                    <small>İş emri</small>
                    <strong>{createdWorkOrders.length}</strong>
                  </div>
                </div>
                <div className={`mrp-status-card ${mrpResult?.isMaterialReady ? "ready" : "blocked"}`}>
                  <strong>{mrpResult?.isMaterialReady ? "MRP uygun" : "MRP bekliyor / eksik"}</strong>
                  <span>{mrpResult ? `${mrpResult.requirements.length} malzeme kalemi kontrol edildi.` : "Sipariş seçip MRP hesaplayın."}</span>
                </div>
              </>
            ) : (
              <div className="empty-state-card">Yeni sipariş oluşturun veya aşağıdaki listeden bir sipariş seçin.</div>
            )}
          </aside>
        </div>
      </section>

      <section className="panel sales-order-list-panel">
        <div className="panel-heading-row">
          <div>
            <h2>Satış Siparişleri</h2>
            <p>Mevcut siparişlerden birini seçerek MRP ve iş emri durumunu takip edin.</p>
          </div>
          <span>{salesOrders.length} kayıt</span>
        </div>
        <div className="modern-table-wrap">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Sipariş</th>
                <th>Müşteri</th>
                <th>Kalem</th>
                <th>Toplam Adet</th>
                <th>Durum</th>
                <th>İş Emri</th>
                <th>Teslim</th>
              </tr>
            </thead>
            <tbody>
              {salesOrders.map((order) => (
                <tr key={order.id} onClick={() => selectOrder(order.id)}>
                  <td className="strong-cell">{order.orderNo}</td>
                  <td>{order.customerName}</td>
                  <td>{order.items.length}</td>
                  <td>{getOrderTotalQuantity(order)}</td>
                  <td>
                    <span className={`status-pill status-${order.status?.toLowerCase()}`}>{statusLabel(order.status)}</span>
                  </td>
                  <td>{order.workOrders?.length ?? 0}</td>
                  <td>{order.dueDate ? toDateTimeLocal(order.dueDate).replace("T", " ") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
