import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getMachines, getProducts } from "../api/masterData.api.js";
import { createProductRoute, getProductRoutes } from "../api/productRoutes.api.js";

const emptyOperation = {
  operationName: "",
  defaultMachineId: "",
  estimatedMinutes: "",
  requiresQualityCheck: false
};

export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [products, setProducts] = useState([]);
  const [machines, setMachines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    productId: "",
    name: "",
    description: "",
    operations: [{ ...emptyOperation }]
  });

  async function loadData() {
    const [routeData, productData, machineData] = await Promise.all([getProductRoutes(), getProducts(), getMachines()]);
    setRoutes(routeData);
    setProducts(productData);
    setMachines(machineData);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [routeData, productData, machineData] = await Promise.all([getProductRoutes(), getProducts(), getMachines()]);

        if (isMounted) {
          setRoutes(routeData);
          setProducts(productData);
          setMachines(machineData);
          setForm((current) => ({
            ...current,
            productId: productData[0]?.id ?? ""
          }));
        }
      } catch (_error) {
        if (isMounted) {
          setError("Rotalar yüklenemedi.");
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

  function updateOperation(index, field, value) {
    setForm((current) => ({
      ...current,
      operations: current.operations.map((operation, operationIndex) =>
        operationIndex === index ? { ...operation, [field]: value } : operation
      )
    }));
  }

  function addOperation() {
    setForm((current) => ({
      ...current,
      operations: [...current.operations, { ...emptyOperation }]
    }));
  }

  function removeOperation(index) {
    setForm((current) => ({
      ...current,
      operations: current.operations.filter((_operation, operationIndex) => operationIndex !== index)
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createProductRoute({
        productId: form.productId,
        name: form.name,
        description: form.description || undefined,
        operations: form.operations.map((operation, index) => ({
          operationName: operation.operationName,
          sequenceNo: index + 1,
          defaultMachineId: operation.defaultMachineId || null,
          estimatedMinutes: operation.estimatedMinutes ? Number(operation.estimatedMinutes) : null,
          requiresQualityCheck: operation.requiresQualityCheck
        }))
      });

      setForm({
        productId: products[0]?.id ?? "",
        name: "",
        description: "",
        operations: [{ ...emptyOperation }]
      });
      await loadData();
    } catch (_error) {
      setError("Rota oluşturulamadı. Aynı ürün için rota adı tekrar ediyor olabilir.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Rotalar</h1>
          <p>Ürünlerin hangi operasyonlardan ve makinelerden geçeceğini tanımlayın.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="panel">
        <h2>Rota Oluştur</h2>
        <form className="route-form" onSubmit={handleSubmit}>
          <div className="work-order-form">
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
              Rota Adı
              <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Standart üretim rotası" required />
            </label>
            <label>
              Açıklama
              <input value={form.description} onChange={(event) => updateForm("description", event.target.value)} placeholder="Kesim, montaj ve kalite akışı" />
            </label>
          </div>

          <div className="route-operation-builder">
            <div className="section-title-row">
              <div>
                <h3>Operasyon Adımları</h3>
                <p className="muted-text">Sıra numarası liste sırasına göre otomatik oluşur.</p>
              </div>
              <button className="secondary-button" type="button" onClick={addOperation}>
                <Plus size={16} />
                Adım Ekle
              </button>
            </div>

            {form.operations.map((operation, index) => (
              <div key={index} className="route-operation-row">
                <span className="operation-sequence">{index + 1}</span>
                <label>
                  Operasyon
                  <input
                    value={operation.operationName}
                    onChange={(event) => updateOperation(index, "operationName", event.target.value)}
                    placeholder="Kesim"
                    required
                  />
                </label>
                <label>
                  Varsayılan Makine
                  <select value={operation.defaultMachineId} onChange={(event) => updateOperation(index, "defaultMachineId", event.target.value)}>
                    <option value="">Makine seçilmedi</option>
                    {machines.map((machine) => (
                      <option key={machine.id} value={machine.id}>
                        {machine.code} - {machine.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Tahmini Süre
                  <input
                    value={operation.estimatedMinutes}
                    onChange={(event) => updateOperation(index, "estimatedMinutes", event.target.value)}
                    type="number"
                    min="1"
                    placeholder="30"
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    checked={operation.requiresQualityCheck}
                    onChange={(event) => updateOperation(index, "requiresQualityCheck", event.target.checked)}
                    type="checkbox"
                  />
                  Kalite gerekli
                </label>
                <button
                  className="icon-danger-button"
                  type="button"
                  onClick={() => removeOperation(index)}
                  disabled={form.operations.length === 1}
                  title="Adımı kaldır"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button className="primary-button" type="submit" disabled={isSubmitting || !form.productId}>
            <Plus size={18} />
            {isSubmitting ? "Kaydediliyor..." : "Rotayı Kaydet"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Rota Listesi</h2>
        <div className="route-card-list">
          {routes.map((route) => (
            <article key={route.id} className="route-card">
              <div className="operator-note-header">
                <strong>{route.name}</strong>
                <span>{route.isActive ? "Aktif" : "Pasif"}</span>
              </div>
              <p>
                {route.product.code} - {route.product.name}
              </p>
              <div className="route-steps">
                {route.operations.map((operation) => (
                  <div key={operation.id} className="route-step">
                    <span>{operation.sequenceNo}</span>
                    <div>
                      <strong>{operation.operationName}</strong>
                      <small>
                        {operation.defaultMachine ? `${operation.defaultMachine.code} - ${operation.defaultMachine.name}` : "Makine seçilmedi"}
                        {operation.estimatedMinutes ? ` • ${operation.estimatedMinutes} dk` : ""}
                        {operation.requiresQualityCheck ? " • Kalite kontrol" : ""}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
          {!isLoading && routes.length === 0 ? <p className="empty-state">Henüz rota tanımı yok.</p> : null}
        </div>
      </section>
    </div>
  );
}
