import { Plus } from "lucide-react";
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
    unit: "pcs",
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
          setError("Products could not be loaded.");
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
        code: form.code,
        name: form.name,
        unit: form.unit,
        ...(form.targetCycleTime ? { targetCycleTime: Number(form.targetCycleTime) } : {})
      });
      setForm({ code: "", name: "", unit: "pcs", targetCycleTime: "" });
      await loadProducts();
    } catch (_error) {
      setError("Product could not be created.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <header className="page-header">
        <div>
          <h1>Products</h1>
          <p>Manage product master data used by work orders.</p>
        </div>
      </header>

      {error ? <p className="form-error">{error}</p> : null}

      <section className="panel">
        <h2>Create Product</h2>
        <form className="work-order-form" onSubmit={handleSubmit}>
          <label>
            Code
            <input value={form.code} onChange={(event) => updateForm("code", event.target.value)} placeholder="PRD-002" required />
          </label>
          <label>
            Name
            <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="Assembly Part" required />
          </label>
          <label>
            Unit
            <input value={form.unit} onChange={(event) => updateForm("unit", event.target.value)} placeholder="pcs" required />
          </label>
          <label>
            Target Cycle Time
            <input value={form.targetCycleTime} onChange={(event) => updateForm("targetCycleTime", event.target.value)} type="number" min="1" placeholder="45" />
          </label>
          <button className="primary-button" type="submit" disabled={isSubmitting}>
            <Plus size={18} />
            {isSubmitting ? "Creating..." : "Create"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Product List</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Unit</th>
                <th>Target Cycle</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.code}</td>
                  <td>{product.name}</td>
                  <td>{product.unit}</td>
                  <td>{product.targetCycleTime ? `${product.targetCycleTime}s` : "-"}</td>
                  <td>
                    <span className={`status-pill ${product.isActive ? "quality-passed" : "status-cancelled"}`}>{product.isActive ? "ACTIVE" : "PASSIVE"}</span>
                  </td>
                </tr>
              ))}
              {!isLoading && products.length === 0 ? (
                <tr>
                  <td colSpan="5">No products yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
