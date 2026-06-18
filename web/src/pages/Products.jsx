import { CheckCircle2, Clock3, Package, Plus, Ruler, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createProduct, getProducts, replaceProductBom } from "../api/masterData.api.js";

const emptyBomItem = {
  componentProductId: "",
  quantity: "1",
  unit: "adet",
  wastePercent: "0",
  note: ""
};

function normalizeBomItem(item) {
  return {
    componentProductId: item.componentProductId,
    quantity: String(Number(item.quantity ?? 1)),
    unit: item.unit || item.componentProduct?.unit || "adet",
    wastePercent: String(Number(item.wastePercent ?? 0)),
    note: item.note ?? ""
  };
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBomSubmitting, setIsBomSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [bomMessage, setBomMessage] = useState("");
  const [selectedBomProductId, setSelectedBomProductId] = useState("");
  const [bomItems, setBomItems] = useState([]);
  const [form, setForm] = useState({
    code: "",
    name: "",
    unit: "adet",
    targetCycleTime: ""
  });

  const selectedBomProduct = useMemo(
    () => products.find((product) => product.id === selectedBomProductId),
    [products, selectedBomProductId]
  );

  const componentOptions = useMemo(
    () => products.filter((product) => product.isActive && product.id !== selectedBomProductId),
    [products, selectedBomProductId]
  );

  const totalWastePercent = useMemo(
    () => bomItems.reduce((total, item) => total + Number(item.wastePercent || 0), 0),
    [bomItems]
  );

  async function loadProducts() {
    setError("");
    const data = await getProducts();
    setProducts(data);
    return data;
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const data = await getProducts();

        if (isMounted) {
          setProducts(data);
          setSelectedBomProductId((current) => current || data[0]?.id || "");
        }
      } catch (_error) {
        if (isMounted) {
          setError("Ürünler yüklenemedi.");
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

  useEffect(() => {
    if (!selectedBomProduct) {
      setBomItems([]);
      return;
    }

    setBomItems((selectedBomProduct.bomItems ?? []).map(normalizeBomItem));
    setBomMessage("");
  }, [selectedBomProduct]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateBomItem(index, field, value) {
    setBomItems((current) =>
      current.map((item, itemIndex) => {
        if (itemIndex !== index) {
          return item;
        }

        if (field === "componentProductId") {
          const component = products.find((product) => product.id === value);
          return {
            ...item,
            componentProductId: value,
            unit: component?.unit || item.unit || "adet"
          };
        }

        return { ...item, [field]: value };
      })
    );
  }

  function addBomItem() {
    setBomMessage("");
    setBomItems((current) => [...current, { ...emptyBomItem }]);
  }

  function removeBomItem(index) {
    setBomMessage("");
    setBomItems((current) => current.filter((_item, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await createProduct({
        code: form.code.trim(),
        name: form.name.trim(),
        unit: form.unit.trim(),
        ...(form.targetCycleTime ? { targetCycleTime: Number(form.targetCycleTime) } : {})
      });
      setForm({ code: "", name: "", unit: "adet", targetCycleTime: "" });
      const data = await loadProducts();
      setSelectedBomProductId((current) => current || data[0]?.id || "");
    } catch (_error) {
      setError("Ürün oluşturulamadı. Ürün kodu daha önce kullanılmış olabilir.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBomSubmit(event) {
    event.preventDefault();

    if (!selectedBomProductId) {
      setBomMessage("Reçete kaydetmek için önce ürün seçin.");
      return;
    }

    const hasEmptyComponent = bomItems.some((item) => !item.componentProductId);
    if (hasEmptyComponent) {
      setBomMessage("Her reçete satırı için bileşen ürün seçmelisiniz.");
      return;
    }

    const duplicateComponentIds = bomItems
      .map((item) => item.componentProductId)
      .filter((componentProductId, index, list) => list.indexOf(componentProductId) !== index);

    if (duplicateComponentIds.length > 0) {
      setBomMessage("Aynı bileşen aynı reçeteye birden fazla kez eklenemez.");
      return;
    }

    setError("");
    setBomMessage("");
    setIsBomSubmitting(true);

    try {
      const updatedProduct = await replaceProductBom(
        selectedBomProductId,
        bomItems.map((item) => ({
          componentProductId: item.componentProductId,
          quantity: Number(item.quantity),
          unit: item.unit.trim(),
          wastePercent: Number(item.wastePercent || 0),
          note: item.note.trim() || undefined
        }))
      );

      setProducts((current) => current.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)));
      setBomMessage("Ürün reçetesi kaydedildi.");
    } catch (_error) {
      setBomMessage("Ürün reçetesi kaydedilemedi. Bileşen, miktar ve fire oranlarını kontrol edin.");
    } finally {
      setIsBomSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Ürünler</h1>
          <p>İş emirlerinde, rotalarda ve malzeme ihtiyaç planlamasında kullanılacak ürün ana verilerini yönetin.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="master-summary-grid">
        <article className="master-summary-card">
          <span className="master-summary-icon">
            <Package size={22} />
          </span>
          <div>
            <small>Toplam Ürün</small>
            <strong>{isLoading ? "..." : products.length}</strong>
            <em>İş emri, rota ve reçete ana verisi</em>
          </div>
        </article>
        <article className="master-summary-card">
          <span className="master-summary-icon master-summary-icon-green">
            <CheckCircle2 size={22} />
          </span>
          <div>
            <small>Aktif Ürün</small>
            <strong>{isLoading ? "..." : products.filter((product) => product.isActive).length}</strong>
            <em>Üretime açılmış ürün kartları</em>
          </div>
        </article>
        <article className="master-summary-card">
          <span className="master-summary-icon master-summary-icon-blue">
            <Clock3 size={22} />
          </span>
          <div>
            <small>Reçeteli Ürün</small>
            <strong>{isLoading ? "..." : products.filter((product) => product.bomItems?.length).length}</strong>
            <em>MRP için bileşen tanımı yapılmış</em>
          </div>
        </article>
      </section>

      <section className="panel info-panel master-info-panel">
        <div className="chart-card-header">
          <div>
            <h2>Bu ekranda ne tutulur?</h2>
            <p>
              Ürün kartı stok deposu değildir. Burada üretilecek mamul veya yarı mamulün kodu, adı, ölçü birimi, hedef çevrim süresi ve reçetesi tutulur.
              Rota, makine operasyonları, iş emirleri ve ileride eklenecek MRP hesapları bu kart üzerinden bağlanır.
            </p>
          </div>
        </div>
      </section>

      <section className="panel master-form-panel">
        <div className="chart-card-header">
          <div>
            <h2>Ürün Oluştur</h2>
            <p>Yeni ürün kartı açarak rotalara, iş emirlerine ve reçete yönetimine bağlanabilir hale getirin.</p>
          </div>
        </div>
        <form className="work-order-form" onSubmit={handleSubmit}>
          <label>
            Ürün Kodu
            <input value={form.code} onChange={(event) => updateForm("code", event.target.value)} placeholder="PRD-AMB-120" required />
          </label>
          <label>
            Ürün Adı
            <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Ambalajlı Final Modül" required />
          </label>
          <label>
            Birim
            <input value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} placeholder="adet" required />
          </label>
          <label>
            Hedef Çevrim Süresi
            <input value={form.targetCycleTime} onChange={(event) => updateForm("targetCycleTime", event.target.value)} type="number" min="1" placeholder="45" />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            <Plus size={18} />
            {isSubmitting ? "Oluşturuluyor..." : "Oluştur"}
          </button>
        </form>
      </section>

      <section className="panel bom-panel">
        <div className="chart-card-header">
          <div>
            <h2>Ürün Reçetesi</h2>
            <p>Bir mamulü üretmek için gereken yarı mamul veya hammadde bileşenlerini tanımlayın.</p>
          </div>
          <button className="secondary-button" type="button" onClick={addBomItem} disabled={!selectedBomProductId}>
            <Plus size={17} />
            Bileşen Ekle
          </button>
        </div>

        <form className="bom-editor" onSubmit={handleBomSubmit}>
          <div className="bom-toolbar">
            <label>
              Reçetesi Düzenlenecek Ürün
              <select value={selectedBomProductId} onChange={(event) => setSelectedBomProductId(event.target.value)}>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.code} - {product.name}
                  </option>
                ))}
              </select>
            </label>
            <article className="bom-summary-card">
              <span>Seçili ürün</span>
              <strong>{selectedBomProduct ? selectedBomProduct.name : "Ürün seçilmedi"}</strong>
              <small>
                {bomItems.length} bileşen · Toplam standart fire oranı %{totalWastePercent.toFixed(2)}
              </small>
            </article>
          </div>

          <div className="bom-row-list">
            {bomItems.map((item, index) => (
              <div className="bom-row" key={`${item.componentProductId || "new"}-${index}`}>
                <label className="bom-component-field">
                  Bileşen Ürün
                  <select value={item.componentProductId} onChange={(event) => updateBomItem(index, "componentProductId", event.target.value)} required>
                    <option value="">Bileşen seçin</option>
                    {componentOptions.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.code} - {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Miktar
                  <input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(event) => updateBomItem(index, "quantity", event.target.value)} required />
                </label>
                <label>
                  Birim
                  <input value={item.unit} onChange={(event) => updateBomItem(index, "unit", event.target.value)} required />
                </label>
                <label>
                  Fire %
                  <input type="number" min="0" max="100" step="0.01" value={item.wastePercent} onChange={(event) => updateBomItem(index, "wastePercent", event.target.value)} />
                </label>
                <label className="bom-note-field">
                  Not
                  <input value={item.note} onChange={(event) => updateBomItem(index, "note", event.target.value)} placeholder="Opsiyonel açıklama" />
                </label>
                <button className="icon-button danger-icon-button" type="button" onClick={() => removeBomItem(index)} aria-label="Bileşeni sil">
                  <Trash2 size={17} />
                </button>
              </div>
            ))}

            {bomItems.length === 0 ? (
              <div className="empty-state-card">
                <strong>Bu ürün için reçete satırı yok.</strong>
                <span>Bileşen ekleyerek MRP ve stok ihtiyaç hesaplarının temelini oluşturabilirsiniz.</span>
              </div>
            ) : null}
          </div>

          {bomMessage ? <p className={bomMessage.includes("kaydedildi") ? "form-success" : "form-error"}>{bomMessage}</p> : null}

          <button className="primary-button bom-save-button" type="submit" disabled={isBomSubmitting || !selectedBomProductId}>
            <Save size={18} />
            {isBomSubmitting ? "Kaydediliyor..." : "Reçeteyi Kaydet"}
          </button>
        </form>
      </section>

      <section className="panel production-log-panel">
        <div className="chart-card-header">
          <div>
            <h2>Ürün Listesi</h2>
            <p>Üretimde kullanılacak ürün ana verilerini ve planlama parametrelerini görüntüleyin.</p>
          </div>
          <span className="record-count">{products.length} ürün</span>
        </div>
        <div className="table-wrap dashboard-table-wrap">
          <table className="dashboard-data-table master-data-table">
            <thead>
              <tr>
                <th>Kod</th>
                <th>Ad</th>
                <th>Birim</th>
                <th>Hedef Çevrim</th>
                <th>Reçete</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>
                    <strong className="table-primary">{product.code}</strong>
                  </td>
                  <td>
                    <span className="table-secondary">{product.name}</span>
                  </td>
                  <td>
                    <span className="machine-code-chip">
                      <Ruler size={13} />
                      {product.unit}
                    </span>
                  </td>
                  <td>{product.targetCycleTime ? <span className="quantity-chip quantity-produced">{product.targetCycleTime} sn</span> : "-"}</td>
                  <td>
                    {product.bomItems?.length ? (
                      <span className="quantity-chip quantity-produced">{product.bomItems.length} bileşen</span>
                    ) : (
                      <span className="table-secondary">Tanımsız</span>
                    )}
                  </td>
                  <td>
                    <span className={`status-pill ${product.isActive ? "quality-passed" : "status-cancelled"}`}>{product.isActive ? "Aktif" : "Pasif"}</span>
                  </td>
                </tr>
              ))}
              {!isLoading && products.length === 0 ? (
                <tr>
                  <td colSpan="6">Henüz ürün yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
