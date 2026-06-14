import { CheckCircle2, Clock3, Package, Plus, Ruler } from "lucide-react";
import { useEffect, useState } from "react";
import { createProduct, getProducts } from "../api/masterData.api.js";

export default function Products() {
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    code: "",
    name: "",
    unit: "adet",
    targetCycleTime: ""
  });

  async function loadProducts() {
    setError("");
    const data = await getProducts();
    setProducts(data);
  }

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const data = await getProducts();

        if (isMounted) {
          setProducts(data);
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

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
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
      await loadProducts();
    } catch (_error) {
      setError("Ürün oluşturulamadı. Ürün kodu daha önce kullanılmış olabilir.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Ürünler</h1>
          <p>İş emirlerinde ve rotalarda kullanılacak ürün ana verilerini yönetin.</p>
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
            <em>İş emri ve rota ana verisi</em>
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
            <small>Çevrim Tanımlı</small>
            <strong>{isLoading ? "..." : products.filter((product) => product.targetCycleTime).length}</strong>
            <em>Planlama için hedef süre girilmiş</em>
          </div>
        </article>
      </section>

      <section className="panel info-panel master-info-panel">
        <div className="chart-card-header">
          <div>
            <h2>Bu ekranda ne tutulur?</h2>
            <p>
              Ürün kartı stok deposu değildir. Burada üretilecek mamul veya yarı mamulün kodu, adı, ölçü birimi ve hedef çevrim süresi tutulur.
              Rota, makine operasyonları ve iş emirleri bu kart üzerinden bağlanır.
            </p>
          </div>
        </div>
      </section>

      <section className="panel master-form-panel">
        <div className="chart-card-header">
          <div>
            <h2>Ürün Oluştur</h2>
            <p>Yeni ürün kartı açarak rotalara ve iş emirlerine bağlanabilir hale getirin.</p>
          </div>
        </div>
        <form className="work-order-form" onSubmit={handleSubmit}>
          <label>
            Ürün Kodu
            <input value={form.code} onChange={(event) => updateForm("code", event.target.value)} placeholder="E2E-AMB-001" required />
          </label>
          <label>
            Ürün Adı
            <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Ambalajlı Final Demo" required />
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
                    <span className={`status-pill ${product.isActive ? "quality-passed" : "status-cancelled"}`}>{product.isActive ? "Aktif" : "Pasif"}</span>
                  </td>
                </tr>
              ))}
              {!isLoading && products.length === 0 ? (
                <tr>
                  <td colSpan="5">Henüz ürün yok.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
